import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  CashMovementType,
  CashSessionStatus,
  OrderChannel,
  OrderStatus,
  OrderType,
  PaymentStatus,
  TableStatus,
} from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OrdersService } from "../orders/orders.service";
import { BillingService } from "../integrations/billing/billing.service";
import {
  AddItemsDto,
  CobrarDto,
  CreateMesaDto,
  CreateZonaDto,
  UpdateMesaDto,
} from "./salon.dto";

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === "number" ? d : d.toNumber();

// Un pedido de mesa está "abierto" mientras no se cobró ni canceló.
const OPEN_STATES = [OrderStatus.EN_PREPARACION, OrderStatus.LISTO];

@Injectable()
export class SalonService {
  constructor(
    private prisma: PrismaService,
    private orders: OrdersService,
    private billing: BillingService,
  ) {}

  // ---------- Zonas y mesas (admin) ----------
  createZona(dto: CreateZonaDto) {
    return this.prisma.zona.create({ data: dto });
  }

  createMesa(dto: CreateMesaDto) {
    return this.prisma.mesa.create({ data: dto });
  }

  listZonas() {
    return this.prisma.zona.findMany({ orderBy: { nombre: "asc" } });
  }

  async updateMesa(id: string, dto: UpdateMesaDto) {
    const mesa = await this.getMesa(id);
    return this.prisma.mesa.update({ where: { id: mesa.id }, data: dto });
  }

  async deleteMesa(id: string) {
    const mesa = await this.getMesa(id);
    // No se puede eliminar una mesa con cuenta abierta.
    const abierto = await this.prisma.pedido.findFirst({
      where: {
        mesaId: mesa.id,
        orderType: OrderType.DINE_IN,
        status: { in: OPEN_STATES as any },
      },
    });
    if (abierto) {
      throw new BadRequestException("La mesa tiene una cuenta abierta");
    }
    await this.prisma.mesa.delete({ where: { id: mesa.id } });
    return { ok: true };
  }

  /** Mapa de mesas con la cuenta abierta (si la hay). */
  async mapa() {
    const mesas = await this.prisma.mesa.findMany({
      orderBy: { numero: "asc" },
      include: { zona: true },
    });
    const abiertos = await this.prisma.pedido.findMany({
      where: { orderType: OrderType.DINE_IN, status: { in: OPEN_STATES as any } },
      include: { items: true, mozo: true },
    });
    return mesas.map((m) => {
      const pedido = abiertos.find((p) => p.mesaId === m.id);
      return {
        ...m,
        pedidoAbierto: pedido
          ? {
              id: pedido.id,
              numero: pedido.numero,
              total: num(pedido.total),
              itemsCount: pedido.items.length,
              mozo: pedido.mozo?.nombre ?? null,
            }
          : null,
      };
    });
  }

  /** Menú para el POS: productos con variantes y grupos de modificadores. */
  menuPos() {
    return this.prisma.categoria.findMany({
      where: { activa: true },
      orderBy: { orden: "asc" },
      include: {
        productos: {
          where: { disponible: true },
          orderBy: { nombre: "asc" },
          include: {
            variantes: true,
            modifierGroups: {
              include: { group: { include: { modifiers: true } } },
            },
          },
        },
      },
    });
  }

