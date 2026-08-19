import { CashMovementType, PaymentMethod } from "./enums";

/**
 * Arqueo de caja: qué se cuenta en el cajón y qué se concilia aparte.
 *
 * El cajón físico sólo se mueve con efectivo. Las ventas por débito, crédito
 * o QR entran a la cuenta bancaria / Mercado Pago, no al cajón: al cerrar hay
 * que compararlas contra el cierre del POS o el panel de MP, no contra la
 * plata contada. Esta función es la única fuente de verdad de ese reparto y la
 * usan tanto la API (al cerrar) como el panel (arqueo en vivo), para que los
 * dos números no puedan divergir.
 */

/** Lo mínimo que se necesita de un movimiento para arquear. */
export interface MovimientoCaja {
  tipo: string;
  metodoPago?: string | null;
  monto: number | string;
}

/** Ventas de un medio de pago concreto. */
export interface VentasPorMedio {
  metodo: string;
  monto: number;
  /** Cantidad de movimientos, para detectar el cobro suelto que falta conciliar. */
  cantidad: number;
}

export interface ResumenCaja {
  /** Fondo con el que se abrió el turno. */
  fondoInicial: number;
  /** Ventas cobradas en efectivo (entran al cajón). */
  ventasEfectivo: number;
  /** Ingresos de efectivo que no son venta (aportes, cambio). */
  ingresos: number;
  /** Egresos de efectivo (retiros, gastos, pagos a proveedor). */
  egresos: number;
  /** Lo que tiene que haber en el cajón al contar. */
  efectivoEsperado: number;
  /** Ventas que NO entran al cajón, por medio de pago. */
  noEfectivo: VentasPorMedio[];
  /** Suma de `noEfectivo`: se concilia contra POS / Mercado Pago. */
  totalNoEfectivo: number;
  /** Ventas del turno por todos los medios (efectivo incluido). */
  totalVentas: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: number | string): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Orden estable de los medios, para que la lista no baile entre refrescos. */
const ORDEN_MEDIOS: string[] = Object.values(PaymentMethod);
const posicion = (m: string) => {
  const i = ORDEN_MEDIOS.indexOf(m);
  return i === -1 ? ORDEN_MEDIOS.length : i;
};

export function resumirCaja(
  movimientos: readonly MovimientoCaja[],
  fondoInicial: number | string,
): ResumenCaja {
  const fondo = num(fondoInicial);
  let ventasEfectivo = 0;
  let ingresos = 0;
  let egresos = 0;
  let totalVentas = 0;
  const porMedio = new Map<string, VentasPorMedio>();

  for (const m of movimientos) {
    const monto = num(m.monto);
    if (m.tipo === CashMovementType.SALE) {
      totalVentas += monto;
      if (m.metodoPago === PaymentMethod.EFECTIVO) {
        ventasEfectivo += monto;
      } else {
        // Sin medio declarado se agrupa aparte: hay que revisarlo antes de cerrar.
        const clave = m.metodoPago ?? "SIN_MEDIO";
        const acc = porMedio.get(clave) ?? { metodo: clave, monto: 0, cantidad: 0 };
        acc.monto += monto;
        acc.cantidad += 1;
        porMedio.set(clave, acc);
      }
    } else if (m.tipo === CashMovementType.IN) {
      ingresos += monto;
    } else if (
      m.tipo === CashMovementType.OUT ||
      m.tipo === CashMovementType.WITHDRAWAL ||
      m.tipo === CashMovementType.EXPENSE
    ) {
      egresos += monto;
    }
  }

  const noEfectivo = [...porMedio.values()]
    .map((v) => ({ ...v, monto: round2(v.monto) }))
    .sort((a, b) => posicion(a.metodo) - posicion(b.metodo));

  return {
    fondoInicial: round2(fondo),
    ventasEfectivo: round2(ventasEfectivo),
    ingresos: round2(ingresos),
    egresos: round2(egresos),
    efectivoEsperado: round2(fondo + ventasEfectivo + ingresos - egresos),
    noEfectivo,
    totalNoEfectivo: round2(noEfectivo.reduce((a, v) => a + v.monto, 0)),
    totalVentas: round2(totalVentas),
  };
}

/** Conciliación por medio de pago, efectivo incluido (formato del cierre). */
export function conciliacionPorMedio(
  movimientos: readonly MovimientoCaja[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of movimientos) {
    if (m.tipo !== CashMovementType.SALE) continue;
    const k = m.metodoPago ?? "SIN_MEDIO";
    out[k] = round2((out[k] ?? 0) + num(m.monto));
  }
  return out;
}
