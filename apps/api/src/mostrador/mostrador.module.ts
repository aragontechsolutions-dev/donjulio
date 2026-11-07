import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
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
  OrderChannel,
  OrderItemStatus,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CurrentUser, Roles } from "../auth/decorators";
import { RolesGuard } from "../auth/guards";
import { OrdersService } from "../orders/orders.service";
import { OrdersModule } from "../orders/orders.module";
import { InventoryService } from "../inventory/inventory.service";
import { InventoryModule } from "../inventory/inventory.module";
import { BillingService } from "../integrations/billing/billing.service";
import { BillingModule } from "../integrations/billing/billing.module";

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === "number" ? d : d.toNumber();
const round2 = (n: number) => Math.round(n * 100) / 100;

class ItemVentaDto {
  @IsString() productoId!: string;
  /** Unidades, o kilos de la balanza en lo que se vende pesado. */
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) cantidad!: number;
  @IsOptional() @IsArray() @IsString({ each: true }) modificadorIds?: string[];
}

class VentaMostradorDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ItemVentaDto)
  items!: ItemVentaDto[];

  @IsEnum(PaymentMethod) metodoPago!: PaymentMethod;
  /** Efectivo con el que paga, para calcular el vuelto. Sólo informativo. */
  @IsOptional() @IsNumber() @Min(0) recibido?: number;
  /** RUT del comprador: con RUT sale e-Factura en vez de e-Ticket. */
  @IsOptional() @IsString() rutReceptor?: string;
}

/**
 * Venta por mostrador.
 *
 * Es la caja de la panadería: lo que ya está hecho y está en la vitrina se
 * cobra y se entrega en el momento. Por eso la venta nace pagada y entregada,
 * sin pasar por la cocina, salvo lo que se prepara ahí mismo (un café), que sí
 * sale en el KDS.
 *
 * Lo que se vende descuenta de lo que produjo la cocina: es el mismo stock de
 * lotes que usa el resto del sistema, no un inventario aparte.
 */
@Injectable()
export class MostradorService {
  constructor(
    private prisma: PrismaService,
    private orders: OrdersService,
    private inventory: InventoryService,
    private billing: BillingService,
  ) {}

