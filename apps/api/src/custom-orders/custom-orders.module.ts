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
import { Prisma } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import {
  AuthUser,
  CashMovementType,
  CashSessionStatus,
  CustomOrderStatus,
  PaymentMethod,
  UserRole,
} from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === "number" ? d : d.toNumber();
const round2 = (n: number) => Math.round(n * 100) / 100;

class ClienteEncargoDto {
  @IsString() nombre!: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() email?: string;
}

class CreateCustomOrderDto {
  @IsString() descripcion!: string;
  @IsDateString() pickupAt!: string;
  @IsNumber() @Min(0) precioTotal!: number;
  @IsOptional() @IsInt() @Min(1) porciones?: number;
  @IsOptional() @IsString() notas?: string;
  @IsOptional() @ValidateNested() @Type(() => ClienteEncargoDto) cliente?: ClienteEncargoDto;
  /** Seña cobrada al reservar (opcional). */
  @IsOptional() @IsNumber() @Min(0) senia?: number;
  @IsOptional() @IsEnum(PaymentMethod) metodoSenia?: PaymentMethod;
}

class UpdateCustomOrderDto {
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsDateString() pickupAt?: string;
  @IsOptional() @IsNumber() @Min(0) precioTotal?: number;
  @IsOptional() @IsInt() @Min(1) porciones?: number;
  @IsOptional() @IsString() notas?: string;
  @IsOptional() @IsEnum(CustomOrderStatus) status?: CustomOrderStatus;
}

class DepositoDto {
  @IsNumber() @Min(0.01) monto!: number;
  @IsEnum(PaymentMethod) metodo!: PaymentMethod;
}

@Injectable()
export class CustomOrdersService {
  constructor(private prisma: PrismaService) {}

  list(status?: CustomOrderStatus) {
    return this.prisma.customOrder.findMany({
      where: status ? { status } : {},
      orderBy: { pickupAt: "asc" },
      include: { cliente: true, depositos: { orderBy: { createdAt: "asc" } } },
      take: 200,
    });
  }

  async get(id: string) {
    const o = await this.prisma.customOrder.findUnique({
      where: { id },
      include: { cliente: true, depositos: { orderBy: { createdAt: "asc" } } },
    });
    if (!o) throw new NotFoundException("Encargo no encontrado");
    return o;
  }

  async create(dto: CreateCustomOrderDto, usuarioId: string) {
    // Cliente opcional (con consentimiento declarado — Ley 18.331).
    let clienteId: string | undefined;
    if (dto.cliente?.nombre) {
      const c = await this.prisma.cliente.create({
        data: {
          nombre: dto.cliente.nombre,
          telefono: dto.cliente.telefono,
          email: dto.cliente.email,
          consentimientoDatos: true,
          consentimientoAt: new Date(),
        },
      });
      clienteId = c.id;
    }

    const senia = dto.senia ?? 0;
    if (senia > dto.precioTotal) {
      throw new BadRequestException("La seña no puede superar el precio total.");
    }

    const encargo = await this.prisma.customOrder.create({
      data: {
        clienteId,
        descripcion: dto.descripcion,
        porciones: dto.porciones,
        pickupAt: new Date(dto.pickupAt),
        precioTotal: dto.precioTotal,
        senia: 0,
        saldo: dto.precioTotal,
        notas: dto.notas,
      },
    });

    if (senia > 0) {
      await this.addDeposito(encargo.id, { monto: senia, metodo: dto.metodoSenia ?? PaymentMethod.EFECTIVO }, usuarioId);
    }
    return this.get(encargo.id);
  }

  async update(id: string, dto: UpdateCustomOrderDto) {
    const o = await this.get(id);
    const data: Prisma.CustomOrderUpdateInput = {
      ...dto,
      ...(dto.pickupAt ? { pickupAt: new Date(dto.pickupAt) } : {}),
    };
    // Si cambia el precio, se recalcula el saldo con lo ya pagado.
    if (dto.precioTotal != null) {
      const pagado = o.depositos.reduce((a, d) => a + num(d.monto), 0);
      data.saldo = round2(dto.precioTotal - pagado);
    }
    await this.prisma.customOrder.update({ where: { id }, data });
    return this.get(id);
  }

  /** Registra una seña o un pago del saldo, y lo asienta en la caja del turno. */
  async addDeposito(id: string, dto: DepositoDto, usuarioId: string) {
    const o = await this.get(id);
    const pagado = o.depositos.reduce((a, d) => a + num(d.monto), 0);
    const pendiente = round2(num(o.precioTotal) - pagado);
    if (dto.monto > pendiente) {
      throw new BadRequestException(`El monto supera el saldo pendiente (${pendiente}).`);
    }

    // El cobro requiere una caja abierta (propia o del turno), como en el salón.
    const sesion =
      (await this.prisma.cashSession.findFirst({
        where: { status: CashSessionStatus.ABIERTA, openedById: usuarioId },
      })) ??
      (await this.prisma.cashSession.findFirst({
        where: { status: CashSessionStatus.ABIERTA },
        orderBy: { openedAt: "desc" },
      }));
    if (!sesion) {
      throw new BadRequestException(
        "La caja no está abierta. Pedile al responsable que abra la caja para cobrar.",
      );
    }

    const nuevoPagado = round2(pagado + dto.monto);
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.deposito.create({
        data: { customOrderId: id, monto: dto.monto, metodo: dto.metodo },
      }),
      this.prisma.customOrder.update({
        where: { id },
        data: { senia: nuevoPagado, saldo: round2(num(o.precioTotal) - nuevoPagado) },
      }),
      this.prisma.cashMovement.create({
        data: {
          cashSessionId: sesion.id,
          tipo: CashMovementType.SALE,
          metodoPago: dto.metodo,
          monto: dto.monto,
          referencia: `Encargo: ${o.descripcion.slice(0, 40)}`,
          usuarioId,
        },
      }),
    ];
    await this.prisma.$transaction(ops);
    return this.get(id);
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.customOrder.delete({ where: { id } });
    return { ok: true };
  }
}

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CAJERO, UserRole.PRODUCCION)
@Controller("admin/encargos")
class CustomOrdersController {
  constructor(private readonly svc: CustomOrdersService) {}

  @Get()
  list(@Query("status") status?: CustomOrderStatus) {
    return this.svc.list(status);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.svc.get(id);
  }

  @Roles(UserRole.ADMIN, UserRole.CAJERO)
  @Post()
  create(@Body() dto: CreateCustomOrderDto, @CurrentUser() user: AuthUser) {
    return this.svc.create(dto, user.id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCustomOrderDto) {
    return this.svc.update(id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.CAJERO)
  @Post(":id/deposito")
  deposito(@Param("id") id: string, @Body() dto: DepositoDto, @CurrentUser() user: AuthUser) {
    return this.svc.addDeposito(id, dto, user.id);
  }

  @Roles(UserRole.ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }
}

@Module({
  controllers: [CustomOrdersController],
  providers: [CustomOrdersService],
  exports: [CustomOrdersService],
})
export class CustomOrdersModule {}
