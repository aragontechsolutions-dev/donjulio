import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  convertUnit,
  RecipeCost,
  RecipeCostBreakdownItem,
  UnitOfMeasure,
} from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRecetaDto, UpdateRecetaDto } from "./recipes.dto";

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === "number" ? d : d.toNumber();

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class RecipesService {
  constructor(private prisma: PrismaService) {}

  // ---------- CRUD ----------
  list() {
    return this.prisma.receta.findMany({
      orderBy: { nombre: "asc" },
      include: { producto: true, ingredientes: true },
    });
  }

  async get(id: string) {
    const r = await this.prisma.receta.findUnique({
      where: { id },
      include: {
        producto: true,
        ingredientes: { include: { insumo: true, subReceta: true } },
      },
    });
    if (!r) throw new NotFoundException("Receta no encontrada");
    return r;
  }

  create(dto: CreateRecetaDto) {
    this.validateIngredientes(dto);
    return this.prisma.receta.create({
      data: {
        nombre: dto.nombre,
        productoId: dto.productoId,
        isSubRecipe: dto.isSubRecipe ?? false,
        yieldQty: dto.yieldQty,
        yieldUnit: dto.yieldUnit,
        mermaPct: dto.mermaPct ?? 0,
        manoObraCosto: dto.manoObraCosto ?? 0,
        overheadCosto: dto.overheadCosto ?? 0,
        notas: dto.notas,
        ingredientes: {
          create: dto.ingredientes.map((i) => ({
            insumoId: i.insumoId,
            subRecetaId: i.subRecetaId,
            cantidad: i.cantidad,
            unidad: i.unidad,
          })),
        },
      },
      include: { ingredientes: true },
    });
  }

  async update(id: string, dto: UpdateRecetaDto) {
    await this.get(id);
    this.validateIngredientes(dto);
    // Reemplaza los ingredientes por completo.
    return this.prisma.$transaction(async (tx) => {
      await tx.recetaIngrediente.deleteMany({ where: { recetaId: id } });
      return tx.receta.update({
        where: { id },
        data: {
          nombre: dto.nombre,
          productoId: dto.productoId,
          isSubRecipe: dto.isSubRecipe ?? false,
          yieldQty: dto.yieldQty,
          yieldUnit: dto.yieldUnit,
          mermaPct: dto.mermaPct ?? 0,
          manoObraCosto: dto.manoObraCosto ?? 0,
          overheadCosto: dto.overheadCosto ?? 0,
          notas: dto.notas,
          ingredientes: {
            create: dto.ingredientes.map((i) => ({
              insumoId: i.insumoId,
              subRecetaId: i.subRecetaId,
              cantidad: i.cantidad,
              unidad: i.unidad,
            })),
          },
        },
        include: { ingredientes: true },
      });
    });
  }

  remove(id: string) {
    return this.prisma.receta.delete({ where: { id } });
  }

  private validateIngredientes(dto: CreateRecetaDto) {
    for (const ing of dto.ingredientes) {
      if (!ing.insumoId && !ing.subRecetaId) {
        throw new BadRequestException(
          "Cada ingrediente debe referenciar un insumo o una sub-receta",
        );
      }
      if (ing.insumoId && ing.subRecetaId) {
        throw new BadRequestException(
          "Un ingrediente no puede ser insumo y sub-receta a la vez",
        );
      }
    }
  }

  // ---------- Costeo recursivo ----------
  /**
   * Costea una receta incluyendo sub-recetas (BOM multinivel), aplicando
   * merma, mano de obra y overhead. Detecta ciclos por el camino recorrido.
   */
  async cost(recetaId: string, path: Set<string> = new Set()): Promise<RecipeCost> {
    if (path.has(recetaId)) {
      throw new BadRequestException(
        `Ciclo detectado en el BOM (receta ${recetaId} se usa a sí misma)`,
      );
    }
    path.add(recetaId);

    const receta = await this.prisma.receta.findUnique({
      where: { id: recetaId },
      include: {
        producto: true,
        ingredientes: { include: { insumo: true, subReceta: true } },
      },
    });
    if (!receta) throw new NotFoundException("Receta no encontrada");

    let materialCost = 0;
    const breakdown: RecipeCostBreakdownItem[] = [];

    for (const ing of receta.ingredientes) {
      if (ing.insumoId && ing.insumo) {
        const qty = convertUnit(
          num(ing.cantidad),
          ing.unidad as UnitOfMeasure,
          ing.insumo.unidad as UnitOfMeasure,
        );
        const costo = round2(qty * num(ing.insumo.costoUnitario));
        materialCost += costo;
        breakdown.push({
          tipo: "INSUMO",
          nombre: ing.insumo.nombre,
          cantidad: num(ing.cantidad),
          unidad: ing.unidad,
          costo,
        });
      } else if (ing.subRecetaId && ing.subReceta) {
        const sub = await this.cost(ing.subRecetaId, path);
        const qty = convertUnit(
          num(ing.cantidad),
          ing.unidad as UnitOfMeasure,
          sub.yieldUnit as UnitOfMeasure,
        );
        const costo = round2(qty * sub.unitCost);
        materialCost += costo;
        breakdown.push({
          tipo: "SUBRECETA",
          nombre: sub.nombre,
          cantidad: num(ing.cantidad),
          unidad: ing.unidad,
          costo,
        });
      }
    }

    path.delete(recetaId);

    const mermaPct = num(receta.mermaPct);
    const mermaFactor = mermaPct > 0 ? 1 / (1 - Math.min(mermaPct, 95) / 100) : 1;
    const materialCostConMerma = round2(materialCost * mermaFactor);
    const laborCost = num(receta.manoObraCosto);
    const overheadCost = num(receta.overheadCosto);
    const totalCost = round2(materialCostConMerma + laborCost + overheadCost);
    const yieldQty = num(receta.yieldQty) || 1;
    const unitCost = round2(totalCost / yieldQty);

    const result: RecipeCost = {
      recetaId: receta.id,
      nombre: receta.nombre,
      yieldQty,
      yieldUnit: receta.yieldUnit,
      materialCost: round2(materialCost),
      mermaPct,
      materialCostConMerma,
      laborCost,
      overheadCost,
      totalCost,
      unitCost,
      breakdown,
    };

    if (receta.producto) {
      const precioVenta = num(receta.producto.precio);
      result.precioVenta = precioVenta;
      result.foodCostPct =
        precioVenta > 0 ? round2((unitCost / precioVenta) * 100) : undefined;
    }

    return result;
  }

  /**
   * Costo unitario de todas las recetas, resuelto en memoria.
   *
   * `cost()` va a la base por cada receta y sub-receta; costear el catálogo
   * entero así serían cientos de consultas. Acá se traen todas de una vez y la
   * recursión se hace sobre el mapa. Devuelve recetaId → costo por unidad.
   */
  async costoUnitarioDeTodas(): Promise<Map<string, number>> {
    const recetas = await this.prisma.receta.findMany({
      include: { ingredientes: { include: { insumo: true } } },
    });
    const porId = new Map(recetas.map((r) => [r.id, r]));
    const resueltas = new Map<string, number>();

    const resolver = (id: string, camino: Set<string>): number => {
      const ya = resueltas.get(id);
      if (ya !== undefined) return ya;
      // Un ciclo en el BOM no debe colgar el listado: se cuenta como 0.
      if (camino.has(id)) return 0;
      const receta = porId.get(id);
      if (!receta) return 0;

      camino.add(id);
      let material = 0;
      for (const ing of receta.ingredientes) {
        if (ing.insumoId && ing.insumo) {
          const qty = convertUnit(
            num(ing.cantidad),
            ing.unidad as UnitOfMeasure,
            ing.insumo.unidad as UnitOfMeasure,
          );
          material += qty * num(ing.insumo.costoUnitario);
        } else if (ing.subRecetaId) {
          const sub = porId.get(ing.subRecetaId);
          const costoSub = resolver(ing.subRecetaId, camino);
          const qty = sub
            ? convertUnit(num(ing.cantidad), ing.unidad as UnitOfMeasure, sub.yieldUnit as UnitOfMeasure)
            : num(ing.cantidad);
          material += qty * costoSub;
        }
      }
      camino.delete(id);

      const mermaPct = num(receta.mermaPct);
      const factor = mermaPct > 0 ? 1 / (1 - Math.min(mermaPct, 95) / 100) : 1;
      const total = material * factor + num(receta.manoObraCosto) + num(receta.overheadCosto);
      const unitario = round2(total / (num(receta.yieldQty) || 1));
      resueltas.set(id, unitario);
      return unitario;
    };

    for (const r of recetas) resolver(r.id, new Set());
    return resueltas;
  }

  /**
   * Explota el BOM a insumos hoja para producir `multiplier` lotes de la receta.
   * Devuelve cantidades en la unidad de cada insumo (lista para descontar stock).
   */
  async explodeBom(
    recetaId: string,
    multiplier: number,
    path: Set<string> = new Set(),
    acc: Map<string, number> = new Map(),
  ): Promise<Map<string, number>> {
    if (path.has(recetaId)) {
      throw new BadRequestException("Ciclo detectado en el BOM");
    }
    path.add(recetaId);

    const receta = await this.prisma.receta.findUnique({
      where: { id: recetaId },
      include: { ingredientes: { include: { insumo: true, subReceta: true } } },
    });
    if (!receta) throw new NotFoundException("Receta no encontrada");

    for (const ing of receta.ingredientes) {
      if (ing.insumoId && ing.insumo) {
        const qty =
          convertUnit(
            num(ing.cantidad),
            ing.unidad as UnitOfMeasure,
            ing.insumo.unidad as UnitOfMeasure,
          ) * multiplier;
        acc.set(ing.insumoId, (acc.get(ing.insumoId) ?? 0) + qty);
      } else if (ing.subRecetaId && ing.subReceta) {
        const qtyInSubUnit = convertUnit(
          num(ing.cantidad),
          ing.unidad as UnitOfMeasure,
          ing.subReceta.yieldUnit as UnitOfMeasure,
        );
        const subYield = num(ing.subReceta.yieldQty) || 1;
        const subBatches = (qtyInSubUnit * multiplier) / subYield;
        await this.explodeBom(ing.subRecetaId, subBatches, path, acc);
      }
    }

    path.delete(recetaId);
    return acc;
  }
}
