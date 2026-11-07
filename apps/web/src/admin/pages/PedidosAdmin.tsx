import { useEffect, useState } from "react";
import {
  lineaConCantidad,
  nextOrderStatuses,
  OrderStatus,
  OrderType,
  UnidadVenta,
} from "@donjulio/shared";
import { api } from "../../lib/api";
import { formatUYUExacto as formatUYU } from "../../lib/format";

interface ItemPedido {
  id: string;
  cantidad: number | string;
  subtotal: string;
  precioUnitario: string;
  producto: { nombre: string; unidadVenta: string };
  modificadores: { nombre: string }[];
}
interface Pedido {
  id: string;
  numero: number;
  status: OrderStatus;
  orderType: OrderType;
  channel: string;
  total: string;
  neto: string;
  ivaTotal: string;
  createdAt: string;
  items: ItemPedido[];
  cliente: { nombre: string } | null;
}

/** Etiquetas en español: la pantalla no tiene por qué mostrar los enums. */
const ESTADO_LABEL: Record<string, string> = {
  CARRITO: "Carrito",
  PENDIENTE_PAGO: "Pendiente de pago",
  PAGADO: "Pagado",
  EN_PREPARACION: "En preparación",
  LISTO: "Listo",
  EN_CAMINO: "En camino",
  LISTO_PARA_RETIRO: "Listo para retirar",
  ENTREGADO: "Entregado",
  RECHAZADO: "Rechazado",
  CANCELADO: "Cancelado",
};
const CANAL_LABEL: Record<string, string> = {
  WEB: "Web",
  APP_CLIENTE: "App",
  MOSTRADOR: "Mostrador",
  TELEFONO: "Teléfono",
};
const TIPO_LABEL: Record<string, string> = {
  DINE_IN: "En el salón",
  TAKEAWAY: "Para llevar",
  DELIVERY: "Delivery",
};
/** Fecha corta: la lista se lee de un vistazo, no hace falta el año ni los segundos. */
const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Los estados cerrados se ven apagados; el resto, en terracota. */
const ESTADO_CLS: Record<string, string> = {
  ENTREGADO: "bg-crust-100 text-crust-600",
  CANCELADO: "bg-crust-100 text-crust-400",
  RECHAZADO: "bg-red-100 text-red-700",
};

export default function PedidosAdmin() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const load = () =>
    api.get<Pedido[]>("/admin/pedidos").then(setPedidos).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const cambiarEstado = async (p: Pedido, status: OrderStatus) => {
    setError(null);
    try {
      await api.patch(`/admin/pedidos/${p.id}/status`, { status });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-bold text-crust-800">Pedidos</h1>
      <p className="mb-6 text-sm text-crust-500">
        Todo lo que se vendió, por cualquier vía. Tocá un pedido para ver qué lleva.
      </p>
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="space-y-3">
        {pedidos.map((p) => {
          const opciones = nextOrderStatuses(p.status, p.orderType);
          const esteAbierto = abierto === p.id;
          return (
            <div
              key={p.id}
              className="rounded-2xl border border-crust-100 bg-white shadow-sm"
            >
              {/* En el teléfono la cabecera se apila: con el estado y el
                  selector en la misma fila, el título se parte en pedazos. */}
              <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <button
                  type="button"
                  onClick={() => setAbierto(esteAbierto ? null : p.id)}
                  aria-expanded={esteAbierto}
                  className="control-compacto min-w-0 text-left sm:flex-1"
                >
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-crust-800">
                    <span>
                      <span className={`mr-1 inline-block w-3 text-crust-400 transition-transform ${esteAbierto ? "rotate-90" : ""}`}>›</span>
                      Pedido #{p.numero}
                    </span>
                    <span className="whitespace-nowrap rounded-full bg-crust-100 px-2 py-0.5 text-xs font-medium text-crust-600">
                      {CANAL_LABEL[p.channel] ?? p.channel}
                    </span>
                    <span className="whitespace-nowrap rounded-full bg-crust-50 px-2 py-0.5 text-xs font-normal text-crust-500">
                      {TIPO_LABEL[p.orderType] ?? p.orderType}
                    </span>
                  </p>
                  <p className="pl-4 text-sm text-crust-500">
                    {fechaCorta(p.createdAt)} · {formatUYU(p.total)}
                    {p.items.length > 0 ? ` · ${p.items.length} ${p.items.length === 1 ? "línea" : "líneas"}` : ""}
                    {p.cliente ? ` · ${p.cliente.nombre}` : ""}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-2 pl-4 sm:pl-0">
                  <span
                    className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium ${ESTADO_CLS[p.status] ?? "bg-dj-terracota text-white"}`}
                  >
                    {ESTADO_LABEL[p.status] ?? p.status}
                  </span>
                  {opciones.length > 0 && (
                    <select
                      defaultValue=""
                      onChange={(e) =>
                        e.target.value &&
                        cambiarEstado(p, e.target.value as OrderStatus)
                      }
                      className="min-w-0 rounded-lg border border-crust-200 px-2 py-1.5 text-sm"
                    >
                      <option value="">Cambiar a…</option>
                      {opciones.map((o) => (
                        <option key={o} value={o}>
                          {ESTADO_LABEL[o] ?? o}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {esteAbierto && (
                <div className="border-t border-crust-100 px-4 py-3">
                  {p.items.length === 0 ? (
                    <p className="text-sm text-crust-400">Este pedido no tiene líneas.</p>
                  ) : (
                    <>
                      <ul className="space-y-1 text-sm">
                        {p.items.map((it) => (
                          <li key={it.id} className="flex justify-between gap-3">
                            <span className="text-crust-700">
                              {lineaConCantidad(
                                it.cantidad,
                                it.producto.nombre,
                                it.producto.unidadVenta === UnidadVenta.KG
                                  ? UnidadVenta.KG
                                  : UnidadVenta.UNIDAD,
                              )}
                              {it.producto.unidadVenta === UnidadVenta.KG && (
                                <span className="text-crust-400"> · {formatUYU(it.precioUnitario)} el kilo</span>
                              )}
                              {it.modificadores.length > 0 && (
                                <span className="block text-xs text-crust-400">
                                  {it.modificadores.map((m) => m.nombre).join(", ")}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 tabular-nums text-crust-600">
                              {formatUYU(it.subtotal)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 border-t border-crust-100 pt-2 text-xs text-crust-500">
                        Neto {formatUYU(p.neto)} · IVA {formatUYU(p.ivaTotal)} · Total{" "}
                        <b className="text-crust-700">{formatUYU(p.total)}</b>
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {pedidos.length === 0 && (
          <p className="rounded-2xl border border-crust-100 bg-white p-8 text-center text-crust-400">
            No hay pedidos todavía.
          </p>
        )}
      </div>
    </div>
  );
}
