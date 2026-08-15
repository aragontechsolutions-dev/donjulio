/**
 * Rotulado frontal (Decreto 272/018 y modificativos — Uruguay).
 *
 * Los umbrales quedan centralizados acá para poder ajustarlos en un solo
 * lugar si la normativa cambia. Los valores se declaran por 100 g en
 * alimentos sólidos y por 100 ml en líquidos.
 *
 * IMPORTANTE: el cálculo es una AYUDA para el rotulado, no una
 * certificación. La declaración final debe validarse con el análisis
 * bromatológico del producto y la normativa vigente.
 */

export interface UmbralesOctogono {
  /** Azúcares totales (g). */
  azucares: number;
  /** Sodio (mg). */
  sodioMg: number;
  /** Grasas totales (g). */
  grasasTotales: number;
  /** Grasas saturadas (g). */
  grasasSaturadas: number;
}

/** Umbrales para alimentos sólidos, por 100 g. */
export const UMBRALES_SOLIDOS: UmbralesOctogono = {
  azucares: 13,
  sodioMg: 500,
  grasasTotales: 13,
  grasasSaturadas: 6,
};

/** Umbrales para alimentos líquidos, por 100 ml. */
export const UMBRALES_LIQUIDOS: UmbralesOctogono = {
  azucares: 6,
  sodioMg: 200,
  grasasTotales: 6,
  grasasSaturadas: 3,
};

export const umbralesPara = (esLiquido: boolean): UmbralesOctogono =>
  esLiquido ? UMBRALES_LIQUIDOS : UMBRALES_SOLIDOS;

/** Valores nutricionales declarados por 100 g / 100 ml. */
export interface ValoresNutricionales {
  azucares?: number | null;
  sodioMg?: number | null;
  grasasTotales?: number | null;
  grasasSaturadas?: number | null;
}

export interface Octogonos {
  excesoAzucares: boolean;
  excesoSodio: boolean;
  excesoGrasas: boolean;
  excesoGrasasSat: boolean;
}

/** Sugiere los sellos frontales a partir de los valores declarados. */
export function calcularOctogonos(
  v: ValoresNutricionales,
  esLiquido = false,
): Octogonos {
  const u = umbralesPara(esLiquido);
  const supera = (valor: number | null | undefined, limite: number) =>
    valor != null && Number(valor) >= limite;
  return {
    excesoAzucares: supera(v.azucares, u.azucares),
    excesoSodio: supera(v.sodioMg, u.sodioMg),
    excesoGrasas: supera(v.grasasTotales, u.grasasTotales),
    excesoGrasasSat: supera(v.grasasSaturadas, u.grasasSaturadas),
  };
}

/** Etiquetas de los sellos, tal como se imprimen en el octógono. */
export const OCTOGONO_LABEL: Record<keyof Octogonos, string> = {
  excesoAzucares: "EXCESO AZÚCARES",
  excesoSodio: "EXCESO SODIO",
  excesoGrasas: "EXCESO GRASAS",
  excesoGrasasSat: "EXCESO GRASAS SATURADAS",
};

/** Lista de sellos activos, lista para renderizar. */
export function octogonosActivos(o: Partial<Octogonos>): string[] {
  return (Object.keys(OCTOGONO_LABEL) as (keyof Octogonos)[])
    .filter((k) => o[k])
    .map((k) => OCTOGONO_LABEL[k]);
}
