/** Tipos de costeo y reportes compartidos entre API y frontend. */

export interface RecipeCostBreakdownItem {
  tipo: "INSUMO" | "SUBRECETA";
  nombre: string;
  cantidad: number;
  unidad: string;
  costo: number;
}

export interface RecipeCost {
  recetaId: string;
  nombre: string;
  yieldQty: number;
  yieldUnit: string;
  materialCost: number;
  mermaPct: number;
  materialCostConMerma: number;
  laborCost: number;
  overheadCost: number;
  /** Costo total del lote (rendimiento completo). */
  totalCost: number;
  /** Costo por unidad de rendimiento. */
  unitCost: number;
  breakdown: RecipeCostBreakdownItem[];
  /** Sólo si la receta está asociada a un producto con precio de venta. */
  precioVenta?: number;
  foodCostPct?: number;
}

/** De dónde sale el costo de un producto. */
export type OrigenCosto = "RECETA" | "COMPRA" | "SIN_COSTO";

/** Costo y rentabilidad de un producto, venga de receta o de compra. */
export interface ProductoCosteo {
  productoId: string;
  origen: OrigenCosto;
  /** Costo unitario, o null si todavía no se puede calcular. */
  costoUnitario: number | null;
  precio: number;
  /** costo / precio × 100. Null si falta el costo o el precio es 0. */
  foodCostPct: number | null;
  /** Ganancia por unidad, antes de impuestos. */
  margen: number | null;
  /** Id de la receta que lo costea, si es elaborado. */
  recetaId?: string;
}

/**
 * Umbrales de referencia (fuentes gastronómicas). Por debajo del mínimo
 * conviene revisar si el costo está bien cargado; por encima del máximo el
 * producto deja poco margen.
 */
export const FOOD_COST_OBJETIVO = { min: 28, max: 35 };
export const PRIME_COST_MAX = 65;

export type SemaforoFoodCost = "SIN_DATO" | "BAJO" | "OBJETIVO" | "ALTO" | "CRITICO";

/** Clasifica un food cost contra el rango objetivo. */
export function semaforoFoodCost(pct: number | null | undefined): SemaforoFoodCost {
  if (pct == null) return "SIN_DATO";
  if (pct < FOOD_COST_OBJETIVO.min) return "BAJO";
  if (pct <= FOOD_COST_OBJETIVO.max) return "OBJETIVO";
  if (pct <= 45) return "ALTO";
  return "CRITICO";
}

export interface DashboardKpis {
  desde: string;
  hasta: string;
  ventasTotales: number;
  cantidadPedidos: number;
  ticketPromedio: number;
  ventasPorCategoria: { categoria: string; total: number }[];
  ventasPorCanal: { canal: string; total: number }[];
  productosTop: { nombre: string; cantidad: number; total: number }[];
  mermaTotalCosto: number;
  foodCostPromedioPct: number | null;
}
