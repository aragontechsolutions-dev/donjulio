import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";
import {
  AuthUser,
  CashMovementType,
  CashSessionStatus,
  PaymentMethod,
  UserRole,
  conciliacionPorMedio,
  resumirCaja,
} from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === "number" ? d : d.toNumber();
const round2 = (n: number) => Math.round(n * 100) / 100;

class OpenSessionDto {
  @IsNumber() @Min(0) openingFloat!: number;
  @IsOptional() @IsString() etiqueta?: string;
}

class MovementDto {
  @IsEnum(CashMovementType) tipo!: CashMovementType;
  @IsOptional() @IsEnum(PaymentMethod) metodoPago?: PaymentMethod;
  @IsNumber() @Min(0) monto!: number;
  @IsOptional() @IsString() referencia?: string;
}

class CloseSessionDto {
  @IsNumber() @Min(0) closingCount!: number;
  @IsOptional() @IsString() justificacion?: string;
}

// Margen aceptable de descuadre (redondeos). Configurable por env CASH_TOLERANCE.
const CASH_TOLERANCE = Number(process.env.CASH_TOLERANCE ?? 20);

@Injectable()
export class CashService {
  constructor(private prisma: PrismaService) {}

  /**
   * Sesión de caja abierta más reciente del cajero, con el arqueo en vivo.
   *
   * El resumen viaja calculado desde acá para que el panel muestre el mismo
   * reparto efectivo / no efectivo que va a aplicar el cierre, y para que el
   * refresco automático traiga los cobros que entran por la PWA.
   */
  async current(usuarioId: string) {
    const session = await this.prisma.cashSession.findFirst({
      where: { status: CashSessionStatus.ABIERTA, openedById: usuarioId },
      orderBy: { openedAt: "desc" },
      include: { movimientos: { orderBy: { createdAt: "desc" } } },
    });
    if (!session) return null;
    return {
      ...session,
      resumen: resumirCaja(
        session.movimientos.map((m) => ({
          tipo: m.tipo,
          metodoPago: m.metodoPago,
          monto: num(m.monto),
        })),
        num(session.openingFloat),
      ),
      tolerance: CASH_TOLERANCE,
      // Marca de tiempo del servidor: el panel la usa para avisar cuándo se
      // actualizó por última vez sin depender del reloj del navegador.
      actualizadoEn: new Date().toISOString(),
    };
  }

  async open(dto: OpenSessionDto, usuarioId: string) {
    const abierta = await this.prisma.cashSession.findFirst({
      where: { status: CashSessionStatus.ABIERTA, openedById: usuarioId },
      select: { id: true },
    });
    if (abierta) {
      throw new BadRequestException("Ya tenés una caja abierta. Cerrala primero.");
    }
    return this.prisma.cashSession.create({
      data: {
        openedById: usuarioId,
        openingFloat: dto.openingFloat,
        etiqueta: dto.etiqueta,
      },
    });
  }

  async addMovement(sessionId: string, dto: MovementDto, usuarioId?: string) {
    const session = await this.getOpen(sessionId);
    return this.prisma.cashMovement.create({
      data: {
        cashSessionId: session.id,
        tipo: dto.tipo,
        metodoPago: dto.metodoPago,
        monto: dto.monto,
        referencia: dto.referencia,
        usuarioId,
      },
    });
  }

  /** Cierre con arqueo: efectivo esperado, diferencia y conciliación por medio. */
  async close(sessionId: string, dto: CloseSessionDto, usuarioId: string) {
    const session = await this.getOpen(sessionId);
    const movimientos = await this.prisma.cashMovement.findMany({
      where: { cashSessionId: sessionId },
    });

    // Sólo el efectivo afecta el cajón físico: débito, crédito y QR se
    // concilian contra el POS / Mercado Pago, no contra la plata contada.
    const resumen = resumirCaja(
      movimientos.map((m) => ({
        tipo: m.tipo,
        metodoPago: m.metodoPago,
        monto: num(m.monto),
      })),
      num(session.openingFloat),
    );
    const expected = resumen.efectivoEsperado;
    const difference = round2(dto.closingCount - expected);

    // Fuera de tolerancia exige un motivo del descuadre para poder cerrar.
    const fueraDeTolerancia = Math.abs(difference) > CASH_TOLERANCE;
    const justificacion = dto.justificacion?.trim();
    if (fueraDeTolerancia && !justificacion) {
      throw new BadRequestException(
        `El descuadre es de ${difference > 0 ? "+" : ""}${difference} (tolerancia ±${CASH_TOLERANCE}). Ingresá un motivo para cerrar la caja.`,
      );
    }

    // Conciliación de ventas por medio de pago (todos los medios).
    const conciliacion = conciliacionPorMedio(
      movimientos.map((m) => ({
        tipo: m.tipo,
        metodoPago: m.metodoPago,
        monto: num(m.monto),
      })),
    );

    const updated = await this.prisma.cashSession.update({
      where: { id: sessionId },
      data: {
        status: CashSessionStatus.CERRADA,
        closedById: usuarioId,
        closedAt: new Date(),
        closingCount: dto.closingCount,
        expected,
        difference,
        justificacion: justificacion || null,
      },
    });

    return {
      session: updated,
      expected,
      difference,
      conciliacion,
      resumen,
      tolerance: CASH_TOLERANCE,
      cuadra: !fueraDeTolerancia,
      justificacion: justificacion || null,
    };
  }

  history() {
    return this.prisma.cashSession.findMany({
      where: { status: CashSessionStatus.CERRADA },
      orderBy: { closedAt: "desc" },
      take: 50,
      include: { openedBy: true, closedBy: true },
    });
  }

  /** ¿Hay alguna caja abierta en el turno? (para habilitar cobros en la PWA). */
  async estado() {
    const s = await this.prisma.cashSession.findFirst({
      where: { status: CashSessionStatus.ABIERTA },
      orderBy: { openedAt: "desc" },
    });
    return { abierta: !!s, etiqueta: s?.etiqueta ?? null };
  }

  private async getOpen(id: string) {
    const s = await this.prisma.cashSession.findUnique({ where: { id } });
    if (!s) throw new NotFoundException("Caja no encontrada");
    if (s.status !== CashSessionStatus.ABIERTA) {
      throw new BadRequestException("La caja ya está cerrada");
    }
    return s;
  }
}

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CAJERO)
@Controller("admin/caja")
class CashController {
  constructor(private readonly cash: CashService) {}

  @Get("config")
  config() {
    return { tolerance: CASH_TOLERANCE };
  }

  /** Estado de caja del turno; accesible también al mozo (PWA) para habilitar cobros. */
  @Roles(UserRole.ADMIN, UserRole.CAJERO, UserRole.MOZO)
  @Get("estado")
  estado() {
    return this.cash.estado();
  }

  @Get("actual")
  current(@CurrentUser() user: AuthUser) {
    return this.cash.current(user.id);
  }

  @Get("historial")
  history() {
    return this.cash.history();
  }

  @Post("abrir")
  open(@Body() dto: OpenSessionDto, @CurrentUser() user: AuthUser) {
    return this.cash.open(dto, user.id);
  }

  @Post(":id/movimiento")
  movement(
    @Param("id") id: string,
    @Body() dto: MovementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cash.addMovement(id, dto, user.id);
  }

  @Post(":id/cerrar")
  close(
    @Param("id") id: string,
    @Body() dto: CloseSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cash.close(id, dto, user.id);
  }
}

@Module({
  controllers: [CashController],
  providers: [CashService],
  exports: [CashService],
})
export class CashModule {}