  /** Lo que se puede vender ahora, agrupado por categoría. */
  async catalogo() {
    const categorias = await this.prisma.categoria.findMany({
      where: { activa: true },
      orderBy: { orden: "asc" },
      include: {
        productos: {
          where: { disponible: true },
          orderBy: { nombre: "asc" },
          include: { modifierGroups: { include: { group: { include: { modifiers: true } } } } },
        },
      },
    });

    const conStock = categorias
      .flatMap((c) => c.productos)
      .filter((p) => p.controlaStock)
      .map((p) => p.id);
    const stock = conStock.length
      ? await this.inventory.stockProductos(conStock)
      : new Map<string, number>();

    return categorias
      .map((c) => ({
        id: c.id,
        nombre: c.nombre,
        productos: c.productos.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          precio: num(p.precio),
          unidadVenta: p.unidadVenta,
          ivaRate: p.ivaRate,
          imagenUrl: p.imagenUrl,
          // null = no se lleva stock (se prepara al momento).
          stock: p.controlaStock ? (stock.get(p.id) ?? 0) : null,
          // Se prepara en una estación y no sale de la vitrina: va al KDS.
          sePreparaAlMomento: !!p.stationId && !p.controlaStock,
          modifierGroups: p.modifierGroups,
        })),
      }))
      .filter((c) => c.productos.length > 0);
  }

  /** La caja abierta del turno: sin caja no se cobra, por ningún medio. */
  private async cajaAbierta(usuarioId: string) {
    const sesion =
      (await this.prisma.cashSession.findFirst({
        where: { status: CashSessionStatus.ABIERTA, openedById: usuarioId },
        orderBy: { openedAt: "desc" },
      })) ??
      (await this.prisma.cashSession.findFirst({
        where: { status: CashSessionStatus.ABIERTA },
        orderBy: { openedAt: "desc" },
      }));
    if (!sesion) {
      throw new BadRequestException(
        "La caja no está abierta. Abrí la caja antes de vender.",
      );
    }
    return sesion;
  }

  /**
   * Cobra una venta de mostrador: precia, valida stock, registra el pedido
   * pagado, el movimiento de caja y el comprobante, y descuenta los lotes.
   */
  async vender(dto: VentaMostradorDto, usuarioId: string) {
    const sesion = await this.cajaAbierta(usuarioId);

    // El mismo motor que el resto del sistema: precios, IVA incluido y control
    // de stock. TAKEAWAY porque el mostrador es venta para llevar.
    const { items, subtotal, iva } = await this.orders.priceItems(
      dto.items.map((i) => ({
        productoId: i.productoId,
        cantidad: i.cantidad,
        modificadorIds: i.modificadorIds,
      })),
      OrderType.TAKEAWAY,
    );
    const total = round2(subtotal);
    if (total <= 0) {
      throw new BadRequestException("La venta no puede ser de $ 0.");
    }
    if (
      dto.metodoPago === PaymentMethod.EFECTIVO &&
      dto.recibido != null &&
      dto.recibido < total
    ) {
      throw new BadRequestException(
        "El efectivo recibido es menor al total a cobrar.",
      );
    }

    // Lo que sale de la vitrina ya está entregado; lo que hay que preparar
    // (café, tostado) queda pendiente para que aparezca en la cocina.
    const productos = await this.prisma.producto.findMany({
      where: { id: { in: items.map((i) => i.productoId) } },
      select: { id: true, stationId: true, controlaStock: true },
    });
    const preparar = new Set(
      productos.filter((p) => p.stationId && !p.controlaStock).map((p) => p.id),
    );
    const hayCocina = items.some((i) => preparar.has(i.productoId));

    const pedido = await this.prisma.pedido.create({
      data: {
        channel: OrderChannel.MOSTRADOR,
        orderType: OrderType.TAKEAWAY,
        // Con algo para preparar el pedido sigue vivo para la cocina; si no,
        // se cierra en el acto.
        status: hayCocina ? OrderStatus.PAGADO : OrderStatus.ENTREGADO,
        subtotal: total,
        total,
        neto: iva.neto,
        ivaTotal: iva.iva,
        netoIvaMinima: iva.netoMinima,
        ivaMinima: iva.ivaMinima,
        netoIvaBasica: iva.netoBasica,
        ivaBasica: iva.ivaBasica,
        montoNoGravado: iva.noGravado,
        items: {
          create: items.map((it) => ({
            productoId: it.productoId,
            productVariantId: it.productVariantId,
            stationId: it.stationId,
            cantidad: it.cantidad,
            precioUnitario: it.precioUnitario,
            subtotal: it.subtotal,
            ivaRate: it.ivaRate,
            neto: it.neto,
            ivaMonto: it.ivaMonto,
            status: preparar.has(it.productoId)
              ? OrderItemStatus.PENDIENTE
              : OrderItemStatus.ENTREGADO,
            pagado: true,
            modificadores: {
              create: it.modificadores.map((m) => ({
                modifierId: m.id,
                nombre: m.nombre,
                priceDelta: m.priceDelta,
              })),
            },
          })),
        },
        eventos: {
          create: [
            { toState: OrderStatus.PAGADO, usuarioId },
            ...(hayCocina ? [] : [{ toState: OrderStatus.ENTREGADO, usuarioId }]),
          ],
        },
      },
      include: { items: { include: { producto: { select: { nombre: true } } } } },
    });

    // Comprobante fiscal por lo cobrado (mock hasta integrar el proveedor).
    let comprobante = null;
    try {
      comprobante = await this.billing.emitForOrder({
        tipo: "E_TICKET" as never,
        orderId: pedido.id,
        numero: pedido.numero,
        montoTotal: total,
        iva: iva.iva,
        rutReceptor: dto.rutReceptor,
        lineas: pedido.items.map((it) => ({
          descripcion: it.producto.nombre,
          cantidad: num(it.cantidad),
          precioUnitario: num(it.precioUnitario),
        })),
      });
    } catch {
      /* el CFE no puede trabar el mostrador: la venta ya está registrada */
    }

    // Pago, movimiento de caja y descuento de lotes, en una sola transacción
    // por lotes (el pooler de Supabase no soporta las interactivas).
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.payment.create({
        data: {
          pedidoId: pedido.id,
          metodo: dto.metodoPago,
          monto: total,
          status: PaymentStatus.APROBADO,
          provider: "mostrador",
        },
      }),
      this.prisma.cashMovement.create({
        data: {
          cashSessionId: sesion.id,
          tipo: CashMovementType.SALE,
          metodoPago: dto.metodoPago,
          monto: total,
          referencia: `Mostrador #${pedido.numero}`,
          pedidoId: pedido.id,
          usuarioId,
        },
      }),
      ...(await this.orders.opsDescontarStockVendido(
        items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })),
      )),
    ];
    await this.prisma.$transaction(ops);

    return {
      pedidoId: pedido.id,
      numero: pedido.numero,
      total,
      iva: iva.iva,
      neto: iva.neto,
      metodoPago: dto.metodoPago,
      vuelto:
        dto.metodoPago === PaymentMethod.EFECTIVO && dto.recibido != null
          ? round2(dto.recibido - total)
          : null,
      aCocina: hayCocina,
      comprobante,
      items: pedido.items.map((it) => ({
        nombre: it.producto.nombre,
        cantidad: num(it.cantidad),
        subtotal: num(it.subtotal),
      })),
    };
  }
}

@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.CAJERO)
@Controller("admin/mostrador")
class MostradorController {
  constructor(private readonly svc: MostradorService) {}

  @Get("catalogo")
  catalogo() {
    return this.svc.catalogo();
  }

  @Post("venta")
  vender(@Body() dto: VentaMostradorDto, @CurrentUser() user: AuthUser) {
    return this.svc.vender(dto, user.id);
  }
}

@Module({
  imports: [OrdersModule, InventoryModule, BillingModule],
  controllers: [MostradorController],
  providers: [MostradorService],
  exports: [MostradorService],
})
export class MostradorModule {}
