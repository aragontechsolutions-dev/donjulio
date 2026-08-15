import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ProductionOrderStatus, StockMovementType } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { RecipesService } from "../recipes/recipes.service";
import { AdvanceOrdenDto, CreateOrdenDto } from "./production.dto";

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === "number" ? d : d.toNumber();

@Injectable()
export class ProductionService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private recipes: RecipesService,
  ) {}

  list() {
    return this.prisma.ordenProduccion.findMany({
      orderBy: { createdAt: "desc" },
      include: { receta: true, lotes: true },
      take: 200,
    });
  }

  create(dto: CreateOrdenDto) {
    return this.prisma.ordenProduccion.create({
      data: {
        recetaId: dto.recetaId,
        cantidadLotes: dto.cantidadLotes,
        planificadaPara: dto.planificadaPara
          ? new Date(dto.planificadaPara)
          : null,
      },
      include: { receta: true },
    });
  }

  /** Vista previa: insumos requeridos y faltantes para una orden planificada. */
  async requerimientos(id: string) {
    const orden = await this.getOrden(id);
    const bom = await this.recipes.explodeBom(
      orden.recetaId,
      num(orden.cantidadLotes),
    );
    const insumoIds = [...bom.keys()];
    const insumos = await this.prisma.insumo.findMany({
      where: { id: { in: insumoIds } },
    });
    return insumoIds.map((iid) => {
      const insumo = insumos.find((i) => i.id === iid);
      const necesario = bom.get(iid) ?? 0;
      const disponible = num(insumo?.stockActual);
      return {
        insumoId: iid,
        nombre: insumo?.nombre ?? iid,
        unidad: insumo?.unidad,
        necesario: Math.round(necesario * 1000) / 1000,
        disponible,
        faltante: Math.max(0, Math.round((necesario - disponible) * 1000) / 1000),
      };
    });
  }

  async advance(id: string, dto: AdvanceOrdenDto, usuarioId?: string) {
    const orden = await this.getOrden(id);
    const { status } = dto;

    // PLANIFICADA → EN_PROCESO: descuenta stock (una sola vez).
    if (
      orden.status === ProductionOrderStatus.PLANIFICADA &&
      status === ProductionOrderStatus.EN_PROCESO
    ) {
      return this.iniciar(orden, dto, usuarioId);
    }

    // EN_PROCESO → TERMINADA: genera lote de producto terminado.
    if (
      orden.status === ProductionOrderStatus.EN_PROCESO &&
      status === ProductionOrderStatus.TERMINADA
    ) {
      return this.terminar(orden, dto);
    }

    // Cancelación sólo desde PLANIFICADA (sin stock movido).
    if (status === ProductionOrderStatus.CANCELADA) {
      if (orden.status === ProductionOrderStatus.EN_PROCESO) {
        throw new BadRequestException(
          "No se puede cancelar una orden EN_PROCESO (ya descontó insumos)",
        );
      }
      return this.prisma.ordenProduccion.update({
        where: { id },
        data: { status: ProductionOrderStatus.CANCELADA },
      });
    }

    throw new BadRequestException(
      `Transición inválida: ${orden.status} → ${status}`,
    );
  }

  private async iniciar(
    orden: { id: string; recetaId: string; cantidadLotes: Prisma.Decimal },
    dto: AdvanceOrdenDto,
    usuarioId?: string,
  ) {
    const bom = await this.recipes.explodeBom(
      orden.recetaId,
      num(orden.cantidadLotes),
    );
    const insumoIds = [...bom.keys()];
    const insumos = await this.prisma.insumo.findMany({
      where: { id: { in: insumoIds } },
    });

    // Verifica suficiencia salvo que se permita negativo.
    if (!dto.permitirNegativo) {
      const faltantes = insumoIds
        .map((iid) => {
          const insumo = insumos.find((i) => i.id === iid);
          const nec = bom.get(iid) ?? 0;
          return { nombre: insumo?.nombre ?? iid, falta: nec - num(insumo?.stockActual) };
        })
        .filter((f) => f.falta > 0.0001);
      if (faltantes.length) {
        throw new BadRequestException(
          "Stock insuficiente: " +
            faltantes.map((f) => `${f.nombre} (falta ${f.falta.toFixed(2)})`).join(", "),
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const iid of insumoIds) {
        const insumo = insumos.find((i) => i.id === iid);
        // Consumo por FEFO: descuenta de los lotes que vencen antes y deja
        // registrado qué lote se usó (trazabilidad).
        await this.inventory.consumirFefo(iid, bom.get(iid) ?? 0, {
          costoUnitario: num(insumo?.costoUnitario),
          motivo: `Producción orden ${orden.id.slice(0, 8)}`,
          ordenProduccionId: orden.id,
          usuarioId,
          tx,
        });
      }
      return tx.ordenProduccion.update({
        where: { id: orden.id },
        data: {
          status: ProductionOrderStatus.EN_PROCESO,
          iniciadaAt: new Date(),
        },
        include: { receta: true },
      });
    });
  }

  private async terminar(
    orden: { id: string; recetaId: string; cantidadLotes: Prisma.Decimal },
    dto: AdvanceOrdenDto,
  ) {
    const receta = await this.prisma.receta.findUnique({
      where: { id: orden.recetaId },
    });
    const expiresAt = dto.diasVencimiento
      ? new Date(Date.now() + dto.diasVencimiento * 86400000)
      : null;

    return this.prisma.$transaction(async (tx) => {
      if (receta?.productoId) {
        await tx.productionLot.create({
          data: {
            ordenProduccionId: orden.id,
            productoId: receta.productoId,
            lote: `OP-${orden.id.slice(0, 8)}-${Date.now().toString().slice(-5)}`,
            qty: num(receta.yieldQty) * num(orden.cantidadLotes),
            expiresAt,
          },
        });
      }
      return tx.ordenProduccion.update({
        where: { id: orden.id },
        data: {
          status: ProductionOrderStatus.TERMINADA,
          terminadaAt: new Date(),
        },
        include: { receta: true, lotes: true },
      });
    });
  }

  private async getOrden(id: string) {
    const orden = await this.prisma.ordenProduccion.findUnique({ where: { id } });
    if (!orden) throw new NotFoundException("Orden de producción no encontrada");
    return orden;
  }
}
