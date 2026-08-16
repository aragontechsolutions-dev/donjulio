/**
 * Minúsculas y sin acentos, para comparar texto escrito por personas.
 * Espeja lo que hace el backend al buscar insumos, así el filtrado del
 * navegador y el de la base dan el mismo resultado.
 */
export const plano = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** ¿`texto` contiene `busqueda`, ignorando mayúsculas y acentos? */
export const coincide = (texto: string, busqueda: string) =>
  plano(texto).includes(plano(busqueda));
