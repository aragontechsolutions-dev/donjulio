import { OrderStatus, OrderType } from "./enums";

/**
 * Transiciones válidas del ciclo de vida de un pedido.
 * La rama final depende del tipo de venta:
 *  - DELIVERY: ... → LISTO → EN_CAMINO → ENTREGADO
 *  - TAKEAWAY / DINE_IN: ... → LISTO → LISTO_PARA_RETIRO → ENTREGADO
 */
const BASE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.CARRITO]: [OrderStatus.PENDIENTE_PAGO, OrderStatus.CANCELADO],
  [OrderStatus.PENDIENTE_PAGO]: [
    OrderStatus.PAGADO,
    OrderStatus.RECHAZADO,
    OrderStatus.CANCELADO,
  ],
  [OrderStatus.PAGADO]: [OrderStatus.EN_PREPARACION, OrderStatus.CANCELADO],
  [OrderStatus.EN_PREPARACION]: [OrderStatus.LISTO, OrderStatus.CANCELADO],
  [OrderStatus.LISTO]: [
    OrderStatus.EN_CAMINO,
    OrderStatus.LISTO_PARA_RETIRO,
    OrderStatus.ENTREGADO,
  ],
  [OrderStatus.EN_CAMINO]: [OrderStatus.ENTREGADO],
  [OrderStatus.LISTO_PARA_RETIRO]: [OrderStatus.ENTREGADO],
  [OrderStatus.ENTREGADO]: [],
  [OrderStatus.RECHAZADO]: [],
  [OrderStatus.CANCELADO]: [],
};

/** Devuelve los estados a los que se puede pasar desde `from` para un `orderType` dado. */
export function nextOrderStatuses(
  from: OrderStatus,
  orderType?: OrderType,
): OrderStatus[] {
  const allowed = BASE_TRANSITIONS[from] ?? [];
  if (!orderType) return allowed;
  return allowed.filter((s) => {
    if (s === OrderStatus.EN_CAMINO) return orderType === OrderType.DELIVERY;
    if (s === OrderStatus.LISTO_PARA_RETIRO)
      return orderType !== OrderType.DELIVERY;
    return true;
  });
}

/** Valida si una transición de estado es permitida. */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  orderType?: OrderType,
): boolean {
  return nextOrderStatuses(from, orderType).includes(to);
}

/** Estados terminales (no admiten más transiciones). */
export const TERMINAL_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.ENTREGADO,
  OrderStatus.RECHAZADO,
  OrderStatus.CANCELADO,
]);
