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
  CobrarParcialDto,
  CreateMesaDto,
  CreateSillaDto,
  CreateZonaDto,
  UpdateMesaDto,
  UpdateSillaDto,
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

  async createMesa(dto: CreateMesaDto) {
    const mesa = await this.prisma.mesa.create({ data: dto });
    await this.ensureSillas(mesa.id, mesa.capacidad, mesa.forma);
    return mesa;
  }

  listZonas() {
    return this.prisma.zona.findMany({ orderBy: { nombre: "asc" } });
  }

  async updateMesa(id: string, dto: UpdateMesaDto) {
    const mesa = await this.getMesa(id);
    // No permitir bajar la capacidad por debajo de las sillas ya creadas.
    if (dto.capacidad != null) {
      const sillas = await this.prisma.silla.count({ where: { mesaId: mesa.id } });
      if (dto.capacidad < sillas) {
        throw new BadRequestException(
          `La mesa tiene ${sillas} sillas. Eliminá sillas antes de bajar la capacidad a ${dto.capacidad}.`,
        );
      }
    }
    return this.prisma.mesa.update({ where: { id: mesa.id }, data: dto });
  }

  // ---------- Sillas / comensales ----------
  /** Offset (respecto al centro de la mesa) por defecto para la silla i de n. */
  private sillaOffset(i: number, n: number, forma: string): { posX: number; posY: number } {
    const TILE = 76;
    if (forma === "CIRCULAR") {
      const R = TILE / 2 + 14;
      const ang = (i / Math.max(n, 1)) * 2 * Math.PI - Math.PI / 2;
      return { posX: Math.round(Math.cos(ang) * R), posY: Math.round(Math.sin(ang) * R) };
    }
    const h = TILE / 2 + 12;
    const per = 8 * h;
    const d = (i / Math.max(n, 1)) * per;
    if (d < 2 * h) return { posX: Math.round(-h + d), posY: -h };
    if (d < 4 * h) return { posX: h, posY: Math.round(-h + (d - 2 * h)) };
    if (d < 6 * h) return { posX: Math.round(h - (d - 4 * h)), posY: h };
    return { posX: -h, posY: Math.round(h - (d - 6 * h)) };
  }

  /** Crea las sillas por defecto si la mesa aún no tiene ninguna. */
  private async ensureSillas(mesaId: string, capacidad: number, forma: string) {
    const existentes = await this.prisma.silla.count({ where: { mesaId } });
    if (existentes > 0) return;
    const data = Array.from({ length: Math.max(0, capacidad) }, (_, i) => ({
      mesaId,
      numero: i + 1,
      ...this.sillaOffset(i, capacidad, forma),
    }));
    if (data.length) await this.prisma.silla.createMany({ data });
  }

  async addSilla(mesaId: string, dto: CreateSillaDto) {
    const mesa = await this.getMesa(mesaId);
    const sillas = await this.prisma.silla.findMany({ where: { mesaId } });
    if (sillas.length >= mesa.capacidad) {
      throw new BadRequestException(
        `La mesa ${mesa.numero} admite ${mesa.capacidad} sillas. Subí la capacidad para agregar más.`,
      );
    }
    const numero = (sillas.reduce((mx, s) => Math.max(mx, s.numero), 0) || 0) + 1;
    const pos = this.sillaOffset(sillas.length, mesa.capacidad, mesa.forma);
    return this.prisma.silla.create({
      data: {
        mesaId,
        numero,
        nombre: dto.nombre,
        posX: dto.posX ?? pos.posX,
        posY: dto.posY ?? pos.posY,
      },
    });
  }

  async updateSilla(id: string, dto: UpdateSillaDto) {
    await this.getSilla(id);
    return this.prisma.silla.update({ where: { id }, data: dto });
  }

  async deleteSilla(id: string) {
    const silla = await this.getSilla(id);
    // No borrar una silla con consumos sin cobrar.
    const conItems = await this.prisma.pedidoItem.count({
      where: { sillaId: id, pagado: false },
    });
    if (conItems > 0) {
      throw new BadRequestException("La silla tiene consumos sin cobrar.");
    }
    await this.prisma.silla.delete({ where: { id: silla.id } });
    return { ok: true };
  }

  private async getSilla(id: string) {
    const s = await this.prisma.silla.findUnique({ where: { id } });
    if (!s) throw new NotFoundException("Silla no encontrada");
    return s;
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
    // Asegura sillas por defecto en mesas creadas antes de esta funcionalidad.
    const sinSillas = await this.prisma.mesa.findMany({
      where: { sillas: { none: {} } },
      select: { id: true, capacidad: true, forma: true },
    });
    for (const m of sinSillas) await this.ensureSillas(m.id, m.capacidad, m.forma);

    const mesas = await this.prisma.mesa.findMany({
      orderBy: { numero: "asc" },
      include: { zona: true, sillas: { orderBy: { numero: "asc" } } },
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
    // Batch (no interactiva) por compatibilidad con el pooler de Supabase.
    const [pedido] = await this.prisma.$transaction([
      this.prisma.pedido.create({
        data: {
          channel: OrderChannel.MOSTRADOR,
          orderType: OrderType.DINE_IN,
          status: OrderStatus.EN_PREPARACION,
          mesaId,
          mozoId,
          eventos: { create: { toState: OrderStatus.EN_PREPARACION, usuarioId: mozoId } },
        },
      }),
      this.prisma.mesa.update({
        where: { id: mesaId },
        data: { status: TableStatus.OCUPADA },
      }),
    ]);
    return pedido;
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
        items: {
          include: { producto: true, modificadores: true, silla: true },
          orderBy: { id: "asc" },
        },
        mozo: true,
        mesa: { include: { sillas: { orderBy: { numero: "asc" } } } },
      },
    });
    if (!pedido) throw new NotFoundException("La mesa no tiene cuenta abierta");
    return pedido;
  }

  async agregarItems(pedidoId: string, dto: AddItemsDto) {
    const pedido = await this.getPedidoAbierto(pedidoId);
    const { items, subtotal } = await this.orders.priceItems(dto.items);

    // Sólo aceptamos sillas que pertenezcan a la mesa del pedido. Si llega una
    // silla inexistente/vieja (p. ej. una comanda encolada offline), el ítem se
    // carga sin asignar en vez de romper por clave foránea.
    const sillasValidas = pedido.mesaId
      ? new Set(
          (
            await this.prisma.silla.findMany({
              where: { mesaId: pedido.mesaId },
              select: { id: true },
            })
          ).map((s) => s.id),
        )
      : new Set<string>();

    // Transacción por lotes (no interactiva): compatible con el pooler de
    // Supabase, que rompe las transacciones interactivas ("Transaction not found").
    const ops: Prisma.PrismaPromise<unknown>[] = items.map((it) => {
      const sillaId = it.sillaId && sillasValidas.has(it.sillaId) ? it.sillaId : undefined;
      return this.prisma.pedidoItem.create({
        data: {
          pedidoId,
          productoId: it.productoId,
          productVariantId: it.productVariantId,
          stationId: it.stationId,
          sillaId,
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
    });
    ops.push(
      this.prisma.pedido.update({
        where: { id: pedidoId },
        data: {
          subtotal: num(pedido.subtotal) + subtotal,
          total: num(pedido.total) + subtotal,
        },
        include: { items: { include: { producto: true, modificadores: true } } },
      }),
    );
    const results = await this.prisma.$transaction(ops);
    return results[results.length - 1];
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

  /** Cobra toda la cuenta pendiente de la mesa (ítems sin pagar) y la cierra. */
  async cobrar(pedidoId: string, dto: CobrarDto, usuarioId: string) {
    const pedido = await this.getPedidoAbierto(pedidoId);
    const items = await this.prisma.pedidoItem.findMany({
      where: { pedidoId, pagado: false },
      include: { producto: true },
    });
    if (items.length === 0) {
      throw new BadRequestException("No hay consumos pendientes de cobro.");
    }
    return this.settleItems(pedido, items, dto, usuarioId);
  }

  /** Cobra sólo los ítems de ciertas sillas (o ítems puntuales): división de cuenta. */
  async cobrarParcial(pedidoId: string, dto: CobrarParcialDto, usuarioId: string) {
    const pedido = await this.getPedidoAbierto(pedidoId);
    const where: Prisma.PedidoItemWhereInput = { pedidoId, pagado: false };
    if (dto.itemIds?.length) {
      where.id = { in: dto.itemIds };
    } else if (dto.sillaIds?.length) {
      where.sillaId = { in: dto.sillaIds };
    } else {
      throw new BadRequestException("Indicá qué comensales o ítems cobrar.");
    }
    const items = await this.prisma.pedidoItem.findMany({ where, include: { producto: true } });
    if (items.length === 0) {
      throw new BadRequestException("No hay consumos pendientes para esa selección.");
    }
    return this.settleItems(pedido, items, dto, usuarioId);
  }

  /**
   * Liquida un conjunto de ítems: pago POS + CFE + caja, los marca pagados y,
   * si ya no queda nada pendiente, cierra el pedido y libera la mesa.
   */
  private async settleItems(
    pedido: { id: string; numero: number; status: string; mesaId: string | null; mozoId: string | null },
    items: { id: string; subtotal: Prisma.Decimal; cantidad: number; precioUnitario: Prisma.Decimal; producto: { nombre: string } }[],
    dto: CobrarDto | CobrarParcialDto,
    usuarioId: string,
  ) {
    const pedidoId = pedido.id;
    const total = Math.round(items.reduce((a, it) => a + num(it.subtotal), 0) * 100) / 100;
    const itemIds = items.map((it) => it.id);

    const pago = await this.prisma.payment.create({
      data: {
        pedidoId,
        metodo: dto.metodoPago,
        monto: total,
        status: PaymentStatus.APROBADO,
        provider: "pos",
      },
    });

    // Emite CFE (e-Ticket o e-Factura según rutReceptor) sólo por lo cobrado.
    let comprobante = null;
    try {
      comprobante = await this.billing.emitForOrder({
        tipo: "E_TICKET" as any,
        orderId: pedidoId,
        numero: pedido.numero,
        montoTotal: total,
        iva: 0,
        rutReceptor: dto.rutReceptor,
        lineas: items.map((it) => ({
          descripcion: it.producto.nombre,
          cantidad: it.cantidad,
          precioUnitario: num(it.precioUnitario),
        })),
      });
    } catch {
      /* CFE best-effort en mock */
    }

    // Se cierra la mesa si, además de estos ítems, no queda nada pendiente.
    const pendientesTotales = await this.prisma.pedidoItem.count({
      where: { pedidoId, pagado: false },
    });
    const cerrado = pendientesTotales <= itemIds.length;
    // El efectivo entra a la caja del turno: primero la propia del usuario;
    // si no tiene (típico en un mozo), la caja abierta del turno (la más reciente).
    const sesion =
      (await this.prisma.cashSession.findFirst({
        where: { status: CashSessionStatus.ABIERTA, openedById: usuarioId },
      })) ??
      (await this.prisma.cashSession.findFirst({
        where: { status: CashSessionStatus.ABIERTA },
        orderBy: { openedAt: "desc" },
      }));

    // Batch (no interactiva) por compatibilidad con el pooler de Supabase.
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.pedidoItem.updateMany({ where: { id: { in: itemIds } }, data: { pagado: true } }),
    ];
    if (cerrado) {
      ops.push(
        this.prisma.pedido.update({
          where: { id: pedidoId },
          data: {
            status: OrderStatus.ENTREGADO,
            eventos: {
              create: [
                { fromState: pedido.status as OrderStatus, toState: OrderStatus.PAGADO, usuarioId },
                { fromState: OrderStatus.PAGADO, toState: OrderStatus.ENTREGADO, usuarioId },
              ],
            },
          },
        }),
      );
      if (pedido.mesaId) {
        ops.push(
          this.prisma.mesa.update({
            where: { id: pedido.mesaId },
            data: { status: TableStatus.LIBRE },
          }),
        );
      }
    }
    if (dto.propina && dto.propina > 0) {
      ops.push(
        this.prisma.propina.create({
          data: { pedidoId, paymentId: pago.id, mozoId: pedido.mozoId, monto: dto.propina },
        }),
      );
    }
    if (sesion) {
      ops.push(
        this.prisma.cashMovement.create({
          data: {
            cashSessionId: sesion.id,
            tipo: CashMovementType.SALE,
            metodoPago: dto.metodoPago,
            monto: total,
            referencia: `Pedido #${pedido.numero}`,
            usuarioId,
          },
        }),
      );
    }
    await this.prisma.$transaction(ops);

    return { ok: true, total, comprobante, cerrado };
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
