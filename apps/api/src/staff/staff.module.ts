import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { AuthUser, ReservaStatus, TableStatus, UserRole } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

class CreateReservaDto {
  @IsString() nombre!: string;
  @IsDateString() fechaHora!: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsInt() @Min(1) personas?: number;
  @IsOptional() @IsString() mesaId?: string | null;
  @IsOptional() @IsString() notas?: string;
}

class UpdateReservaDto {
  @IsOptional() @IsString() nombre?: string;
  @IsOptional() @IsDateString() fechaHora?: string;
  @IsOptional() @IsString() telefono?: string | null;
  @IsOptional() @IsInt() @Min(1) personas?: number;
  @IsOptional() @IsString() mesaId?: string | null;
  @IsOptional() @IsEnum(ReservaStatus) status?: ReservaStatus;
  @IsOptional() @IsString() notas?: string | null;
}

// ─────────────────────────── Turnos (fichaje) ───────────────────────────

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  /** Turno abierto del usuario (si está fichado). */
  turnoActual(usuarioId: string) {
    return this.prisma.shift.findFirst({
      where: { usuarioId, fin: null },
      orderBy: { inicio: "desc" },
    });
  }

  async ficharEntrada(usuarioId: string) {
    const abierto = await this.turnoActual(usuarioId);
    if (abierto) throw new BadRequestException("Ya tenés un turno abierto.");
    return this.prisma.shift.create({ data: { usuarioId } });
  }

  async ficharSalida(usuarioId: string) {
    const abierto = await this.turnoActual(usuarioId);
    if (!abierto) throw new BadRequestException("No tenés un turno abierto.");
    return this.prisma.shift.update({
      where: { id: abierto.id },
      data: { fin: new Date() },
    });
  }

  /** Turnos de los últimos `dias` (todos los usuarios), con horas trabajadas. */
  async listTurnos(dias = 14) {
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);
    const turnos = await this.prisma.shift.findMany({
      where: { inicio: { gte: desde } },
      orderBy: { inicio: "desc" },
      include: { usuario: { select: { id: true, nombre: true, role: true } } },
      take: 300,
    });
    return turnos.map((t) => ({
      ...t,
      horas: t.fin
        ? Math.round(((t.fin.getTime() - t.inicio.getTime()) / 3600000) * 100) / 100
        : null,
    }));
  }

  /** Quién está trabajando ahora. */
  enTurno() {
    return this.prisma.shift.findMany({
      where: { fin: null },
      orderBy: { inicio: "asc" },
      include: { usuario: { select: { id: true, nombre: true, role: true } } },
    });
  }

  // ───────────────────────────── Reservas ─────────────────────────────

  /** Reservas de un día (por defecto hoy) o por estado. */
  listReservas(fecha?: string, status?: ReservaStatus) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (fecha) {
      const desde = new Date(`${fecha}T00:00:00`);
      const hasta = new Date(`${fecha}T23:59:59.999`);
      where.fechaHora = { gte: desde, lte: hasta };
    }
    return this.prisma.reserva.findMany({
      where,
      orderBy: { fechaHora: "asc" },
      include: { mesa: { select: { id: true, numero: true, capacidad: true } } },
      take: 200,
    });
  }

  async createReserva(dto: CreateReservaDto) {
    const fechaHora = new Date(dto.fechaHora);
    if (dto.mesaId) await this.validarMesaLibre(dto.mesaId, fechaHora);
    return this.prisma.reserva.create({
      data: {
        nombre: dto.nombre,
        telefono: dto.telefono,
        personas: dto.personas ?? 2,
        fechaHora,
        mesaId: dto.mesaId ?? null,
        notas: dto.notas,
      },
      include: { mesa: true },
    });
  }

  async updateReserva(id: string, dto: UpdateReservaDto) {
    const r = await this.getReserva(id);
    const fechaHora = dto.fechaHora ? new Date(dto.fechaHora) : r.fechaHora;
    const mesaId = dto.mesaId !== undefined ? dto.mesaId : r.mesaId;
    if (mesaId && (dto.mesaId !== undefined || dto.fechaHora)) {
      await this.validarMesaLibre(mesaId, fechaHora, id);
    }

    const reserva = await this.prisma.reserva.update({
      where: { id },
      data: { ...dto, fechaHora, mesaId },
      include: { mesa: true },
    });

    // Al sentar a los comensales, la mesa pasa a ocupada; al cancelar o
    // marcar no-show, se libera si estaba reservada para esta reserva.
    if (reserva.mesaId) {
      if (dto.status === ReservaStatus.SENTADA) {
        await this.prisma.mesa.update({
          where: { id: reserva.mesaId },
          data: { status: TableStatus.OCUPADA },
        });
      } else if (dto.status === ReservaStatus.CANCELADA || dto.status === ReservaStatus.NO_SHOW) {
        const mesa = await this.prisma.mesa.findUnique({ where: { id: reserva.mesaId } });
        if (mesa?.status === TableStatus.RESERVADA) {
          await this.prisma.mesa.update({
            where: { id: reserva.mesaId },
            data: { status: TableStatus.LIBRE },
          });
        }
      }
    }
    return reserva;
  }

  async removeReserva(id: string) {
    await this.getReserva(id);
    await this.prisma.reserva.delete({ where: { id } });
    return { ok: true };
  }

  private async getReserva(id: string) {
    const r = await this.prisma.reserva.findUnique({ where: { id } });
    if (!r) throw new NotFoundException("Reserva no encontrada");
    return r;
  }

  /** Evita dos reservas activas para la misma mesa dentro de ±2 h. */
  private async validarMesaLibre(mesaId: string, fechaHora: Date, exceptoId?: string) {
    const margen = 2 * 60 * 60 * 1000;
    const choque = await this.prisma.reserva.findFirst({
      where: {
        mesaId,
        id: exceptoId ? { not: exceptoId } : undefined,
        status: { in: [ReservaStatus.PENDIENTE, ReservaStatus.CONFIRMADA] },
        fechaHora: {
          gte: new Date(fechaHora.getTime() - margen),
          lte: new Date(fechaHora.getTime() + margen),
        },
      },
      include: { mesa: true },
    });
    if (choque) {
      throw new BadRequestException(
        `La mesa ${choque.mesa?.numero ?? ""} ya tiene una reserva cerca de ese horario (${choque.fechaHora.toLocaleString("es-UY")}).`,
      );
    }
  }
}

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CAJERO, UserRole.MOZO, UserRole.PRODUCCION)
@Controller("admin")
class StaffController {
  constructor(private readonly svc: StaffService) {}

