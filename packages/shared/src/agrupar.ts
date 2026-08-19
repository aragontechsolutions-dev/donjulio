/** Agrupa elementos iguales conservando el orden en que aparecieron. */
export interface Grupo<T> {
  clave: string;
  cantidad: number;
  /** Los elementos originales, para poder sacar uno solo del grupo. */
  lineas: T[];
  /** El primero: sirve para leer nombre, precio unitario, etc. */
  primera: T;
}

/**
 * @param clave qué hace iguales a dos elementos.
 * @param peso  cuánto suma cada uno (por defecto 1; un ítem ya guardado suma
 *              su propia cantidad).
 */
export function agruparIguales<T>(
  lineas: readonly T[],
  clave: (linea: T) => string,
  peso: (linea: T) => number = () => 1,
): Grupo<T>[] {
  const grupos = new Map<string, Grupo<T>>();
  for (const linea of lineas) {
    const k = clave(linea);
    const g = grupos.get(k);
    if (g) {
      g.cantidad += peso(linea);
      g.lineas.push(linea);
    } else {
      grupos.set(k, { clave: k, cantidad: peso(linea), lineas: [linea], primera: linea });
    }
  }
  return [...grupos.values()];
}
