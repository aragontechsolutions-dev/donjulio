/** Formatea un monto en pesos uruguayos. Los Decimal de Prisma llegan como string. */
export function formatUYU(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Igual que `formatUYU`, pero sin esconder los centavos.
 *
 * La venta por peso los genera a cada rato (0,347 kg × $420 = $145,74). Si la
 * pantalla redondea y el ticket no, el arqueo arranca torcido, así que donde
 * se cobra se muestra el importe exacto. Los montos redondos siguen sin
 * decimales, para no ensuciar la lectura.
 */
export function formatUYUExacto(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  const conCentavos = Math.abs(Math.round(n * 100) % 100) > 0;
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    minimumFractionDigits: conCentavos ? 2 : 0,
    maximumFractionDigits: conCentavos ? 2 : 0,
  }).format(n);
}

export const DIAS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