  // ---------- Comanda ----------
  async abrirMesa(mesaId: string, mozoId: string) {
    const mesa = await this.getMesa(mesaId);
    if (mesa.status === TableStatus.OCUPADA) {
      throw new BadRequestException("La mesa ya tiene una cuenta abierta");
    }
    return this.prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.create({
        data: {
          channel: OrderChannel.MOSTRADOR,
          orderType: OrderType.DINE_IN,
          status: OrderStatus.EN_PREPARACION,
          mesaId,
          mozoId,
          eventos: { create: { toState: OrderStatus.EN_PREPARACION, usuarioId: mozoId } },
        },
      });
      await tx.mesa.update({
        where: { id: mesaId },
        data: { status: TableStatus.OCUPADA },
      });
      return pedido;
    });
  }

  async cuentaMesa(mesaId: string) {
    const pedido = await this.prisma.pedido.findFirst({
      where: {
        mesaId,
        orderType: OrderType.DINE_IN,
        status: { in: OPEN_STATES as any },
      },
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { producto: true, modificadores: true }, orderBy: { id: "asc" } },
        mozo: true,
        mesa: true,
      },
    });
    if (!pedido) throw new NotFoundException("La mesa no tiene cuenta abierta");
    return pedido;
  }

  async agregarItems(pedidoId: string, dto: AddItemsDto) {
    const pedido = await this.getPedidoAbierto(pedidoId);
    const { items, subtotal } = await this.orders.priceItems(dto.items);

    return this.prisma.$transaction(async (tx) => {
      for (const it of items) {
        await tx.pedidoItem.create({
          data: {
            pedidoId,
            productoId: it.productoId,
            productVariantId: it.productVariantId,
            stationId: it.stationId,
            cantidad: it.cantidad,
            precioUnitario: it.precioUnitario,
            subtotal: it.subtotal,
            notas: it.notas,
            modificadores: {
              create: it.modificadores.map((m) => ({
                modifierId: m.id,
                nombre: m.nombre,
                priceDelta: m.priceDelta,
              })),
            },
          },
        });
      }
      return tx.pedido.update({
        where: { id: pedidoId },
        data: {
          subtotal: num(pedido.subtotal) + subtotal,
          total: num(pedido.total) + subtotal,
        },
        include: { items: { include: { producto: true, modificadores: true } } },
      });
    });
  }

  /**
   * Comanda por mesa: abre la cuenta si no existe y agrega ítems, de forma
   * idempotente (clientTxnId). Es el endpoint que usa la PWA de mozos para
   * reintentar de forma segura las comandas encoladas offline.
   */
  async comandaByMesa(
    mesaId: string,
    items: AddItemsDto["items"],
    mozoId: string,
    clientTxnId?: string,
  ) {
    // Idempotencia: si ya se procesó esta transacción, no la repite.
    if (clientTxnId) {
      const yaProcesada = await this.prisma.webhookEvent.findUnique({
        where: { provider_eventId: { provider: "comanda", eventId: clientTxnId } },
      });
      if (yaProcesada) return this.cuentaMesa(mesaId);
    }

    let pedido = await this.prisma.pedido.findFirst({
      where: { mesaId, orderType: OrderType.DINE_IN, status: { in: OPEN_STATES as any } },
      orderBy: { createdAt: "desc" },
    });
    if (!pedido) {
      pedido = await this.abrirMesa(mesaId, mozoId);
    }

    await this.agregarItems(pedido.id, { items });

    if (clientTxnId) {
      await this.prisma.webhookEvent
        .create({
          data: {
            provider: "comanda",
            eventId: clientTxnId,
            tipo: "comanda",
            payload: { mesaId, items } as object,
            procesado: true,
          },
        })
        .catch(() => undefined); // carrera benigna en reintentos
    }

    return this.cuentaMesa(mesaId);
  }

  /** Cobra la mesa: pago POS + emisión de CFE + libera la mesa + caja. */
  async cobrar(pedidoId: string, dto: CobrarDto, usuarioId: string) {
    const pedido = await this.getPedidoAbierto(pedidoId);
    const total = num(pedido.total);

    const pago = await this.prisma.payment.create({
      data: {
        pedidoId,
        metodo: dto.metodoPago,
        monto: total,
        status: PaymentStatus.APROBADO,
        provider: "pos",
      },
    });

    // Emite CFE (e-Ticket o e-Factura según rutReceptor).
    let comprobante = null;
    try {
      const full = await this.prisma.pedido.findUnique({
        where: { id: pedidoId },
        include: { items: { include: { producto: true } } },
      });
      comprobante = await this.billing.emitForOrder({
        tipo: "E_TICKET" as any,
        orderId: pedidoId,
        numero: pedido.numero,
        montoTotal: total,
        iva: 0,
        rutReceptor: dto.rutReceptor,
        lineas: (full?.items ?? []).map((it) => ({
          descripcion: it.producto.nombre,
          cantidad: it.cantidad,
          precioUnitario: num(it.precioUnitario),
        })),
      });
    } catch {
      /* CFE best-effort en mock */
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.pedido.update({
        where: { id: pedidoId },
        data: {
          status: OrderStatus.ENTREGADO,
          eventos: {
            create: [
              { fromState: pedido.status, toState: OrderStatus.PAGADO, usuarioId },
              { fromState: OrderStatus.PAGADO, toState: OrderStatus.ENTREGADO, usuarioId },
            ],
          },
        },
      });
      if (pedido.mesaId) {
        await tx.mesa.update({
          where: { id: pedido.mesaId },
          data: { status: TableStatus.LIBRE },
        });
      }
      if (dto.propina && dto.propina > 0) {
        await tx.propina.create({
          data: {
            pedidoId,
            paymentId: pago.id,
            mozoId: pedido.mozoId,
            monto: dto.propina,
          },
        });
      }
      // Registra la venta en la caja abierta del usuario (si hay).
      const sesion = await tx.cashSession.findFirst({
        where: { status: CashSessionStatus.ABIERTA, openedById: usuarioId },
      });
      if (sesion) {
        await tx.cashMovement.create({
          data: {
            cashSessionId: sesion.id,
            tipo: CashMovementType.SALE,
            metodoPago: dto.metodoPago,
            monto: total,
            referencia: `Pedido #${pedido.numero}`,
            usuarioId,
          },
        });
      }
    });

    return { ok: true, total, comprobante };
  }

  private async getMesa(id: string) {
    const m = await this.prisma.mesa.findUnique({ where: { id } });
    if (!m) throw new NotFoundException("Mesa no encontrada");
    return m;
  }

  private async getPedidoAbierto(id: string) {
    const p = await this.prisma.pedido.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("Pedido no encontrado");
    if (!OPEN_STATES.includes(p.status as OrderStatus)) {
      throw new BadRequestException("La cuenta no está abierta");
    }
    return p;
  }
}
