import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { AuthUser, ReservaStatus, TableStatus, UserRole } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser, Public, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

class FicharKioscoDto {
  @IsInt() @Min(1) numeroEmpleado!: number;
  @IsString() pin!: string;
  /** Identificador del tablet (se genera y guarda en el dispositivo). */
  @IsOptional() @IsString() deviceId?: string;
  @IsOptional() @IsString() deviceNombre?: string;
}

class VincularDto {
  @IsOptional() @IsInt() @Min(1) @Max(60) minutos?: number;
}

class ToleranciaDto {
  @IsInt() @Min(0) @Max(120) minutos!: number;
}

class HorarioDto {
  @IsString() usuarioId!: string;
  @IsInt() @Min(0) @Max(6) diaSemana!: number;
  @IsOptional() @IsString() horaInicio?: string;
  @IsOptional() @IsString() horaFin?: string;
}

class SetPinDto {
  @IsString() pin!: string;
}

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

  // ───────────────────── Kiosco de fichaje (tablet) ─────────────────────
  /** Config del kiosco (singleton). La crea la primera vez. */
  async getKiosco() {
    const k = await this.prisma.kioscoFichaje.findUnique({ where: { id: "default" } });
    return k ?? this.prisma.kioscoFichaje.create({ data: { id: "default" } });
  }

  /** Invalida el token anterior del tablet. */
  async rotarKiosco() {
    await this.getKiosco();
    return this.prisma.kioscoFichaje.update({
      where: { id: "default" },
      data: { token: randomUUID() },
    });
  }

  private async validarKiosco(token: string) {
    const k = await this.prisma.kioscoFichaje.findUnique({ where: { token } });
    if (!k) throw new NotFoundException("Dispositivo de fichaje no autorizado");
    return k;
  }

  /** Abre una ventana (minutos) para vincular el próximo tablet que se use. */
  async abrirVinculacion(minutos = 10) {
    await this.getKiosco();
    return this.prisma.kioscoFichaje.update({
      where: { id: "default" },
      data: { vinculacionHasta: new Date(Date.now() + minutos * 60_000) },
    });
  }

  /** Desvincula el tablet actual: nadie puede fichar hasta vincular otro. */
  async quitarDispositivo() {
    await this.getKiosco();
    return this.prisma.kioscoFichaje.update({
      where: { id: "default" },
      data: { deviceId: null, deviceNombre: null, deviceUltimoUso: null, vinculacionHasta: null },
    });
  }

  async setTolerancia(minutos: number) {
    await this.getKiosco();
    return this.prisma.kioscoFichaje.update({
      where: { id: "default" },
      data: { toleranciaMin: minutos },
    });
  }

  /**
   * Sólo el tablet vinculado puede fichar. Si no hay ninguno y la ventana de
   * vinculación está abierta, este dispositivo queda registrado.
   */
  private async autorizarDispositivo(
    kiosco: { deviceId: string | null; vinculacionHasta: Date | null },
    deviceId?: string,
    nombre?: string,
  ) {
    if (!deviceId) throw new BadRequestException("Dispositivo no identificado.");
    if (kiosco.deviceId) {
      if (kiosco.deviceId !== deviceId) {
        throw new ForbiddenException(
          "Este dispositivo no está autorizado para fichar. Usá el tablet del local.",
        );
      }
      await this.prisma.kioscoFichaje.update({
        where: { id: "default" },
        data: { deviceUltimoUso: new Date() },
      });
      return;
    }
    const ventanaAbierta = !!kiosco.vinculacionHasta && kiosco.vinculacionHasta > new Date();
    if (!ventanaAbierta) {
      throw new ForbiddenException(
        "No hay un tablet autorizado. Pedile al administrador que habilite este dispositivo.",
      );
    }
    await this.prisma.kioscoFichaje.update({
      where: { id: "default" },
      data: {
        deviceId,
        deviceNombre: nombre?.slice(0, 80) || "Tablet del local",
        deviceUltimoUso: new Date(),
        vinculacionHasta: null,
      },
    });
  }

  /** Horario previsto del usuario para ese día, si tiene uno cargado. */
  private horarioDelDia(usuarioId: string, fecha: Date) {
    return this.prisma.horarioTrabajo.findUnique({
      where: { usuarioId_diaSemana: { usuarioId, diaSemana: fecha.getDay() } },
    });
  }

  /** Minutos entre una hora "HH:MM" del día de `ref` y `ref`. */
  private diffMin(ref: Date, hhmm: string) {
    const [h, m] = hhmm.split(":").map(Number);
    const prevista = new Date(ref);
    prevista.setHours(h ?? 0, m ?? 0, 0, 0);
    return Math.round((ref.getTime() - prevista.getTime()) / 60000);
  }

  /**
   * Fichaje desde el tablet: número de empleado + PIN. Alterna entrada/salida
   * según si la persona tiene un turno abierto.
   */
  async ficharKiosco(
    token: string,
    numeroEmpleado: number,
    pin: string,
    deviceId?: string,
    deviceNombre?: string,
  ) {
    const kiosco = await this.validarKiosco(token);
    await this.autorizarDispositivo(kiosco, deviceId, deviceNombre);

    const usuario = await this.prisma.usuario.findUnique({ where: { numeroEmpleado } });
    // Mensaje genérico: no revela si el número existe.
    const invalido = new BadRequestException("Número o PIN incorrecto.");
    if (!usuario || !usuario.activo || !usuario.pinHash) throw invalido;
    const ok = await bcrypt.compare(pin, usuario.pinHash);
    if (!ok) throw invalido;

    const ahora = new Date();
    const horario = await this.horarioDelDia(usuario.id, ahora);
    const tol = kiosco.toleranciaMin ?? 10;
    const abierto = await this.turnoActual(usuario.id);

    if (abierto) {
      // Salida: ¿se fue antes de la hora prevista?
      let minutosAntes: number | null = null;
      if (abierto.horarioFin) {
        const diff = this.diffMin(ahora, abierto.horarioFin); // negativo = antes
        minutosAntes = diff < -tol ? Math.abs(diff) : 0;
      }
      const t = await this.prisma.shift.update({
        where: { id: abierto.id },
        data: { fin: ahora, minutosAntes },
      });
      const horas = Math.round(((t.fin!.getTime() - t.inicio.getTime()) / 3600000) * 100) / 100;
      return {
        accion: "salida" as const,
        nombre: usuario.nombre,
        hora: t.fin,
        horas,
        minutosAntes,
        minutosTarde: null,
      };
    }

    // Entrada: ¿llegó tarde respecto de su horario?
    let minutosTarde: number | null = null;
    if (horario) {
      const diff = this.diffMin(ahora, horario.horaInicio); // positivo = tarde
      minutosTarde = diff > tol ? diff : 0;
    }
    const t = await this.prisma.shift.create({
      data: {
        usuarioId: usuario.id,
        inicio: ahora,
        minutosTarde,
        horarioInicio: horario?.horaInicio ?? null,
        horarioFin: horario?.horaFin ?? null,
      },
    });
    return {
      accion: "entrada" as const,
      nombre: usuario.nombre,
      hora: t.inicio,
      horas: null,
      minutosTarde,
      minutosAntes: null,
    };
  }

  // ─────────────────── Horarios previstos por trabajador ───────────────────
  listHorarios(usuarioId?: string) {
    return this.prisma.horarioTrabajo.findMany({
      where: usuarioId ? { usuarioId } : {},
      orderBy: [{ usuarioId: "asc" }, { diaSemana: "asc" }],
      include: { usuario: { select: { id: true, nombre: true, numeroEmpleado: true } } },
    });
  }

  /** Define (o quita, con horas vacías) el horario de un día para un usuario. */
  async setHorario(usuarioId: string, diaSemana: number, horaInicio?: string, horaFin?: string) {
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!horaInicio || !horaFin) {
      await this.prisma.horarioTrabajo
        .delete({ where: { usuarioId_diaSemana: { usuarioId, diaSemana } } })
        .catch(() => undefined); // no existía
      return { ok: true, borrado: true };
    }
    if (!hhmm.test(horaInicio) || !hhmm.test(horaFin)) {
      throw new BadRequestException("Las horas deben tener el formato HH:MM.");
    }
    return this.prisma.horarioTrabajo.upsert({
      where: { usuarioId_diaSemana: { usuarioId, diaSemana } },
      create: { usuarioId, diaSemana, horaInicio, horaFin },
      update: { horaInicio, horaFin },
    });
  }

  /** Define o cambia el PIN de fichaje de un usuario (4 a 6 dígitos). */
  async setPin(usuarioId: string, pin: string) {
    if (!/^\d{4,6}$/.test(pin)) {
      throw new BadRequestException("El PIN debe tener entre 4 y 6 dígitos.");
    }
    const u = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!u) throw new NotFoundException("Usuario no encontrado");
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { pinHash: await bcrypt.hash(pin, 10) },
    });
    return { ok: true, numeroEmpleado: u.numeroEmpleado };
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

  // ---- Kiosco de fichaje (admin) ----
  @Roles(UserRole.ADMIN)
  @Get("turnos/kiosco")
  kiosco() {
    return this.svc.getKiosco();
  }

  @Roles(UserRole.ADMIN)
  @Post("turnos/kiosco/rotar")
  rotarKiosco() {
    return this.svc.rotarKiosco();
  }

  @Roles(UserRole.ADMIN)
  @Post("turnos/kiosco/vincular")
  vincular(@Body() dto: VincularDto) {
    return this.svc.abrirVinculacion(dto.minutos ?? 10);
  }

  @Roles(UserRole.ADMIN)
  @Delete("turnos/kiosco/dispositivo")
  quitarDispositivo() {
    return this.svc.quitarDispositivo();
  }

  @Roles(UserRole.ADMIN)
  @Patch("turnos/kiosco/tolerancia")
  tolerancia(@Body() dto: ToleranciaDto) {
    return this.svc.setTolerancia(dto.minutos);
  }

  // ---- Horarios previstos ----
  @Roles(UserRole.ADMIN, UserRole.CAJERO)
  @Get("horarios")
  listHorarios(@Query("usuarioId") usuarioId?: string) {
    return this.svc.listHorarios(usuarioId);
  }

  @Roles(UserRole.ADMIN)
  @Put("horarios")
  setHorario(@Body() dto: HorarioDto) {
    return this.svc.setHorario(dto.usuarioId, dto.diaSemana, dto.horaInicio, dto.horaFin);
  }

  @Roles(UserRole.ADMIN)
  @Post("usuarios/:id/pin")
  setPin(@Param("id") id: string, @Body() dto: SetPinDto) {
    return this.svc.setPin(id, dto.pin);
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

/** Endpoint público del tablet de fichaje, validado por el token del kiosco. */
@Public()
@Controller("fichaje")
class FichajeController {
  constructor(private readonly svc: StaffService) {}

  @Post(":token")
  fichar(@Param("token") token: string, @Body() dto: FicharKioscoDto) {
    return this.svc.ficharKiosco(token, dto.numeroEmpleado, dto.pin, dto.deviceId, dto.deviceNombre);
  }
}

@Module({
  controllers: [StaffController, FichajeController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
