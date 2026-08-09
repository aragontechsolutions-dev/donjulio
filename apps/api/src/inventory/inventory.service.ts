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
        usuarioId: opts.usuarioId,
      },
    });
    return db.insumo.update({
      where: { id: insumoId },
      data: { stockActual: { increment: delta } },
    });
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

  private async ensureInsumo(id: string) {
    const i = await this.prisma.insumo.findUnique({ where: { id } });
    if (!i) throw new NotFoundException("Insumo no encontrado");
    return i;
  }
}
