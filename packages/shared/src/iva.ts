import { IvaRate, IVA_PORCENTAJE } from "./enums";

/**
 * Desglose de IVA para precios que ya lo incluyen.
 *
 * En venta a consumidor final el precio exhibido es el final, así que el
 * impuesto no se suma: se saca de adentro. Con tasa mínima, un pan de $ 180
 * son $ 163,64 de neto y $ 16,36 de IVA.
 *
 * Todo se calcula en centavos enteros. Con decimales, 0.1 + 0.2 no da 0.3 y
 * los totales terminan descuadrados por centavos que después no cierran
 * contra el arqueo de caja ni contra el CFE.
 */

const aCentavos = (n: number) => Math.round(n * 100);
const aPesos = (c: number) => c / 100;

/** Una línea a la que hay que calcularle el IVA. */
export interface LineaIva {
  /** Total de la línea con IVA incluido (precio unitario × cantidad). */
  totalConIva: number;
  tasa: IvaRate;
}

/** El resultado para una línea, en pesos con dos decimales. */
export interface IvaLinea {
  tasa: IvaRate;
  /** Porcentaje aplicado (0, 10 o 22). */
  porcentaje: number;
  neto: number;
  iva: number;
  totalConIva: number;
}

/** Lo que hay que declarar de un pedido, abierto por tasa. */
export interface IvaPedido {
  lineas: IvaLinea[];
  /** Base imponible de lo gravado a tasa mínima. */
  netoMinima: number;
  ivaMinima: number;
  /** Base imponible de lo gravado a tasa básica. */
  netoBasica: number;
  ivaBasica: number;
  /** Lo exento no tiene IVA: va aparte porque el CFE lo pide separado. */
  noGravado: number;
  /** Suma de netos y de IVA de todas las líneas. */
  neto: number;
  iva: number;
  /** Lo que paga el cliente. Siempre igual a la suma de las líneas. */
  total: number;
}

/**
 * Saca el IVA de un importe que ya lo incluye.
 *
 * El IVA se calcula como resta contra el total, no por su propia fórmula: así
 * neto + iva da exactamente el total y nunca sobra ni falta un centavo.
 */
export function desglosarIva(totalConIva: number, tasa: IvaRate): IvaLinea {
  const porcentaje = IVA_PORCENTAJE[tasa];
  const totalCent = aCentavos(totalConIva);
  const netoCent =
    porcentaje === 0
      ? totalCent
      : Math.round(totalCent / (1 + porcentaje / 100));
  return {
    tasa,
    porcentaje,
    neto: aPesos(netoCent),
    iva: aPesos(totalCent - netoCent),
    totalConIva: aPesos(totalCent),
  };
}

/**
 * Desglosa un pedido entero y lo agrupa por tasa, que es como lo necesita el
 * comprobante fiscal.
 *
 * Los totales se suman a partir de las líneas ya redondeadas, no se recalculan
 * sobre el total del pedido: si no, la suma de las líneas del CFE no coincide
 * con su pie y el comprobante se rechaza.
 */
export function calcularIvaPedido(lineas: LineaIva[]): IvaPedido {
  const detalle = lineas.map((l) => desglosarIva(l.totalConIva, l.tasa));

  let netoMinimaC = 0, ivaMinimaC = 0;
  let netoBasicaC = 0, ivaBasicaC = 0;
  let noGravadoC = 0;

  for (const l of detalle) {
    const netoC = aCentavos(l.neto);
    const ivaC = aCentavos(l.iva);
    if (l.tasa === IvaRate.MINIMA) {
      netoMinimaC += netoC;
      ivaMinimaC += ivaC;
    } else if (l.tasa === IvaRate.BASICA) {
      netoBasicaC += netoC;
      ivaBasicaC += ivaC;
    } else {
      noGravadoC += netoC;
    }
  }

  const netoC = netoMinimaC + netoBasicaC + noGravadoC;
  const ivaC = ivaMinimaC + ivaBasicaC;

  return {
    lineas: detalle,
    netoMinima: aPesos(netoMinimaC),
    ivaMinima: aPesos(ivaMinimaC),
    netoBasica: aPesos(netoBasicaC),
    ivaBasica: aPesos(ivaBasicaC),
    noGravado: aPesos(noGravadoC),
    neto: aPesos(netoC),
    iva: aPesos(ivaC),
    total: aPesos(netoC + ivaC),
  };
}

/**
 * Tasa que corresponde cobrar, según el producto y por dónde se vende.
 *
 * Con `salonTasaBasica` en true, todo lo que se consume en el local se factura
 * como servicio gastronómico a tasa básica, sin importar la tasa del producto.
 * Queda como interruptor porque es una definición del contador, no del código:
 * las fuentes públicas no coinciden en si una confitería tiene que hacerlo.
 * Por defecto va en false y cada producto paga lo suyo, coma el cliente en la
 * mesa o se lo lleve.
 */
export function tasaAplicable(
  tasaProducto: IvaRate,
  esConsumoEnLocal: boolean,
  salonTasaBasica: boolean,
): IvaRate {
  if (!salonTasaBasica || !esConsumoEnLocal) return tasaProducto;
  // Lo exento no se convierte en gravado por servirse en la mesa.
  return tasaProducto === IvaRate.EXENTO ? IvaRate.EXENTO : IvaRate.BASICA;
}

/** Etiqueta corta para mostrar la tasa en pantalla. */
export const IVA_LABEL_CORTO: Record<IvaRate, string> = {
  [IvaRate.EXENTO]: "Exento",
  [IvaRate.MINIMA]: "10 %",
  [IvaRate.BASICA]: "22 %",
};
