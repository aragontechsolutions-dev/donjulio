import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { StockMovementType } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateInsumoDto,
  CreateProveedorDto,
  StockAdjustDto,
  StockEntryDto,
  UpdateInsumoDto,
} from "./inventory.dto";

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === "number" ? d : d.toNumber();

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // ---------- Proveedores ----------
  listProveedores() {
    return this.prisma.proveedor.findMany({ orderBy: { nombre: "asc" } });
  }

  createProveedor(dto: CreateProveedorDto) {
    return this.prisma.proveedor.create({ data: dto });
  }

  // ---------- Insumos ----------
  listInsumos() {
    return this.prisma.insumo.findMany({
      orderBy: { nombre: "asc" },
      include: { proveedor: true },
    });
  }

  createInsumo(dto: CreateInsumoDto) {
    return this.prisma.insumo.create({ data: dto });
  }

  async updateInsumo(id: string, dto: UpdateInsumoDto) {
    await this.ensureInsumo(id);
    return this.prisma.insumo.update({ where: { id }, data: dto });
  }

  // ---------- Movimientos de stock ----------
  /**
   * Aplica un movimiento y actualiza `stockActual` de forma atómica.
   * `delta` es el cambio neto (positivo entra, negativo sale).
   * Usado por producción (SALIDA) y mermas (MERMA) además de las entradas.
   */
  async applyMovement(
    insumoId: string,
    tipo: StockMovementType,
    delta: number,
    opts: {
      costoUnitario?: number;
      motivo?: string;
      ordenProduccionId?: string;
      insumoLoteId?: string;
      usuarioId?: string;
      tx?: Prisma.TransactionClient;
    } = {},
  ) {
    const db = opts.tx ?? this.prisma;
    await db.movimientoStock.create({
      data: {
        insumoId,
        tipo,
        cantidad: Math.abs(delta),
        costoUnitario: opts.costoUnitario ?? 0,
        motivo: opts.motivo,
        ordenProduccionId: opts.ordenProduccionId,
        insumoLoteId: opts.insumoLoteId,
        usuarioId: opts.usuarioId,
      },
    });
    return db.insumo.update({
      where: { id: insumoId },
      data: { stockActual: { increment: delta } },
    });
  }

  /**
   * Consume un insumo descontando de sus lotes por FEFO (primero el que vence
   * antes), generando un movimiento por lote para poder trazarlo después.
   * Si no hay lotes cargados, hace un único movimiento sin lote.
   */
  async consumirFefo(
    insumoId: string,
    cantidad: number,
    opts: {
      costoUnitario?: number;
      motivo?: string;
      ordenProduccionId?: string;
      usuarioId?: string;
      tx?: Prisma.TransactionClient;
    } = {},
  ) {
    const db = opts.tx ?? this.prisma;
    const lotes = await db.insumoLote.findMany({
      where: { insumoId, cantidad: { gt: 0 } },
      orderBy: [{ vencimiento: "asc" }, { recibidoAt: "asc" }],
    });

    let restante = cantidad;
    for (const lote of lotes) {
      if (restante <= 0.0001) break;
      const toma = Math.min(restante, num(lote.cantidad));
      await db.insumoLote.update({
        where: { id: lote.id },
        data: { cantidad: { decrement: toma } },
      });
      await this.applyMovement(insumoId, StockMovementType.SALIDA, -toma, {
        ...opts,
        costoUnitario: opts.costoUnitario ?? num(lote.costoUnitario),
        insumoLoteId: lote.id,
      });
      restante -= toma;
    }

    // Sin lotes suficientes (o sin lotes cargados): el resto sale sin lote.
    if (restante > 0.0001) {
      await this.applyMovement(insumoId, StockMovementType.SALIDA, -restante, opts);
    }
  }

  async registrarEntrada(insumoId: string, dto: StockEntryDto, usuarioId?: string) {
    const insumo = await this.ensureInsumo(insumoId);
    return this.prisma.$transaction(async (tx) => {
      // Actualiza costo unitario si vino con la compra.
      if (dto.costoUnitario != null) {
        await tx.insumo.update({
          where: { id: insumoId },
          data: { costoUnitario: dto.costoUnitario },
        });
      }
      if (dto.lote) {
        await tx.insumoLote.create({
          data: {
            insumoId,
            lote: dto.lote,
            cantidad: dto.cantidad,
            vencimiento: dto.vencimiento ? new Date(dto.vencimiento) : null,
            costoUnitario: dto.costoUnitario ?? num(insumo.costoUnitario),
          },
        });
      }
      return this.applyMovement(insumoId, StockMovementType.ENTRADA, dto.cantidad, {
        costoUnitario: dto.costoUnitario ?? num(insumo.costoUnitario),
        motivo: dto.motivo ?? "Compra/recepción",
        usuarioId,
        tx,
      });
    });
  }

  async ajustarStock(insumoId: string, dto: StockAdjustDto, usuarioId?: string) {
    const insumo = await this.ensureInsumo(insumoId);
    const delta = dto.stockReal - num(insumo.stockActual);
    return this.applyMovement(insumoId, StockMovementType.AJUSTE, delta, {
      motivo: dto.motivo ?? "Ajuste de inventario",
      usuarioId,
    });
  }

  movimientos(insumoId: string) {
    return this.prisma.movimientoStock.findMany({
      where: { insumoId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  // ---------- Alertas ----------
  /** Insumos en o por debajo del punto de reorden. */
  async alertasReorden() {
    const insumos = await this.prisma.insumo.findMany({
      orderBy: { nombre: "asc" },
    });
    return insumos.filter((i) => num(i.stockActual) <= num(i.puntoReorden));
  }

  /** Lotes que vencen dentro de `dias` (default 7). */
  async alertasVencimiento(dias = 7) {
    const limite = new Date();
    limite.setDate(limite.getDate() + dias);
    return this.prisma.insumoLote.findMany({
      where: { vencimiento: { not: null, lte: limite } },
      orderBy: { vencimiento: "asc" },
      include: { insumo: true },
    });
  }

  // ---------- Trazabilidad ----------
  /** Lotes de producto terminado, para elegir uno y trazarlo. */
  listLotesProducidos(q?: string) {
    return this.prisma.productionLot.findMany({
      where: q ? { lote: { contains: q, mode: "insensitive" } } : {},
      orderBy: { producedAt: "desc" },
      take: 100,
      include: { producto: true },
    });
  }

  /**
   * Hacia atrás: dado un lote de producto terminado, qué insumos y qué lotes
   * de insumo se consumieron en la orden que lo produjo.
   */
  async trazaLoteProducido(loteId: string) {
    const lote = await this.prisma.productionLot.findUnique({
      where: { id: loteId },
      include: {
        producto: true,
        ordenProduccion: { include: { receta: true, usuario: true } },
      },
    });
    if (!lote) throw new NotFoundException("Lote no encontrado");

    const consumos = lote.ordenProduccionId
      ? await this.prisma.movimientoStock.findMany({
          where: { ordenProduccionId: lote.ordenProduccionId, tipo: StockMovementType.SALIDA },
          orderBy: { createdAt: "asc" },
          include: { insumo: true, insumoLote: true },
        })
      : [];

    return {
      lote: {
        id: lote.id,
        lote: lote.lote,
        qty: num(lote.qty),
        producedAt: lote.producedAt,
        expiresAt: lote.expiresAt,
        producto: lote.producto?.nombre ?? null,
      },
      orden: lote.ordenProduccion
        ? {
            id: lote.ordenProduccion.id,
            receta: lote.ordenProduccion.receta?.nombre ?? null,
            responsable: lote.ordenProduccion.usuario?.nombre ?? null,
            iniciadaAt: lote.ordenProduccion.iniciadaAt,
            terminadaAt: lote.ordenProduccion.terminadaAt,
          }
        : null,
      consumos: consumos.map((m) => ({
        insumo: m.insumo.nombre,
        unidad: m.insumo.unidad,
        cantidad: num(m.cantidad),
        lote: m.insumoLote?.lote ?? null,
        vencimiento: m.insumoLote?.vencimiento ?? null,
        fecha: m.createdAt,
      })),
    };
  }

  /**
   * Hacia adelante: dado un lote de insumo, en qué órdenes se usó y qué lotes
   * de producto terminado salieron de ellas (para un retiro de mercadería).
   */
  async trazaLoteInsumo(loteId: string) {
    const lote = await this.prisma.insumoLote.findUnique({
      where: { id: loteId },
      include: { insumo: true },
    });
    if (!lote) throw new NotFoundException("Lote de insumo no encontrado");

    const movimientos = await this.prisma.movimientoStock.findMany({
      where: { insumoLoteId: loteId },
      orderBy: { createdAt: "asc" },
    });
    const ordenIds = [...new Set(movimientos.map((m) => m.ordenProduccionId).filter(Boolean))] as string[];
    const lotesProducto = ordenIds.length
      ? await this.prisma.productionLot.findMany({
          where: { ordenProduccionId: { in: ordenIds } },
          include: { producto: true, ordenProduccion: { include: { receta: true } } },
          orderBy: { producedAt: "asc" },
        })
      : [];

    return {
      insumoLote: {
        id: lote.id,
        lote: lote.lote,
        insumo: lote.insumo.nombre,
        unidad: lote.insumo.unidad,
        restante: num(lote.cantidad),
        vencimiento: lote.vencimiento,
        recibidoAt: lote.recibidoAt,
      },
      usos: lotesProducto.map((l) => ({
        loteProducto: l.lote,
        producto: l.producto?.nombre ?? l.ordenProduccion?.receta?.nombre ?? null,
        qty: num(l.qty),
        producedAt: l.producedAt,
        expiresAt: l.expiresAt,
      })),
      consumidoEn: movimientos.length,
    };
  }

  /** Todos los lotes de insumo (para buscar y trazar). */
  listLotesInsumo(q?: string) {
    return this.prisma.insumoLote.findMany({
      where: q ? { lote: { contains: q, mode: "insensitive" } } : {},
      orderBy: { recibidoAt: "desc" },
      take: 100,
      include: { insumo: true },
    });
  }

  private async ensureInsumo(id: string) {
    const i = await this.prisma.insumo.findUnique({ where: { id } });
    if (!i) throw new NotFoundException("Insumo no encontrado");
    return i;
  }
}
