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

  /** Sesión de caja abierta más reciente del cajero. */
  current(usuarioId: string) {
    return this.prisma.cashSession.findFirst({
      where: { status: CashSessionStatus.ABIERTA, openedById: usuarioId },
      orderBy: { openedAt: "desc" },
      include: { movimientos: { orderBy: { createdAt: "desc" } } },
    });
  }

  async open(dto: OpenSessionDto, usuarioId: string) {
    const abierta = await this.current(usuarioId);
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

    const sum = (pred: (m: (typeof movimientos)[number]) => boolean) =>
      movimientos.filter(pred).reduce((a, m) => a + num(m.monto), 0);

    // Sólo el efectivo afecta el cajón físico.
    const ventasEfectivo = sum(
      (m) => m.tipo === CashMovementType.SALE && m.metodoPago === PaymentMethod.EFECTIVO,
    );
    const ingresos = sum((m) => m.tipo === CashMovementType.IN);
    const egresos = sum(
      (m) =>
        m.tipo === CashMovementType.OUT ||
        m.tipo === CashMovementType.WITHDRAWAL ||
        m.tipo === CashMovementType.EXPENSE,
    );
    const expected = round2(
      num(session.openingFloat) + ventasEfectivo + ingresos - egresos,
    );
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
    const conciliacion: Record<string, number> = {};
    for (const m of movimientos) {
      if (m.tipo !== CashMovementType.SALE) continue;
      const k = m.metodoPago ?? "SIN_MEDIO";
      conciliacion[k] = round2((conciliacion[k] ?? 0) + num(m.monto));
    }

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
