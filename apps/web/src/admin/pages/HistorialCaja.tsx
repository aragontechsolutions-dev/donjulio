import { useEffect, useState } from "react";
import { resumirCaja } from "@donjulio/shared";
import { api } from "../../lib/api";
import { formatUYUExacto as formatUYU } from "../../lib/format";
import MovimientosCaja, { metodoLabel, type MovimientoCaja } from "../../lib/MovimientosCaja";

interface UsuarioRef { id: string; nombre: string }
interface TurnoCerrado {
  id: string;
  etiqueta: string | null;
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  closingCount: string | null;
  expected: string | null;
  difference: string | null;
  justificacion: string | null;
  openedBy: UsuarioRef | null;
  closedBy: UsuarioRef | null;
}

const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

/** Cuánto duró el turno, en horas y minutos. */
const duracion = (desde: string, hasta: string | null) => {
  if (!hasta) return "";
  const min = Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000));
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
};

/**
 * Turnos de caja ya cerrados.
 *
 * La lista trae sólo el arqueo de cada turno; los movimientos se piden al
 * abrir uno, porque son muchos y casi nunca se miran todos. Una vez pedidos
 * quedan guardados.
 */
export default function HistorialCaja() {
  const [turnos, setTurnos] = useState<TurnoCerrado[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [movs, setMovs] = useState<Record<string, MovimientoCaja[]>>({});
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api.get<TurnoCerrado[]>("/admin/caja/historial").then(setTurnos).catch(() => {});
  }, []);

  const ver = (id: string) => {
    if (abierto === id) {
      setAbierto(null);
      return;
    }
    setAbierto(id);
    if (movs[id]) return;
    setCargando(true);
    api
      .get<MovimientoCaja[]>(`/admin/caja/${id}/movimientos`)
      .then((m) => setMovs((prev) => ({ ...prev, [id]: m })))
      .catch(() => setAbierto(null))
      .finally(() => setCargando(false));
  };

  if (turnos.length === 0) return null;

  return (
    <div className="mt-6 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-crust-700">Turnos cerrados</h3>
      <p className="mb-3 text-xs text-crust-400">
        Abrí un turno para ver sus movimientos, y cada movimiento para ver qué se vendió.
      </p>

      <ul className="divide-y divide-crust-100">
        {turnos.map((t) => {
          const esteAbierto = abierto === t.id;
          const lista = movs[t.id];
          const resumen = lista ? resumirCaja(lista, t.openingFloat) : null;
          const dif = t.difference != null ? Number(t.difference) : null;
          return (
            <li key={t.id} className="py-1">
              <button
                type="button"
                onClick={() => ver(t.id)}
                aria-expanded={esteAbierto}
                className="control-compacto flex w-full items-center justify-between gap-3 py-1.5 text-left hover:bg-crust-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-crust-800">
                    <span className={`mr-1 inline-block w-3 text-crust-400 transition-transform ${esteAbierto ? "rotate-90" : ""}`}>›</span>
                    {fechaHora(t.closedAt)}
                    {t.etiqueta ? ` · ${t.etiqueta}` : ""}
                  </span>
                  <span className="block pl-4 text-xs text-crust-400">
                    {duracion(t.openedAt, t.closedAt)}
                    {t.closedBy ? ` · cerró ${t.closedBy.nombre}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm text-crust-700 tabular-nums">
                    {formatUYU(t.closingCount)} contado
                  </span>
                  {dif != null && (
                    <span
                      className={`block text-xs font-semibold tabular-nums ${
                        dif === 0 ? "text-green-600" : Math.abs(dif) > 0 ? "text-amber-600" : ""
                      }`}
                    >
                      {dif === 0 ? "cuadró" : `${dif > 0 ? "+" : ""}${formatUYU(dif)}`}
                    </span>
                  )}
                </span>
              </button>

              {esteAbierto && (
                <div className="mb-2 ml-4 rounded-lg bg-crust-50 p-3">
                  {!lista ? (
                    <p className="text-xs text-crust-400">{cargando ? "Buscando los movimientos…" : "Sin datos."}</p>
                  ) : (
                    <>
                      <div className="mb-2 grid gap-x-6 gap-y-1 text-xs text-crust-600 sm:grid-cols-2">
                        <span className="flex justify-between">
                          <span>Fondo inicial</span>
                          <span className="tabular-nums">{formatUYU(t.openingFloat)}</span>
                        </span>
                        <span className="flex justify-between">
                          <span>Ventas en efectivo</span>
                          <span className="tabular-nums">{formatUYU(resumen!.ventasEfectivo)}</span>
                        </span>
                        <span className="flex justify-between">
                          <span>Esperado en el cajón</span>
                          <span className="tabular-nums">{formatUYU(t.expected)}</span>
                        </span>
                        <span className="flex justify-between">
                          <span>Fuera del cajón</span>
                          <span className="tabular-nums">{formatUYU(resumen!.totalNoEfectivo)}</span>
                        </span>
                      </div>

                      {resumen!.noEfectivo.length > 0 && (
                        <p className="mb-2 text-[11px] text-crust-400">
                          {resumen!.noEfectivo
                            .map((v) => `${v.metodo === "SIN_MEDIO" ? "Sin medio" : metodoLabel(v.metodo)} ${formatUYU(v.monto)}`)
                            .join(" · ")}
                        </p>
                      )}

                      {t.justificacion && (
                        <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                          <span className="font-semibold">Motivo del descuadre:</span> {t.justificacion}
                        </p>
                      )}

                      <MovimientosCaja movimientos={lista} alto="max-h-64" vacio="El turno cerró sin movimientos." />
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
