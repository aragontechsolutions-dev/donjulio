/**
 * Cómo se escribe "2 × Medialunas de manteca".
 *
 * Cuando alguien pide dos veces lo mismo no queremos dos renglones iguales:
 * queremos la cantidad delante y el nombre en plural. El plural castellano no
 * es "agregar una s" (pan → panes, nuez → nueces, jamón → jamones, inglés →
 * ingleses), así que hay reglas de verdad acá.
 *
 * Sólo se pluraliza el núcleo del nombre, no el complemento: en "Medialuna de
 * manteca" la manteca sigue siendo una. Por eso se corta en la primera
 * preposición.
 */

/** Une el núcleo con el complemento: lo que sigue no se toca. */
const CONECTORES = new Set([
  "de", "del", "con", "sin", "al", "a", "en", "para", "por", "y", "e", "o", "u",
  "la", "el", "los", "las", "un", "una", "tipo", "estilo", "sabor", "relleno",
  "x", "×",
]);

/** Extranjerismos que en la carta se escriben con -s, no con -es. */
const IRREGULARES: Record<string, string> = {
  bagel: "bagels",
  brownie: "brownies",
  club: "clubs",
  croissant: "croissants",
  donut: "donuts",
  macaron: "macarons",
  muffin: "muffins",
  pretzel: "pretzels",
  roll: "rolls",
  wrap: "wraps",
};

/**
 * Adjetivos habituales de la carta. Los nombres suelen escribirse con mayúscula
 * inicial en cada palabra ("Café Cortado"), así que no alcanza con mirar si va
 * en minúscula para saber si acompaña al núcleo: sin esta lista quedaría
 * "Cafés Cortado". Lo que no esté acá y venga en mayúscula se deja quieto,
 * porque suele ser un nombre propio ("Torta Chajá").
 */
const ADJETIVOS = new Set([
  "alemán", "americano", "artesanal", "bañado", "caliente", "canadiense", "casero",
  "chico", "clásico", "común", "completo", "criollo", "cortado", "cubierto", "doble",
  "dulce", "especial", "francés", "frío", "glaseado", "grande", "helado", "integral",
  "inglés", "largo", "mediano", "mixto", "natural", "negro", "pequeño", "relleno",
  "salado", "simple", "tostado", "triple", "vegano", "vegetariano",
  // femeninos que no se derivan quitando la o
  "casera", "criolla", "dulce", "rellena", "salada", "tostada", "chica",
]);

/** ¿Es un adjetivo conocido, en masculino o femenino? */
function esAdjetivoConocido(palabra: string): boolean {
  const p = palabra.toLowerCase();
  return ADJETIVOS.has(p) || (p.endsWith("a") && ADJETIVOS.has(p.slice(0, -1) + "o"));
}

const ACENTUADAS: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u" };

/**
 * Quita la tilde de la última sílaba, que es la que se pierde al agregar -es
 * (jamón → jamones). Si la tilde no está en la última sílaba se queda donde
 * está (árbol → árboles): se detecta mirando si después hay otra vocal.
 */
function sinTildeFinal(palabra: string): string {
  const i = Math.max(...Object.keys(ACENTUADAS).map((v) => palabra.lastIndexOf(v)));
  if (i < 0) return palabra;
  const despues = palabra.slice(i + 1);
  if (/[aeiouáéíóú]/.test(despues)) return palabra; // la tilde no es de la última sílaba
  return palabra.slice(0, i) + ACENTUADAS[palabra[i]] + despues;
}

/** ¿Ya está en plural? (vocal sin tilde + s: medialunas, tostadas) */
function yaEsPlural(palabra: string): boolean {
  return /[aeiou]s$/.test(palabra) && palabra.length > 3;
}

/** Plural de una palabra suelta, en minúsculas. */
function pluralPalabra(palabra: string): string {
  if (IRREGULARES[palabra]) return IRREGULARES[palabra];
  if (yaEsPlural(palabra)) return palabra;
  if (/[aeiouáéó]$/.test(palabra)) return palabra + "s"; // medialuna, café
  if (/[íú]$/.test(palabra)) return palabra + "es"; // maní → maníes
  if (/z$/.test(palabra)) return palabra.slice(0, -1) + "ces"; // nuez → nueces
  if (/(ch|sh)$/.test(palabra)) return palabra + "es"; // sándwich → sándwiches
  if (/[nlrdjs]$/.test(palabra)) return sinTildeFinal(palabra) + "es"; // pan, alfajor, inglés
  return palabra + "s"; // extranjerismos y finales raros: croissant, chip
}

/** Devuelve `plural` con las mayúsculas del original (Pan → Panes, PAN → PANES). */
function conMayusculasDe(original: string, plural: string): string {
  if (original === original.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(original)) return plural.toUpperCase();
  if (original[0] === original[0]?.toUpperCase()) return plural[0].toUpperCase() + plural.slice(1);
  return plural;
}

/**
 * Pluraliza el núcleo del nombre de un producto.
 *
 * "Medialuna de manteca" → "Medialunas de manteca"
 * "Budín inglés"         → "Budines ingleses"
 * "Café con leche"       → "Cafés con leche"
 */
export function pluralizarNombre(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return nombre;

  return palabras
    .map((palabra, i) => {
      if (i > 0) {
        // Sólo el núcleo: se corta en la primera preposición, y el adjetivo que
        // acompaña se pluraliza si venía en minúscula (los nombres propios no:
        // "Torta Chajá" no es "Tortas Chajás").
        const previas = palabras.slice(0, i);
        const hayConector = previas.some((p) => CONECTORES.has(p.toLowerCase()));
        // Un adjetivo es una palabra de letras, en minúscula o de la lista
        // conocida: "600 ml" o "N°2" acompañan al nombre pero no se pluralizan.
        const soloLetras = /^[a-záéíóúüñ]{3,}$/.test(palabra.toLowerCase());
        const esAdjetivo =
          i === 1 &&
          soloLetras &&
          (palabra[0] === palabra[0].toLowerCase() || esAdjetivoConocido(palabra));
        if (hayConector || CONECTORES.has(palabra.toLowerCase()) || !esAdjetivo) return palabra;
      }
      const plural = pluralPalabra(palabra.toLowerCase());
      return conMayusculasDe(palabra, plural);
    })
    .join(" ");
}

/**
 * Cómo se muestra una línea de pedido: con cantidad y en plural si son varios.
 *
 * (1, "Medialuna de manteca") → "Medialuna de manteca"
 * (2, "Medialuna de manteca") → "2 × Medialunas de manteca"
 */
export function lineaConCantidad(cantidad: number, nombre: string): string {
  const n = Math.max(1, Math.round(cantidad || 1));
  return n > 1 ? `${n} × ${pluralizarNombre(nombre)}` : nombre;
}
