import { IvaRate } from "./enums";

/**
 * Tasa sugerida para un producto, a partir de su nombre.
 *
 * Basado en el **artículo 101 del Decreto 220/998** (texto actualizado a marzo
 * de 2026), que reglamenta el IVA. Ese artículo es **taxativo**: "Pagarán la
 * tasa mínima del tributo las operaciones relativas a los siguientes bienes y
 * servicios", y enumera. Lo que no está en esa lista y no está exonerado, va a
 * tasa básica.
 *
 * Para una panadería eso da un resultado que sorprende: el pan blanco común y
 * la galleta de campaña van al 10 %, pero las facturas, medialunas, bizcochos
 * y tortas NO están en la lista, así que van al 22 %.
 *
 * Sigue siendo una AYUDA, no una definición fiscal: la tasa que vale es la que
 * queda guardada en cada producto, y quien la confirma es el contador.
 * Ver docs/iva.md, con las citas y lo que quedó abierto.
 */

interface Regla {
  tasa: IvaRate;
  /** Por qué, para poder mostrárselo a quien carga el producto. */
  motivo: string;
  /** Se busca como palabra dentro del nombre, sin acentos. */
  claves: string[];
  /** La norma depende de un dato que el nombre no dice: hay que mirarlo. */
  revisar?: boolean;
}

const CITA = "art. 101 lit. a, Dto. 220/998";

/** El orden importa: gana la primera que coincida. */
const REGLAS: Regla[] = [
  // ── Bebidas y no alimentos: nada de esto está en el artículo 101 ──
  {
    tasa: IvaRate.BASICA,
    motivo: "Bebida embotellada: no figura entre los bienes de tasa mínima.",
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
      "ron", "licor", "aperitivo", "fernet", "grappa",
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

  // ── Confitería y preparados ──
  // Van ANTES que la regla del pan, para que "pan dulce" no se cuele como
  // pan común.
  {
    tasa: IvaRate.BASICA,
    motivo: `Confitería: no está entre los bienes de tasa mínima (${CITA}).`,
    claves: [
      "factura", "medialuna", "croissant", "cruasan", "bizcocho", "torta",
      "masa", "alfajor", "budin", "scon", "brioche", "rosca", "pan dulce",
      "pastel", "tarta", "postre", "flan", "mousse", "helado", "muffin",
      "cookie", "galletita", "churro", "pionono", "merengue",
    ],
  },
  {
    tasa: IvaRate.BASICA,
    motivo: `Preparado de rotisería: no está entre los bienes de tasa mínima (${CITA}).`,
    claves: ["empanada", "pizza", "sandwich", "sanguche", "tostado", "pebete", "chivito"],
  },

  // ── Lo que el artículo 101 sí enumera ──
  {
    tasa: IvaRate.MINIMA,
    revisar: true,
    motivo: `Pan blanco común y galleta de campaña: tasa mínima (${CITA}). Un pan especial (integral, de semillas, con relleno) puede no calificar y sería 22 %.`,
    claves: [
      "pan", "panes", "pancito", "galleta", "flauta", "catalan", "marselles",
      "portenito", "felipe", "figazza",
    ],
  },
  {
    tasa: IvaRate.MINIMA,
    motivo: `Café, té y yerba figuran entre los bienes de tasa mínima (${CITA}). Servidos en mesa podrían ser servicio gastronómico: consultalo.`,
    claves: ["cafe", "capuchino", "cortado", "expreso", "espresso", "te", "mate", "yerba"],
  },

  // ── Leche: exonerada, pero NO toda ──
  // Art. 38 num. 1 lit. F) del Título 10 exonera la leche "pasterizada,
  // ultrapasterizada, vitaminizada, descremada, en polvo, EXCEPTO la
  // saborizada y la UHT o UAT". La de cajita larga vida, entonces, no está
  // exonerada; y como tampoco figura en tasa mínima, va a básica.
  {
    tasa: IvaRate.BASICA,
    motivo:
      "La exoneración de la leche excluye expresamente la UHT/UAT y la saborizada (art. 38 num. 1 lit. F, Título 10).",
    claves: ["leche uht", "leche uat", "leche larga vida", "leche saborizada", "chocolatada"],
  },
  {
    tasa: IvaRate.EXENTO,
    motivo: "Leche pasterizada, descremada, vitaminizada o en polvo: exenta (art. 38 num. 1 lit. F, Título 10).",
    claves: [
      "leche pasteurizada", "leche pasterizada", "leche ultrapasterizada",
      "leche descremada", "leche en polvo", "leche vitaminizada",
    ],
  },
  {
    tasa: IvaRate.EXENTO,
    revisar: true,
    motivo:
      "La leche está exenta salvo la UHT/UAT y la saborizada. El nombre no dice el proceso: confirmá cuál es.",
    claves: ["leche"],
  },

  {
    tasa: IvaRate.MINIMA,
    motivo: `Enumerado entre los bienes de tasa mínima (${CITA}).`,
    claves: [
      "harina", "fideo", "pasta", "arroz", "azucar", "aceite", "sal",
      "carne", "menudencia", "pollo", "ave", "cerdo", "conejo", "pescado", "jabon",
    ],
  },
  {
    tasa: IvaRate.MINIMA,
    motivo:
      "Frutas, flores y hortalizas en estado natural: tasa mínima al vender a consumo final (art. 36 lit. K, Título 10). No es exento.",
    claves: ["fruta", "verdura", "hortaliza", "flor"],
  },
  {
    tasa: IvaRate.BASICA,
    motivo:
      "Los huevos no figuran ni entre los bienes exonerados ni entre los de tasa mínima: tasa básica.",
    claves: ["huevo"],
  },
  {
    tasa: IvaRate.EXENTO,
    motivo: "Diarios, revistas y libros: exentos (art. 38 num. 1 lit. H, Título 10).",
    claves: ["diario", "revista", "libro"],
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
  const fin = plano(clave).length <= 4 ? "(?![a-z0-9])" : "";
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
 * Cuando no reconoce nada devuelve tasa básica, no mínima: la lista del
 * artículo 101 es cerrada, así que lo que no se identifica como parte de ella
 * lo más probable es que sea básica. Igual queda marcado para revisar.
 */
export function sugerirIva(nombre: string): SugerenciaIva {
  const n = plano(nombre);
  if (!n) return { tasa: IvaRate.BASICA, motivo: "", reconocido: false };

  for (const regla of REGLAS) {
    if (regla.claves.some((c) => contienePalabra(n, c))) {
      return { tasa: regla.tasa, motivo: regla.motivo, reconocido: !regla.revisar };
    }
  }
  return {
    tasa: IvaRate.BASICA,
    motivo:
      "No se reconoció el producto. La lista de tasa mínima es cerrada, así que se propone básica. Revisalo.",
    reconocido: false,
  };
}
