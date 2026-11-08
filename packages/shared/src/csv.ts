/**
 * Lectura de CSV para la carga masiva.
 *
 * No se usa una librería porque el problema de verdad no es partir por comas,
 * son los archivos que salen de Excel en español: separador `;`, decimales con
 * coma, BOM al principio y saltos CRLF. Todo eso se contempla acá.
 */

/** Separadores que puede traer un CSV exportado de Excel o Google Sheets. */
const SEPARADORES = [",", ";", "\t"] as const;

/** Quita el BOM que Excel pone al principio del archivo. */
const sinBom = (texto: string) => (texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto);

/**
 * Adivina el separador mirando la primera línea: gana el que más veces aparece
 * fuera de comillas. Con un archivo de una sola columna da igual cuál salga.
 */
export function detectarSeparador(texto: string): string {
  const primera = sinBom(texto).split(/\r?\n/, 1)[0] ?? "";
  let mejor = ",";
  let max = -1;
  for (const sep of SEPARADORES) {
    let cuenta = 0;
    let enComillas = false;
    for (const ch of primera) {
      if (ch === '"') enComillas = !enComillas;
      else if (ch === sep && !enComillas) cuenta++;
    }
    if (cuenta > max) {
      max = cuenta;
      mejor = sep;
    }
  }
  return mejor;
}

/**
 * Parte un CSV en filas de celdas, respetando comillas (incluidos los saltos
 * de línea y las comillas dobles dentro de un campo entrecomillado).
 */
export function parsearCsv(texto: string, separador?: string): string[][] {
  const sep = separador ?? detectarSeparador(texto);
  const src = sinBom(texto);
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let enComillas = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (enComillas) {
      if (ch === '"') {
        // "" dentro de comillas es una comilla literal.
        if (src[i + 1] === '"') {
          celda += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        celda += ch;
      }
      continue;
    }
    if (ch === '"') {
      enComillas = true;
    } else if (ch === sep) {
      fila.push(celda);
      celda = "";
    } else if (ch === "\n") {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else if (ch === "\r") {
      // Parte del CRLF: el salto lo maneja el \n.
    } else {
      celda += ch;
    }
  }
  fila.push(celda);
  filas.push(fila);

  // Fuera las líneas en blanco del final (y las del medio, que no aportan).
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}

/** Normaliza un encabezado: sin acentos, sin espacios, en minúscula. */
export const normalizarEncabezado = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

/**
 * Lee un CSV como lista de objetos, usando la primera fila como encabezados.
 * Las claves quedan normalizadas, así que "Precio ", "precio" y "PRECIO" son
 * la misma columna.
 */
export function filasDeCsv(texto: string): Record<string, string>[] {
  const filas = parsearCsv(texto);
  if (filas.length < 2) return [];
  const encabezados = filas[0].map(normalizarEncabezado);
  return filas.slice(1).map((fila) => {
    const obj: Record<string, string> = {};
    encabezados.forEach((h, i) => {
      if (h) obj[h] = (fila[i] ?? "").trim();
    });
    return obj;
  });
}

/**
 * Número escrito por una persona: acepta "1.234,50" (es-UY), "1234.50" y
 * "1234". Devuelve null si no es un número.
 */
export function numeroDeTexto(valor: string | undefined | null): number | null {
  if (valor == null) return null;
  let s = valor.trim().replace(/\s|\$/g, "");
  if (!s) return null;
  const tieneComa = s.includes(",");
  const tienePunto = s.includes(".");
  if (tieneComa && tienePunto) {
    // El último separador que aparece es el decimal.
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (tieneComa) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "sí", "si", "x", "1", "true" y "verdadero" son que sí. */
export function siNo(valor: string | undefined | null): boolean | null {
  const s = (valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (["si", "s", "x", "1", "true", "verdadero", "yes"].includes(s)) return true;
  if (["no", "n", "0", "false", "falso"].includes(s)) return false;
  return null;
}

/**
 * Arma una línea de CSV, entrecomillando sólo lo necesario.
 *
 * Lo necesario es: el separador **que se está usando**, comillas o saltos de
 * línea. Escapar cualquier separador posible llenaría de comillas un archivo
 * separado por `;` cada vez que aparece una coma — y los decimales en español
 * llevan coma, así que saldrían todos los precios entrecomillados.
 */
export function lineaCsv(celdas: (string | number)[], separador = ","): string {
  return celdas
    .map((c) => {
      const s = String(c ?? "");
      return s.includes(separador) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(separador);
}
