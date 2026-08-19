import { IvaRate } from "./enums";

/**
 * Tasa sugerida para un producto, a partir de su nombre.
 *
 * Es una AYUDA para no cargar todo a mano, no una definición fiscal. La tasa
 * que vale es la que queda guardada en cada producto, y quien la confirma es
 * el contador. Ver docs/iva.md: ahí están las fuentes y lo que quedó abierto.
 *
 * El criterio general que surge de la normativa uruguaya:
 *   · Exento    alimentos sin elaborar (leche fluida, huevos, frutas y
 *               verduras en estado natural).
 *   · Mínima    la canasta de alimentos elaborados: pan, harinas, fideos,
 *               arroz, azúcar, yerba, café, té, aceite, carne, pescado.
 *   · Básica    todo lo demás: bebidas sin alcohol embotelladas, cerveza y
 *               vinos, artículos que no son alimento.
 */

interface Regla {
  tasa: IvaRate;
  /** Por qué, para poder mostrárselo a quien carga el producto. */
  motivo: string;
  /** Se busca en el nombre, sin acentos y en minúsculas. */
  claves: string[];
}

/** El orden importa: gana la primera que coincida. */
const REGLAS: Regla[] = [
  // ── Bebidas: van antes que nada porque "cafe" aparece en "cafe con leche",
  //    que es una bebida preparada, no el paquete de café de la góndola. ──
  {
    tasa: IvaRate.BASICA,
    motivo: "Bebida embotellada: no integra la canasta de alimentos.",
    claves: [
      "agua mineral", "agua con gas", "agua sin gas", "refresco", "gaseosa",
      "coca", "pepsi", "sprite", "fanta", "seven up", "tonica", "soda",
      "jugo envasado", "energizante", "isotonica",
    ],
  },
  {
    tasa: IvaRate.BASICA,
    motivo: "Bebida alcohólica: tasa básica.",
    claves: [
      "cerveza", "vino", "espumante", "champagne", "whisky", "vodka", "gin",
      "ron", "licor", "aperitivo", "fernet", "grappa", "cana",
    ],
  },
  {
    tasa: IvaRate.BASICA,
    motivo: "No es alimento: tasa básica.",
    claves: [
      "servilleta", "bolsa", "vela", "vaso", "tuper", "taper", "envase",
      "cubierto", "souvenir", "taza", "remera",
    ],
  },


  // ── Canasta de elaborados: tasa mínima ──
  {
    tasa: IvaRate.MINIMA,
    motivo: "Pan y panificados: canasta de alimentos, tasa mínima.",
    claves: [
      "pan", "panes", "pancito", "panificado", "galleta", "bizcocho", "factura", "medialuna", "croissant",
      "cruasan", "rosca", "grisin", "tostada", "chipa", "budin", "torta",
      "masa", "alfajor", "scon", "brioche", "pebete", "flauta", "marsellés",
      "marselles", "catalan", "porteñito", "portenito", "ciabatta", "focaccia",
      "empanada", "tarta", "pastel", "pizza", "sandwich", "sanguche", "tostado",
    ],
  },
  {
    tasa: IvaRate.MINIMA,
    motivo: "Café, té y yerba: canasta de alimentos, tasa mínima.",
    claves: ["cafe", "capuchino", "cortado", "expreso", "espresso", "te", "mate", "yerba", "submarino", "chocolatada"],
  },
  {
    tasa: IvaRate.MINIMA,
    motivo: "Alimento elaborado de la canasta: tasa mínima.",
    claves: [
      "harina", "fideo", "pasta", "arroz", "polenta", "avena", "azucar",
      "aceite", "sal", "vinagre", "carne", "pollo", "pescado", "milanesa",
      "queso", "manteca", "dulce de leche", "mermelada", "miel", "yogur",
      "helado", "postre", "flan", "mousse", "budin", "jugo",
    ],
  },

  // ── Sin elaborar: exentos ──
  // Van últimas a propósito: si fueran antes, "tarta de verdura" quedaría
  // exenta por nombrar un ingrediente, cuando es un producto elaborado.
  {
    tasa: IvaRate.EXENTO,
    motivo: "Leche fluida sin elaborar: exenta.",
    claves: ["leche entera", "leche descremada", "leche fresca", "leche uht", "leche pasteurizada"],
  },
  {
    tasa: IvaRate.EXENTO,
    motivo: "Alimento en estado natural: exento.",
    claves: ["huevo", "fruta fresca", "verdura", "hortaliza"],
  },
];

/** Quita acentos y pasa a minúsculas, para comparar sin sorpresas. */
const plano = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * ¿La clave aparece como palabra en el nombre?
 *
 * Con `includes` a secas, "te" matchea dentro de "leche entera" y la leche
 * termina cobrando como si fuera té. Por eso la clave tiene que empezar en
 * borde de palabra; y si es muy corta, también terminar ahí.
 */
function contienePalabra(nombre: string, clave: string): boolean {
  const c = escapar(plano(clave));
  const fin = plano(clave).length <= 3 ? "(?![a-z0-9])" : "";
  return new RegExp(`(^|[^a-z0-9])${c}${fin}`).test(nombre);
}

export interface SugerenciaIva {
  tasa: IvaRate;
  motivo: string;
  /** false cuando no se reconoció el producto y se cae al valor por defecto. */
  reconocido: boolean;
}

/**
 * Sugiere una tasa mirando el nombre del producto.
 *
 * Cuando no reconoce nada devuelve tasa mínima, que es la más habitual en una
 * panadería, y avisa que no lo reconoció para que se revise a mano.
 */
export function sugerirIva(nombre: string): SugerenciaIva {
  const n = plano(nombre);
  if (!n) return { tasa: IvaRate.MINIMA, motivo: "", reconocido: false };

  for (const regla of REGLAS) {
    if (regla.claves.some((c) => contienePalabra(n, c))) {
      return { tasa: regla.tasa, motivo: regla.motivo, reconocido: true };
    }
  }
  return {
    tasa: IvaRate.MINIMA,
    motivo: "No se reconoció el producto: se propone tasa mínima. Revisalo.",
    reconocido: false,
  };
}
