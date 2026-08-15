/**
 * Enums de dominio compartidos entre la API (NestJS) y el frontend (React).
 * Estos valores se mantienen en sincronía con los enums del esquema Prisma.
 */

/** Roles del sistema. El rol se persiste además en el JWT (app_metadata). */
export enum UserRole {
  ADMIN = "ADMIN",
  CAJERO = "CAJERO",
  PRODUCCION = "PRODUCCION",
  MOZO = "MOZO",
  DELIVERY = "DELIVERY",
}

/** Unidades de medida para insumos, recetas y rendimientos. */
export enum UnitOfMeasure {
  G = "G",
  KG = "KG",
  ML = "ML",
  L = "L",
  UNIDAD = "UNIDAD",
  DOCENA = "DOCENA",
}

/** Canal por el que ingresa un pedido. */
export enum OrderChannel {
  WEB = "WEB",
  APP_CLIENTE = "APP_CLIENTE",
  MOSTRADOR = "MOSTRADOR",
  TELEFONO = "TELEFONO",
}

/** Tipo de venta: consumo en local / para llevar / envío. */
export enum OrderType {
  DINE_IN = "DINE_IN",
  TAKEAWAY = "TAKEAWAY",
  DELIVERY = "DELIVERY",
}

/**
 * Estados del ciclo de vida de un pedido.
 * CARRITO → PENDIENTE_PAGO → PAGADO → EN_PREPARACION → LISTO →
 *   (EN_CAMINO | LISTO_PARA_RETIRO) → ENTREGADO
 * Ramas: RECHAZADO, CANCELADO.
 */
export enum OrderStatus {
  CARRITO = "CARRITO",
  PENDIENTE_PAGO = "PENDIENTE_PAGO",
  PAGADO = "PAGADO",
  EN_PREPARACION = "EN_PREPARACION",
  LISTO = "LISTO",
  EN_CAMINO = "EN_CAMINO",
  LISTO_PARA_RETIRO = "LISTO_PARA_RETIRO",
  ENTREGADO = "ENTREGADO",
  RECHAZADO = "RECHAZADO",
  CANCELADO = "CANCELADO",
}

/** Estado de preparación de una línea de pedido (para KDS). */
export enum OrderItemStatus {
  PENDIENTE = "PENDIENTE",
  EN_PREPARACION = "EN_PREPARACION",
  LISTO = "LISTO",
  ENTREGADO = "ENTREGADO",
  CANCELADO = "CANCELADO",
}

/** Medios de pago soportados. */
export enum PaymentMethod {
  EFECTIVO = "EFECTIVO",
  DEBITO = "DEBITO",
  CREDITO = "CREDITO",
  MERCADO_PAGO_QR = "MERCADO_PAGO_QR",
  MERCADO_PAGO_CHECKOUT = "MERCADO_PAGO_CHECKOUT",
  TRANSFERENCIA = "TRANSFERENCIA",
  ABITAB = "ABITAB",
  REDPAGOS = "REDPAGOS",
}

/** Estado de un pago (fuente de verdad: consulta server-side al proveedor). */
export enum PaymentStatus {
  PENDIENTE = "PENDIENTE",
  APROBADO = "APROBADO",
  RECHAZADO = "RECHAZADO",
  REEMBOLSADO = "REEMBOLSADO",
  CANCELADO = "CANCELADO",
}

/** Tipos de Comprobante Fiscal Electrónico (CFE) de DGI Uruguay. */
export enum CfeType {
  /** e-Ticket — consumidor final sin RUT (tipo 101). */
  E_TICKET = "E_TICKET",
  /** e-Factura — operaciones B2B con RUT (tipo 111). */
  E_FACTURA = "E_FACTURA",
  /** Nota de crédito de e-Ticket (tipo 102). */
  E_TICKET_NC = "E_TICKET_NC",
  /** Nota de crédito de e-Factura (tipo 112). */
  E_FACTURA_NC = "E_FACTURA_NC",
}

/** Código numérico DGI por tipo de CFE. */
export const CFE_TIPO_DGI: Record<CfeType, number> = {
  [CfeType.E_TICKET]: 101,
  [CfeType.E_TICKET_NC]: 102,
  [CfeType.E_FACTURA]: 111,
  [CfeType.E_FACTURA_NC]: 112,
};

/** Estado de emisión de un CFE frente a DGI. */
export enum CfeStatus {
  PENDIENTE = "PENDIENTE",
  EMITIDO = "EMITIDO",
  RECHAZADO = "RECHAZADO",
  ANULADO = "ANULADO",
}

/** Tasas de IVA vigentes en Uruguay. El pan tributa a la tasa mínima (10%). */
export enum IvaRate {
  EXENTO = "EXENTO",
  MINIMA = "MINIMA", // 10%
  BASICA = "BASICA", // 22%
}

export const IVA_PORCENTAJE: Record<IvaRate, number> = {
  [IvaRate.EXENTO]: 0,
  [IvaRate.MINIMA]: 10,
  [IvaRate.BASICA]: 22,
};

/** Tipo de movimiento de stock de insumos. */
export enum StockMovementType {
  ENTRADA = "ENTRADA", // compra / recepción
  SALIDA = "SALIDA", // consumo por producción
  AJUSTE = "AJUSTE", // corrección de inventario
  MERMA = "MERMA", // pérdida
}

/** Estados de una orden de producción. */
export enum ProductionOrderStatus {
  PLANIFICADA = "PLANIFICADA",
  EN_PROCESO = "EN_PROCESO",
  TERMINADA = "TERMINADA",
  CANCELADA = "CANCELADA",
}

/** Motivo de una merma / desperdicio. */
export enum MermaMotivo {
  NO_VENDIDO = "NO_VENDIDO",
  ROTURA = "ROTURA",
  VENCIMIENTO = "VENCIMIENTO",
  CONSUMO_PERSONAL = "CONSUMO_PERSONAL",
  OTRO = "OTRO",
}

/** Estado de una mesa del salón. */
export enum TableStatus {
  LIBRE = "LIBRE",
  OCUPADA = "OCUPADA",
  RESERVADA = "RESERVADA",
  PENDIENTE_PAGO = "PENDIENTE_PAGO",
}

/** Estación de trabajo (para enrutar comandas en el KDS). */
export enum StationType {
  PANADERIA = "PANADERIA",
  REPOSTERIA = "REPOSTERIA",
  COCINA = "COCINA",
  BARRA = "BARRA",
}

/** Estado de una sesión de caja (arqueo por turno). */
export enum CashSessionStatus {
  ABIERTA = "ABIERTA",
  CERRADA = "CERRADA",
}

/** Tipo de movimiento de caja. */
export enum CashMovementType {
  SALE = "SALE",
  IN = "IN", // ingreso de efectivo (no venta)
  OUT = "OUT", // egreso
  WITHDRAWAL = "WITHDRAWAL", // retiro
  EXPENSE = "EXPENSE", // gasto menor
}

/** Estado de un pedido por encargo (tortas personalizadas, etc.). */
export enum CustomOrderStatus {
  RESERVADO = "RESERVADO",
  EN_PRODUCCION = "EN_PRODUCCION",
  LISTO = "LISTO",
  ENTREGADO = "ENTREGADO",
  CANCELADO = "CANCELADO",
}

/** Estado de una reserva de mesa. */
export enum ReservaStatus {
  PENDIENTE = "PENDIENTE",
  CONFIRMADA = "CONFIRMADA",
  SENTADA = "SENTADA",
  CANCELADA = "CANCELADA",
  NO_SHOW = "NO_SHOW",
}
