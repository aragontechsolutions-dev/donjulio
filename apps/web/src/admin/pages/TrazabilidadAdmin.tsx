import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface LoteProducido { id: string; lote: string; qty: string; producedAt: string; expiresAt: string | null; producto: { nombre: string } | null }
interface LoteInsumo { id: string; lote: string; cantidad: string; vencimiento: string | null; recibidoAt: string; insumo: { nombre: string; unidad: string } }

interface TrazaProducido {
  lote: { id: string; lote: string; qty: number; producedAt: string; expiresAt: string | null; producto: string | null };
  orden: { id: string; receta: string | null; responsable: string | null; iniciadaAt: string | null; terminadaAt: string | null } | null;
  consumos: { insumo: string; unidad: string; cantidad: number; lote: string | null; vencimiento: string | null; fecha: string }[];
}
interface TrazaInsumo {
  insumoLote: { id: string; lote: string; insumo: string; unidad: string; restante: number; vencimiento: string | null; recibidoAt: string };
  usos: { loteProducto: string; producto: string | null; qty: number; producedAt: string; expiresAt: string | null }[];
  consumidoEn: number;
}

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-UY") : "—");
const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export default function TrazabilidadAdmin() {
  const [modo, setModo] = useState<"producido" | "insumo">("producido");
  const [q, setQ] = useState("");
  const [producidos, setProducidos] = useState<LoteProducido[]>([]);
  const [insumos, setInsumos] = useState<LoteInsumo[]>([]);
  const [traza, setTraza] = useState<TrazaProducido | null>(null);
  const [trazaIns, setTrazaIns] = useState<TrazaInsumo | null>(null);

  useEffect(() => {
    const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    if (modo === "producido") {
      api.get<LoteProducido[]>(`/admin/inventario/trazabilidad/lotes-producidos${qs}`).then(setProducidos).catch(() => {});
    } else {
      api.get<LoteInsumo[]>(`/admin/inventario/trazabilidad/lotes-insumo${qs}`).then(setInsumos).catch(() => {});
    }
  }, [modo, q]);

  const verProducido = async (id: string) => {
    setTrazaIns(null);
    setTraza(await api.get<TrazaProducido>(`/admin/inventario/trazabilidad/producido/${id}`));
  };
  const verInsumo = async (id: string) => {
    setTraza(null);
    setTrazaIns(await api.get<TrazaInsumo>(`/admin/inventario/trazabilidad/insumo/${id}`));
  };

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-bold text-crust-800">Trazabilidad de lotes</h1>
      <p className="mb-4 text-sm text-crust-500">
        Seguí un lote en las dos direcciones: de un producto terminado a los insumos que lo formaron,
        o de un lote de insumo a todo lo que se elaboró con él (útil ante un retiro de mercadería).
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full bg-crust-100 p-1 text-sm font-semibold">
          <button onClick={() => { setModo("producido"); setTraza(null); setTrazaIns(null); }} className={`rounded-full px-4 py-1.5 ${modo === "producido" ? "bg-dj-terracota text-white" : "text-crust-700"}`}>
            Producto terminado → insumos
          </button>
          <button onClick={() => { setModo("insumo"); setTraza(null); setTrazaIns(null); }} className={`rounded-full px-4 py-1.5 ${modo === "insumo" ? "bg-dj-terracota text-white" : "text-crust-700"}`}>
            Insumo → productos
          </button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código de lote…" className="min-w-[220px] flex-1 rounded-lg border border-crust-200 px-3 py-2 text-sm" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Listado de lotes */}
        <div className="overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-crust-50 text-left text-crust-600">
              {modo === "producido" ? (
                <tr><th className="px-4 py-3">Lote</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Producido</th><th className="px-4 py-3">Vence</th><th /></tr>
              ) : (
                <tr><th className="px-4 py-3">Lote</th><th className="px-4 py-3">Insumo</th><th className="px-4 py-3 text-right">Restante</th><th className="px-4 py-3">Vence</th><th /></tr>
              )}
            </thead>
            <tbody>
              {modo === "producido" && producidos.map((l) => (
                <tr key={l.id} className="border-t border-crust-50">
                  <td className="px-4 py-2 font-mono text-xs text-crust-800">{l.lote}</td>
                  <td className="px-4 py-2 text-crust-600">{l.producto?.nombre ?? "—"}</td>
                  <td className="px-4 py-2 text-crust-500">{fecha(l.producedAt)}</td>
                  <td className="px-4 py-2 text-crust-500">{fecha(l.expiresAt)}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => verProducido(l.id)} className="rounded-lg bg-crust-100 px-3 py-1 text-xs font-semibold text-crust-700 hover:bg-crust-200">Trazar</button>
                  </td>
                </tr>
              ))}
              {modo === "insumo" && insumos.map((l) => (
                <tr key={l.id} className="border-t border-crust-50">
                  <td className="px-4 py-2 font-mono text-xs text-crust-800">{l.lote}</td>
                  <td className="px-4 py-2 text-crust-600">{l.insumo.nombre}</td>
                  <td className="px-4 py-2 text-right text-crust-500">{Number(l.cantidad)} {l.insumo.unidad}</td>
                  <td className="px-4 py-2 text-crust-500">{fecha(l.vencimiento)}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => verInsumo(l.id)} className="rounded-lg bg-crust-100 px-3 py-1 text-xs font-semibold text-crust-700 hover:bg-crust-200">Trazar</button>
                  </td>
                </tr>
              ))}
              {((modo === "producido" && producidos.length === 0) || (modo === "insumo" && insumos.length === 0)) && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-crust-400">
                  No hay lotes {q ? "con ese código" : "registrados"}.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detalle de la traza */}
        <div>
          {traza && (
            <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-crust-800">Lote {traza.lote.lote}</h3>
              <p className="text-sm text-crust-500">
                {traza.lote.producto ?? "—"} · {traza.lote.qty} u · producido {fecha(traza.lote.producedAt)}
                {traza.lote.expiresAt ? ` · vence ${fecha(traza.lote.expiresAt)}` : ""}
              </p>
              {traza.orden && (
                <p className="mt-2 rounded-lg bg-crust-50 px-3 py-2 text-sm text-crust-600">
                  Orden <b>{traza.orden.receta ?? traza.orden.id.slice(0, 8)}</b>
                  {traza.orden.responsable ? ` · ${traza.orden.responsable}` : ""}
                  {traza.orden.terminadaAt ? ` · terminada ${fechaHora(traza.orden.terminadaAt)}` : ""}
                </p>
              )}
              <p className="mt-4 text-sm font-semibold text-crust-700">Insumos consumidos</p>
              <ul className="mt-1 space-y-1 text-sm">
                {traza.consumos.map((c, i) => (
                  <li key={i} className="flex justify-between border-b border-crust-50 py-1">
                    <span className="text-crust-700">
                      {c.insumo} <span className="text-crust-400">· {c.cantidad} {c.unidad}</span>
                    </span>
                    <span className="text-xs text-crust-500">
                      {c.lote ? <span className="font-mono">{c.lote}</span> : <em className="text-crust-300">sin lote</em>}
                      {c.vencimiento ? ` · vence ${fecha(c.vencimiento)}` : ""}
                    </span>
                  </li>
                ))}
                {traza.consumos.length === 0 && <li className="text-crust-400">Sin consumos registrados para esta orden.</li>}
              </ul>
            </div>
          )}

          {trazaIns && (
            <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-crust-800">
                Lote <span className="font-mono text-base">{trazaIns.insumoLote.lote}</span>
              </h3>
              <p className="text-sm text-crust-500">
                {trazaIns.insumoLote.insumo} · quedan {trazaIns.insumoLote.restante} {trazaIns.insumoLote.unidad}
                {trazaIns.insumoLote.vencimiento ? ` · vence ${fecha(trazaIns.insumoLote.vencimiento)}` : ""}
              </p>
              <p className="mt-4 text-sm font-semibold text-crust-700">
                Se usó en {trazaIns.usos.length} lote(s) de producto
              </p>
              <ul className="mt-1 space-y-1 text-sm">
                {trazaIns.usos.map((u, i) => (
                  <li key={i} className="flex justify-between border-b border-crust-50 py-1">
                    <span className="text-crust-700">
                      <span className="font-mono text-xs">{u.loteProducto}</span> · {u.producto ?? "—"}
                    </span>
                    <span className="text-xs text-crust-500">
                      {u.qty} u · {fecha(u.producedAt)}{u.expiresAt ? ` · vence ${fecha(u.expiresAt)}` : ""}
                    </span>
                  </li>
                ))}
                {trazaIns.usos.length === 0 && (
                  <li className="text-crust-400">Todavía no se usó en ninguna producción.</li>
                )}
              </ul>
            </div>
          )}

          {!traza && !trazaIns && (
            <p className="rounded-2xl border border-dashed border-crust-200 p-10 text-center text-crust-400">
              Elegí un lote y tocá “Trazar” para ver su recorrido.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
