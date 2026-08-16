import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { StockMovementType } from "@donjulio/shared";
import { PrismaService } from "../prisma/prisma.service";
import {
  BulkEntryDto,
  CreateInsumoDto,
  CreateProveedorDto,
  INSUMOS_POR_PAGINA,
  ListInsumosQueryDto,
  StockAdjustDto,
  StockEntryDto,
  UpdateInsumoDto,
} from "./inventory.dto";

const num = (d: Prisma.Decimal | number | null | undefined): number =>
  d == null ? 0 : typeof d === "number" ? d : d.toNumber();

// Nadie escribe los acentos al buscar: "azucar" tiene que encontrar "Azúcar".
// Postgres no ignora acentos con ILIKE, así que se los saca de los dos lados
// con translate(). Se usa esto en vez de la extensión `unaccent` para no
// depender de que esté instalada en la base.
const ACENTOS = "áàäâãéèëêíìïîóòöôõúùüûñç";
const SIN_ACENTOS = "aaaaaeeeeiiiiooooouuuunc";

/** Minúsculas y sin acentos, igual que hace el `translate` del SQL. */
const plano = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Escapa los comodines de LIKE para que se busquen como texto literal. */
const escaparLike = (s: string) => s.replace(/([\\%_])/g, "\\$1");

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
  /**
   * Listado paginado con búsqueda por nombre. El panel lo llama en cada tecla,
   * así que devuelve sólo la página pedida y el total para armar el paginador.
   */
  async listInsumos(query: ListInsumosQueryDto = {}) {
    const perPage = query.perPage ?? INSUMOS_POR_PAGINA[0];
    const q = query.q?.trim();
    const where: Prisma.InsumoWhereInput = q
      ? { id: { in: await this.buscarIds(q) } }
      : {};

    const total = await this.prisma.insumo.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    // Si se borran insumos o se filtra estando en la página 7, no dejar al
    // panel mirando una página que ya no existe.
    const page = Math.min(Math.max(1, query.page ?? 1), totalPages);

    const items = await this.prisma.insumo.findMany({
      where,
      orderBy: { nombre: "asc" },
      include: { proveedor: true },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    return { items, total, page, perPage, totalPages };
  }

  /**
   * Ids de los insumos cuyo nombre contiene `q`, ignorando mayúsculas y
   * acentos. Devuelve ids y no filas para poder seguir paginando con Prisma.
   */
  private async buscarIds(q: string): Promise<string[]> {
    const patron = `%${escaparLike(plano(q))}%`;
    const filas = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Insumo"
      WHERE translate(lower(nombre), ${ACENTOS}, ${SIN_ACENTOS}) LIKE ${patron} ESCAPE '\\'
    `;
    return filas.map((f) => f.id);
  }

  /**
   * Lista completa y liviana, para los selectores de recetas y mermas, que
   * necesitan todos los insumos y no paginan.
   */
  listInsumosOpciones() {
    return this.prisma.insumo.findMany({
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        unidad: true,
        costoUnitario: true,
        stockActual: true,
      },
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
  //
  // El pooler de Supabase (pgbouncer en modo transacción) no mantiene la misma
  // conexión entre idas y vueltas, así que las transacciones interactivas
  // (`$transaction(async tx => …)`) fallan con "Transaction not found". Por eso
  // los helpers arman las operaciones y el llamador las aplica todas juntas con
  // `$transaction([...])`, que viaja en un solo request.

  /** Operaciones de un movimiento: el registro y el ajuste de `stockActual`. */
  private opsMovimiento(
    insumoId: string,
    tipo: StockMovementType,
    delta: number,
    opts: {
      costoUnitario?: number;
      motivo?: string;
      ordenProduccionId?: string;
      insumoLoteId?: string;
      usuarioId?: string;
    } = {},
  ): Prisma.PrismaPromise<unknown>[] {
    return [
      this.prisma.movimientoStock.create({
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
      }),
      this.prisma.insumo.update({
        where: { id: insumoId },
        data: { stockActual: { increment: delta } },
      }),
    ];
  }

  /**
   * Aplica un movimiento suelto (mermas, ajustes). `delta` es el cambio neto:
   * positivo entra, negativo sale.
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
    } = {},
  ) {
    const [, insumo] = await this.prisma.$transaction(
      this.opsMovimiento(insumoId, tipo, delta, opts),
    );
    return insumo;
  }

  /**
   * Planifica el consumo de un insumo por FEFO (primero el que vence antes),
   * con un movimiento por lote para poder trazarlo. Lee los lotes y devuelve
   * las operaciones; no toca la base hasta que el llamador las aplique.
   *
   * Si no hay lotes cargados (o no alcanzan), el resto sale sin lote.
   */
  async opsConsumirFefo(
    insumoId: string,
    cantidad: number,
    opts: {
      costoUnitario?: number;
      motivo?: string;
      ordenProduccionId?: string;
      usuarioId?: string;
    } = {},
  ): Promise<Prisma.PrismaPromise<unknown>[]> {
    const lotes = await this.prisma.insumoLote.findMany({
      where: { insumoId, cantidad: { gt: 0 } },
      orderBy: [{ vencimiento: "asc" }, { recibidoAt: "asc" }],
    });

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    let restante = cantidad;
    for (const lote of lotes) {
      if (restante <= 0.0001) break;
      const toma = Math.min(restante, num(lote.cantidad));
      ops.push(
        this.prisma.insumoLote.update({
          where: { id: lote.id },
          data: { cantidad: { decrement: toma } },
        }),
        ...this.opsMovimiento(insumoId, StockMovementType.SALIDA, -toma, {
          ...opts,
          costoUnitario: opts.costoUnitario ?? num(lote.costoUnitario),
          insumoLoteId: lote.id,
        }),
      );
      restante -= toma;
    }

    if (restante > 0.0001) {
      ops.push(...this.opsMovimiento(insumoId, StockMovementType.SALIDA, -restante, opts));
    }
    return ops;
  }

  /** Consume por FEFO de inmediato, cuando no hay más operaciones que juntar. */
  async consumirFefo(
    insumoId: string,
    cantidad: number,
    opts: {
      costoUnitario?: number;
      motivo?: string;
      ordenProduccionId?: string;
      usuarioId?: string;
    } = {},
  ) {
    await this.prisma.$transaction(await this.opsConsumirFefo(insumoId, cantidad, opts));
  }

  /** Operaciones de una entrada de stock, para juntarlas con otras. */
  private opsEntrada(
    insumoId: string,
    dto: StockEntryDto,
    costoActual: number,
    usuarioId?: string,
  ): Prisma.PrismaPromise<unknown>[] {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    // Actualiza costo unitario si vino con la compra.
    if (dto.costoUnitario != null) {
      ops.push(
        this.prisma.insumo.update({
          where: { id: insumoId },
          data: { costoUnitario: dto.costoUnitario },
        }),
      );
    }
    if (dto.lote) {
      ops.push(
        this.prisma.insumoLote.create({
          data: {
            insumoId,
            lote: dto.lote,
            cantidad: dto.cantidad,
            vencimiento: dto.vencimiento ? new Date(dto.vencimiento) : null,
            costoUnitario: dto.costoUnitario ?? costoActual,
          },
        }),
      );
    }
    ops.push(
      ...this.opsMovimiento(insumoId, StockMovementType.ENTRADA, dto.cantidad, {
        costoUnitario: dto.costoUnitario ?? costoActual,
        motivo: dto.motivo ?? "Compra/recepción",
        usuarioId,
      }),
    );
    return ops;
  }

  async registrarEntrada(insumoId: string, dto: StockEntryDto, usuarioId?: string) {
    const insumo = await this.ensureInsumo(insumoId);
    const ops = this.opsEntrada(insumoId, dto, num(insumo.costoUnitario), usuarioId);
    const res = await this.prisma.$transaction(ops);
    return res[res.length - 1];
  }

  /**
   * Recepción de varios insumos de una sola vez (el remito de un proveedor).
   *
   * Valida todo antes de tocar nada: si un insumo no existe o viene repetido,
   * no se aplica ninguna línea. Así el remito entra completo o no entra, sin
   * dejar el stock a medio cargar.
   */
  async registrarEntradas(dto: BulkEntryDto, usuarioId?: string) {
    const ids = dto.items.map((i) => i.insumoId);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (repetidos.length > 0) {
      throw new BadRequestException(
        "Hay insumos repetidos en la lista. Juntá las cantidades en una sola línea.",
      );
    }

    const insumos = await this.prisma.insumo.findMany({
      where: { id: { in: ids } },
      select: { id: true, nombre: true, costoUnitario: true },
    });
    const porId = new Map(insumos.map((i) => [i.id, i]));
    const faltantes = ids.filter((id) => !porId.has(id));
    if (faltantes.length > 0) {
      throw new NotFoundException(
        `No se encontraron ${faltantes.length} de los insumos seleccionados. Recargá la página.`,
      );
    }

    // Todas las líneas del remito en una sola transacción: o entra completo o
    // no entra, sin quedar a medias si algo falla en el medio.
    const ops = dto.items.flatMap((item) =>
      this.opsEntrada(
        item.insumoId,
        {
          cantidad: item.cantidad,
          costoUnitario: item.costoUnitario,
          lote: item.lote,
          vencimiento: item.vencimiento,
          motivo: dto.motivo,
        },
        num(porId.get(item.insumoId)!.costoUnitario),
        usuarioId,
      ),
    );
    await this.prisma.$transaction(ops);

    return {
      aplicados: dto.items.length,
      insumos: dto.items.map((i) => porId.get(i.insumoId)!.nombre),
    };
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

  // ---------- Stock de producto terminado ----------
  //
  // Lo producido vive en `ProductionLot`, igual que los insumos viven en
  // `InsumoLote`: producir suma un lote y vender lo descuenta. El disponible
  // de un producto es la suma de sus lotes.

  /** Unidades disponibles por producto. Sólo devuelve los que tienen lotes. */
  async stockProductos(productoIds?: string[]): Promise<Map<string, number>> {
    const filas = await this.prisma.productionLot.groupBy({
      by: ["productoId"],
      where: {
        productoId: productoIds ? { in: productoIds } : { not: null },
        qty: { gt: 0 },
      },
      _sum: { qty: true },
    });
    return new Map(
      filas
        .filter((f): f is typeof f & { productoId: string } => f.productoId != null)
        .map((f) => [f.productoId, num(f._sum.qty)]),
    );
  }

  /**
   * Planifica el descuento de `cantidad` unidades de un producto por FEFO
   * (primero el lote que vence antes). Devuelve las operaciones para aplicar
   * junto con el resto de la venta, en una sola transacción.
   *
   * Si no alcanza, descuenta lo que hay: quien llama ya validó el stock, y
   * bloquear acá dejaría la venta a medio registrar.
   */
  async opsDescontarProducto(
    productoId: string,
    cantidad: number,
  ): Promise<Prisma.PrismaPromise<unknown>[]> {
    const lotes = await this.prisma.productionLot.findMany({
      where: { productoId, qty: { gt: 0 } },
      orderBy: [{ expiresAt: "asc" }, { producedAt: "asc" }],
    });
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    let restante = cantidad;
    for (const lote of lotes) {
      if (restante <= 0.0001) break;
      const toma = Math.min(restante, num(lote.qty));
      ops.push(
        this.prisma.productionLot.update({
          where: { id: lote.id },
          data: { qty: { decrement: toma } },
        }),
      );
      restante -= toma;
    }
    return ops;
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
