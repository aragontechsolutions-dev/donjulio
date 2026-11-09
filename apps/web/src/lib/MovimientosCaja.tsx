import { useState } from "react";
import { lineaConCantidad, UnidadVenta } from "@donjulio/shared";
import { api } from "./api";
import { formatUYUExacto as formatUYU } from "./format";

export interface MovimientoCaja {
  id: string;
  tipo: string;
  metodoPago: string | null;
  monto: string | number;
  referencia: string | null;
  createdAt: string;
}

interface ItemVendido {
  nombre: string;
  unidadVenta: string;
  cantidad: number;
  subtotal: number;
  modificadores: string[];
}
interface DetalleMovimiento {
  usuario: string | null;
  /** null en los movimientos que no son una venta del sistema. */
  venta: {
    numero: number;
    canal: string;
    total: number;
    neto: number;
    iva: number;
    items: ItemVendido[];
    /** Id de la operación en el medio de pago, para conciliar. */
    operacionExterna?: string | null;
    cobradoCon?: string | null;
  } | null;
}

/** Etiquetas en español para los conceptos de caja. */
export const TIPO_LABEL: Record<string, string> = {
  SALE: "Venta",
  IN: "Ingreso de efectivo",
  OUT: "Egreso de efectivo",
  WITHDRAWAL: "Retiro de caja",
  EXPENSE: "Gasto menor",
};
/** Etiquetas en español para los medios de pago. */
export const METODO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  MERCADO_PAGO_QR: "Mercado Pago (QR)",
  MERCADO_PAGO_CHECKOUT: "Mercado Pago (Checkout)",
  TRANSFERENCIA: "Transferencia",
  ABITAB: "Abitab",
  REDPAGOS: "Redpagos",
};
export const metodoLabel = (m: string | null) =>
  m ? (METODO_LABEL[m] ?? m.replace(/_/g, " ")) : "";
export const tipoLabel = (t: string) => TIPO_LABEL[t] ?? t;

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });

/**
 * Lista de movimientos de caja donde cada uno se abre y muestra qué se vendió.
 *
 * El detalle se pide al abrirlo, no viene en la lista: un turno con cientos de
 * movimientos no tiene por qué traer todos los ítems. Una vez pedido queda
 * guardado, así que volver a abrirlo no le pega de nuevo a la API.
 *
 * La usan el turno abierto (que además marca lo que acaba de entrar) y el
 * historial de turnos cerrados.
 */
export default function MovimientosCaja({
  movimientos,
  nuevos,
  vacio = "Sin movimientos.",
  alto = "max-h-80",
}: {
  movimientos: MovimientoCaja[];
  /** Ids que llegaron mientras se miraba la pantalla, para resaltarlos. */
  nuevos?: Set<string>;
  vacio?: string;
  alto?: string;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<Record<string, DetalleMovimiento>>({});

  const ver = (id: string) => {
    if (abierto === id) {
      setAbierto(null);
      return;
    }
    setAbierto(id);
    if (detalles[id]) return;
    api
      .get<DetalleMovimiento>(`/admin/caja/movimientos/${id}`)
      .then((d) => setDetalles((prev) => ({ ...prev, [id]: d })))
      .catch(() => setAbierto(null));
  };

  return (
    <ul className={`${alto} space-y-1 overflow-auto text-sm`}>
      {movimientos.map((m) => {
        const esteAbierto = abierto === m.id;
        const det = detalles[m.id];
        const esNuevo = !!nuevos?.has(m.id);
        return (
          <li
            key={m.id}
            className={`border-b border-crust-50 py-1 ${esNuevo ? "-mx-2 rounded-lg bg-amber-50 px-2" : ""}`}
          >
            <button
              type="button"
              onClick={() => ver(m.id)}
              aria-expanded={esteAbierto}
              className="control-compacto flex w-full items-center justify-between gap-2 text-left hover:bg-crust-50"
            >
              <span className="min-w-0 text-crust-600">
                <span className="block truncate">
                  <span
                    className={`mr-1 inline-block w-3 text-crust-400 transition-transform ${esteAbierto ? "rotate-90" : ""}`}
                  >
                    ›
                  </span>
                  {tipoLabel(m.tipo)}
                  {m.metodoPago ? ` · ${metodoLabel(m.metodoPago)}` : ""}
                  {esNuevo && (
                    <span className="ml-1.5 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
                      nuevo
                    </span>
                  )}
                </span>
                <span className="block pl-4 text-xs text-crust-400">
                  {hora(m.createdAt)}
                  {m.referencia ? ` · ${m.referencia}` : ""}
                </span>
              </span>
              <span
                className={`shrink-0 tabular-nums ${m.tipo === "SALE" || m.tipo === "IN" ? "text-green-600" : "text-red-600"}`}
              >
                {formatUYU(m.monto)}
              </span>
            </button>

            {esteAbierto && (
              <div className="mb-1 ml-4 mt-1 rounded-lg bg-crust-50 px-3 py-2 text-xs">
                {!det ? (
                  <p className="text-crust-400">Buscando el detalle…</p>
                ) : det.venta ? (
                  <>
                    <ul className="space-y-1">
                      {det.venta.items.map((it, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span className="text-crust-700">
                            {lineaConCantidad(
                              it.cantidad,
                              it.nombre,
                              it.unidadVenta === UnidadVenta.KG
                                ? UnidadVenta.KG
                                : UnidadVenta.UNIDAD,
                            )}
                            {it.modificadores.length > 0 && (
                              <span className="block text-crust-400">
                                {it.modificadores.join(", ")}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums text-crust-600">
                            {formatUYU(it.subtotal)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 border-t border-crust-200 pt-1 text-crust-500">
                      Pedido #{det.venta.numero} · neto {formatUYU(det.venta.neto)} · IVA{" "}
                      {formatUYU(det.venta.iva)}
                      {det.usuario ? ` · cobró ${det.usuario}` : ""}
                    </p>
                    {det.venta.operacionExterna && (
                      // Para cruzar esta venta con la que figura en el panel
                      // del medio de pago sin tener que buscar por monto y
                      // hora, que es como se cometen los errores.
                      <p className="mt-1 break-all text-[11px] text-crust-400">
                        Operación {det.venta.cobradoCon ?? "externa"}:{" "}
                        <span className="font-mono">{det.venta.operacionExterna}</span>
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-crust-500">
                    {m.tipo === "SALE"
                      ? "Venta cargada a mano: no tiene detalle de productos."
                      : "Movimiento de caja, sin productos."}
                    {det.usuario ? ` · ${det.usuario}` : ""}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
      {movimientos.length === 0 && <li className="text-crust-400">{vacio}</li>}
    </ul>
  );
}
