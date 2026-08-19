import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  calcularIvaPedido,
  canTransition,
  IvaRate,
  IVA_PORCENTAJE,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  tasaAplicable,
} from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "../integrations/payments/payments.service";
import { BillingService } from "../integrations/billing/billing.service";
import { InventoryService } from "../inventory/inventory.service";
import { CheckoutDto, CartItemDto } from "./orders.dto";

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === "number" ? d : d.toNumber();

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments: PaymentsService,
    private readonly billing: BillingService,
    private readonly inventory: InventoryService,
  ) {}

  /**
   * Checkout: crea el pedido, dispara el pago y —si se aprueba— confirma
   * el pedido, emite el CFE y deja todo listo para producción.
   */
  async checkout(dto: CheckoutDto) {
    if (!dto.items?.length) {
      throw new BadRequestException("El carrito está vacío");
    }

    const { items, subtotal, iva } = await this.priceItems(dto.items, dto.orderType);

    // Cliente (con registro de consentimiento — Ley 18.331).
    let clienteId: string | undefined;
    if (dto.cliente) {
      const cliente = await this.prisma.cliente.create({
        data: {
          nombre: dto.cliente.nombre,
          telefono: dto.cliente.telefono,
          email: dto.cliente.email,
          direccion: dto.cliente.direccion,
          consentimientoDatos: true,
          consentimientoAt: new Date(),
        },
      });
      clienteId = cliente.id;
    }

    // El pedido y el descuento de lo producido van juntos, para que no quede
    // una venta registrada sin bajar el stock (ni al revés).
    const [pedido] = await this.prisma.$transaction([
      this.prisma.pedido.create({
        data: {
          channel: dto.channel,
          orderType: dto.orderType,
          status: OrderStatus.PENDIENTE_PAGO,
          clienteId,
          subtotal,
          total: subtotal,
          neto: iva.neto,
          ivaTotal: iva.iva,
          netoIvaMinima: iva.netoMinima,
          ivaMinima: iva.ivaMinima,
          netoIvaBasica: iva.netoBasica,
          ivaBasica: iva.ivaBasica,
          montoNoGravado: iva.noGravado,
          notas: dto.notas,
          items: {
            create: items.map((i) => ({
              productoId: i.productoId,
              productVariantId: i.productVariantId,
              stationId: i.stationId,
              cantidad: i.cantidad,
              precioUnitario: i.precioUnitario,
              subtotal: i.subtotal,
              ivaRate: i.ivaRate,
              neto: i.neto,
              ivaMonto: i.ivaMonto,
              notas: i.notas,
              modificadores: {
                create: i.modificadores.map((m) => ({
                  modifierId: m.id,
                  nombre: m.nombre,
                  priceDelta: m.priceDelta,
                })),
              },
            })),
          },
          eventos: {
            create: { toState: OrderStatus.PENDIENTE_PAGO },
          },
        },
      }),
      ...(await this.opsDescontarStockVendido(items)),
    ]);

    // Intento de pago.
    const idempotencyKey = `order-${pedido.id}`;
    const intent = await this.payments.createPayment({
      orderId: pedido.id,
      numero: pedido.numero,
      amount: subtotal,
      description: `Pedido #${pedido.numero} - Don Julio`,
      payerEmail: dto.cliente?.email,
      idempotencyKey,
    });

    const pago = await this.prisma.payment.create({
      data: {
        pedidoId: pedido.id,
        metodo: PaymentMethod.MERCADO_PAGO_CHECKOUT,
        monto: subtotal,
        status:
          intent.status === "approved"
            ? PaymentStatus.APROBADO
            : PaymentStatus.PENDIENTE,
        provider: intent.provider,
        mpPaymentId: intent.paymentId,
        idempotencyKey,
      },
    });

    // Con el mock (auto-aprobado) confirmamos en el acto.
    if (intent.status === "approved") {
      await this.confirmPaid(pedido.id, dto.rutReceptor);
    }

    return {
      order: await this.findOne(pedido.id),
      payment: {
        id: pago.id,
        provider: intent.provider,
        status: intent.status,
        checkoutUrl: intent.checkoutUrl,
      },
    };
  }

  /** Llamado desde el webhook cuando el proveedor reporta un cambio de pago. */
  async handlePaymentUpdate(providerPaymentId: string, status: string) {
    const pago = await this.prisma.payment.findFirst({
      where: { mpPaymentId: providerPaymentId },
    });
    if (!pago) {
      this.logger.warn(`Webhook de pago desconocido: ${providerPaymentId}`);
      return;
    }
    const map: Record<string, PaymentStatus> = {
      approved: PaymentStatus.APROBADO,
      pending: PaymentStatus.PENDIENTE,
      rejected: PaymentStatus.RECHAZADO,
      cancelled: PaymentStatus.CANCELADO,
      refunded: PaymentStatus.REEMBOLSADO,
    };
    await this.prisma.payment.update({
      where: { id: pago.id },
      data: { status: map[status] ?? PaymentStatus.PENDIENTE },
    });
    if (status === "approved") {
      await this.confirmPaid(pago.pedidoId);
    } else if (status === "rejected") {
      await this.setStatus(pago.pedidoId, OrderStatus.RECHAZADO);
    }
  }

  /** Marca el pedido como PAGADO y emite el CFE (idempotente por estado). */
  private async confirmPaid(pedidoId: string, rutReceptor?: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { items: { include: { producto: true } } },
    });
    if (!pedido) throw new NotFoundException("Pedido no encontrado");
    if (pedido.status !== OrderStatus.PENDIENTE_PAGO) return; // ya procesado

    await this.setStatus(pedidoId, OrderStatus.PAGADO);

    // Emite el CFE (mock por defecto).
    try {
      // El IVA se lee del pedido, no se recalcula: si la tasa del producto
      // cambió después de la venta, el comprobante tiene que declarar lo que
      // efectivamente se cobró.
      const iva = num(pedido.ivaTotal);
      await this.billing.emitForOrder({
        tipo: "E_TICKET" as any, // el service decide según rutReceptor
        orderId: pedido.id,
        numero: pedido.numero,
        montoTotal: num(pedido.total),
        iva: Math.round(iva * 100) / 100,
        rutReceptor,
        lineas: pedido.items.map((it) => ({
          descripcion: it.producto.nombre,
          cantidad: it.cantidad,
          precioUnitario: num(it.precioUnitario),
        })),
      });
    } catch (e) {
      this.logger.error(
        `No se pudo emitir CFE para pedido ${pedidoId}`,
        e as Error,
      );
    }
  }

  /** Transición de estado validada por la máquina de estados. */
  async setStatus(pedidoId: string, to: OrderStatus, usuarioId?: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
    });
    if (!pedido) throw new NotFoundException("Pedido no encontrado");

    if (
      pedido.status !== to &&
      !canTransition(
        pedido.status as OrderStatus,
        to,
        pedido.orderType as OrderType,
      )
    ) {
      throw new BadRequestException(
        `Transición inválida: ${pedido.status} → ${to}`,
      );
    }

    return this.prisma.pedido.update({
      where: { id: pedidoId },
      data: {
        status: to,
        eventos: {
          create: { fromState: pedido.status, toState: to, usuarioId },
        },
      },
    });
  }

  findAll(status?: OrderStatus) {
    return this.prisma.pedido.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: { items: true, cliente: true },
      take: 200,
    });
  }

  async findOne(id: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: {
        items: { include: { producto: true, modificadores: true } },
        pagos: true,
        cliente: true,
        comprobantes: true,
      },
    });
    if (!pedido) throw new NotFoundException("Pedido no encontrado");
    return pedido;
  }

  /** Calcula precios de cada línea (producto + variante + modificadores). */
  /**
   * Valida y valoriza un carrito. Es el único paso por el que pasan todas las
   * ventas (salón, autoservicio, PWA y web), así que acá se concentran las
   * validaciones: que el producto exista, esté disponible y —si se vende de lo
   * producido— que haya stock horneado suficiente.
   */
  /**
   * Precio, validación de stock y desglose de IVA de un carrito.
   *
   * Por acá pasan todas las ventas -- salón, mozo, autoservicio y web -- así
   * que es el único lugar donde se calcula el impuesto. `orderType` entra
   * porque la regla del salón puede cambiar la tasa aplicable.
   */
  async priceItems(cart: CartItemDto[], orderType?: OrderType) {
    const productoIds = [...new Set(cart.map((i) => i.productoId))];
    const productos = await this.prisma.producto.findMany({
      where: { id: { in: productoIds } },
      include: { variantes: true },
    });

    // Stock producido, sólo de los que lo controlan.
    const conControl = productos
      .filter((p) => p.controlaStock)
      .map((p) => p.id);
    const stock = conControl.length
      ? await this.inventory.stockProductos(conControl)
      : new Map<string, number>();

    // Se acumula por producto: dos líneas del mismo pan tienen que sumar
    // contra el mismo stock, no validarse por separado.
    const pedidoPorProducto = new Map<string, number>();
    for (const ci of cart) {
      pedidoPorProducto.set(
        ci.productoId,
        (pedidoPorProducto.get(ci.productoId) ?? 0) + ci.cantidad,
      );
    }
    for (const [pid, pedida] of pedidoPorProducto) {
      const producto = productos.find((p) => p.id === pid);
      if (!producto?.controlaStock) continue;
      const hay = stock.get(pid) ?? 0;
      if (hay < pedida - 0.0001) {
        throw new BadRequestException(
          hay <= 0
            ? `No hay “${producto.nombre}” disponible: todavía no se produjo. Planificá una producción o marcalo como no disponible.`
            : `Sólo quedan ${hay} de “${producto.nombre}” y se pidieron ${pedida}.`,
        );
      }
    }
    const modifierIds = [
      ...new Set(cart.flatMap((i) => i.modificadorIds ?? [])),
    ];
    const modifiers = modifierIds.length
      ? await this.prisma.modifier.findMany({
          where: { id: { in: modifierIds } },
        })
      : [];

    const fiscal = await this.configFiscal();

    let subtotal = 0;
    const items = cart.map((ci) => {
      const producto = productos.find((p) => p.id === ci.productoId);
      if (!producto) {
        throw new BadRequestException(`Producto inexistente: ${ci.productoId}`);
      }
      if (!producto.disponible) {
        throw new BadRequestException(
          `Producto no disponible: ${producto.nombre}`,
        );
      }
      const variante = ci.productVariantId
        ? producto.variantes.find((v) => v.id === ci.productVariantId)
        : undefined;
      const mods = (ci.modificadorIds ?? [])
        .map((id) => modifiers.find((m) => m.id === id))
        .filter((m): m is (typeof modifiers)[number] => !!m);

      const unit =
        num(producto.precio) +
        num(variante?.precioDelta) +
        mods.reduce((a, m) => a + num(m.priceDelta), 0);
      const lineSubtotal = unit * ci.cantidad;
      subtotal += lineSubtotal;

      return {
        productoId: producto.id,
        productVariantId: variante?.id,
        stationId: producto.stationId ?? undefined,
        sillaId: ci.sillaId,
        cantidad: ci.cantidad,
        precioUnitario: unit,
        subtotal: lineSubtotal,
        ivaRate: tasaAplicable(
          producto.ivaRate as IvaRate,
          orderType === OrderType.DINE_IN,
          fiscal.salonTasaBasica,
        ),
        notas: ci.notas,
        modificadores: mods.map((m) => ({
          id: m.id,
          nombre: m.nombre,
          priceDelta: num(m.priceDelta),
        })),
      };
    });

    // El IVA sale de adentro del precio: el que se carga en Productos ya lo
    // incluye, así que el total del cliente no cambia por calcularlo.
    const iva = calcularIvaPedido(
      items.map((i) => ({ totalConIva: i.subtotal, tasa: i.ivaRate })),
    );
    const conIva = items.map((i, n) => ({
      ...i,
      neto: iva.lineas[n].neto,
      ivaMonto: iva.lineas[n].iva,
    }));

    return { items: conIva, subtotal: Math.round(subtotal * 100) / 100, iva };
  }

  /** Definiciones fiscales; se crean con los valores por defecto la primera vez. */
  async configFiscal() {
    const c = await this.prisma.fiscalConfig.findUnique({ where: { id: "default" } });
    return c ?? this.prisma.fiscalConfig.create({ data: { id: "default" } });
  }

  /**
   * Operaciones para descontar de los lotes producidos lo que se acaba de
   * vender. Sólo afecta a los productos que controlan stock; el resto se
   * prepara al momento y no tiene lotes que descontar.
   */
  async opsDescontarStockVendido(
    items: { productoId: string; cantidad: number }[],
  ): Promise<Prisma.PrismaPromise<unknown>[]> {
    const porProducto = new Map<string, number>();
    for (const it of items) {
      porProducto.set(
        it.productoId,
        (porProducto.get(it.productoId) ?? 0) + it.cantidad,
      );
    }
    const conControl = await this.prisma.producto.findMany({
      where: { id: { in: [...porProducto.keys()] }, controlaStock: true },
      select: { id: true },
    });
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const { id } of conControl) {
      ops.push(
        ...(await this.inventory.opsDescontarProducto(
          id,
          porProducto.get(id) ?? 0,
        )),
      );
    }
    return ops;
  }
}
