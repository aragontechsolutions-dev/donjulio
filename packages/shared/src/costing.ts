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

/** Umbrales de referencia (fuentes gastronómicas). */
export const FOOD_COST_OBJETIVO = { min: 28, max: 35 };
export const PRIME_COST_MAX = 65;

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