  // ---- Turnos ----
  @Get("turnos/actual")
  turnoActual(@CurrentUser() user: AuthUser) {
    return this.svc.turnoActual(user.id);
  }

  @Post("turnos/entrada")
  entrada(@CurrentUser() user: AuthUser) {
    return this.svc.ficharEntrada(user.id);
  }

  @Post("turnos/salida")
  salida(@CurrentUser() user: AuthUser) {
    return this.svc.ficharSalida(user.id);
  }

  @Get("turnos/en-turno")
  enTurno() {
    return this.svc.enTurno();
  }

  @Roles(UserRole.ADMIN, UserRole.CAJERO)
  @Get("turnos")
  listTurnos(@Query("dias") dias?: string) {
    return this.svc.listTurnos(dias ? Number(dias) : 14);
  }

  // ---- Reservas ----
  @Get("reservas")
  listReservas(@Query("fecha") fecha?: string, @Query("status") status?: ReservaStatus) {
    return this.svc.listReservas(fecha, status);
  }

  @Post("reservas")
  createReserva(@Body() dto: CreateReservaDto) {
    return this.svc.createReserva(dto);
  }

  @Patch("reservas/:id")
  updateReserva(@Param("id") id: string, @Body() dto: UpdateReservaDto) {
    return this.svc.updateReserva(id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.CAJERO)
  @Delete("reservas/:id")
  removeReserva(@Param("id") id: string) {
    return this.svc.removeReserva(id);
  }
}

@Module({
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
