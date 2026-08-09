import { UnitOfMeasure } from "./enums";

/**
 * Conversión de unidades para el costeo de recetas.
 * Se agrupan por dimensión (masa, volumen, conteo). Dentro de la misma
 * dimensión la conversión es exacta; entre dimensiones distintas no se puede
 * convertir y se devuelve la cantidad sin cambios (best-effort, con aviso).
 */

type Dimension = "MASA" | "VOLUMEN" | "CONTEO";

const DIMENSION: Record<UnitOfMeasure, Dimension> = {
  [UnitOfMeasure.G]: "MASA",
  [UnitOfMeasure.KG]: "MASA",
  [UnitOfMeasure.ML]: "VOLUMEN",
  [UnitOfMeasure.L]: "VOLUMEN",
  [UnitOfMeasure.UNIDAD]: "CONTEO",
  [UnitOfMeasure.DOCENA]: "CONTEO",
};

/** Factor a la unidad base de cada dimensión (g, ml, unidad). */
const TO_BASE: Record<UnitOfMeasure, number> = {
  [UnitOfMeasure.G]: 1,
  [UnitOfMeasure.KG]: 1000,
  [UnitOfMeasure.ML]: 1,
  [UnitOfMeasure.L]: 1000,
  [UnitOfMeasure.UNIDAD]: 1,
  [UnitOfMeasure.DOCENA]: 12,
};

export function sameDimension(a: UnitOfMeasure, b: UnitOfMeasure): boolean {
  return DIMENSION[a] === DIMENSION[b];
}

/**
 * Convierte `qty` de la unidad `from` a la unidad `to`.
 * Si las unidades no comparten dimensión, devuelve `qty` sin convertir.
 */
export function convertUnit(
  qty: number,
  from: UnitOfMeasure,
  to: UnitOfMeasure,
): number {
  if (from === to) return qty;
  if (!sameDimension(from, to)) return qty;
  return (qty * TO_BASE[from]) / TO_BASE[to];
}
