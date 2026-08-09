import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface Receta { id: string; nombre: string; isSubRecipe: boolean }
interface Orden {
  id: string;
  cantidadLotes: string;
  status: string;
  receta: { nombre: string };
  lotes: { lote: string }[];
  createdAt: string;
}
interface Req { nombre: string; unidad: string; necesario: number; disponible: number; faltante: number }

export default function ProduccionAdmin() {
  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [form, setForm] = useState({ recetaId: "", cantidadLotes: 1 });
  const [reqs, setReqs] = useState<Record<string, Req[]>>({});
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.get<Orden[]>("/admin/produccion").then(setOrdenes).catch(() => {});
    api.get<Receta[]>("/admin/recetas").then((r) => setRecetas(r.filter((x) => !x.isSubRecipe))).catch(() => {});
  };
  useEffect(load, []);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.recetaId) return;
    try {
      await api.post("/admin/produccion", { recetaId: form.recetaId, cantidadLotes: Number(form.cantidadLotes) });
      setForm({ recetaId: "", cantidadLotes: 1 });
      load();
    } catch (e) { setError((e as Error).message); }
  };

  const verReq = async (id: string) => {
    const r = await api.get<Req[]>(`/admin/produccion/${id}/requerimientos`);
    setReqs({ ...reqs, [id]: r });
  };

  const avanzar = async (id: string, status: string, extra: object = {}) => {
    setError(null);
    try {
      await api.patch(`/admin/produccion/${id}/estado`, { status, ...extra });
      load();
    } catch (e) { setError((e as Error).message); }
  };

  const badge = (s: string) => {
    const map: Record<string, string> = {
      PLANIFICADA: "bg-crust-100 text-crust-600",
      EN_PROCESO: "bg-amber-100 text-amber-700",
      TERMINADA: "bg-green-100 text-green-700",
      CANCELADA: "bg-red-100 text-red-600",
    };
    return map[s] ?? "bg-crust-100";
  };

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold text-crust-800">Producción</h1>

      <form onSubmit={crear} className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-crust-100 bg-white p-4 shadow-sm">
        <select value={form.recetaId} onChange={(e) => setForm({ ...form, recetaId: e.target.value })} className="flex-1 rounded-lg border border-crust-200 px-3 py-2" required>
          <option value="">— elegir receta —</option>
          {recetas.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <input type="number" step="0.1" min="0.1" value={form.cantidadLotes} onChange={(e) => setForm({ ...form, cantidadLotes: Number(e.target.value) })} className="w-28 rounded-lg border border-crust-200 px-3 py-2" />
        <span className="text-sm text-crust-500">lotes</span>
        <button className="rounded-lg bg-crust-600 px-4 py-2 font-semibold text-white hover:bg-crust-700">Planificar</button>
      </form>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="space-y-3">
        {ordenes.map((o) => (
          <div key={o.id} className="rounded-2xl border border-crust-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-crust-800">{o.receta.nombre} · {Number(o.cantidadLotes)} lote(s)</p>
                <p className="text-sm text-crust-500">{new Date(o.createdAt).toLocaleString("es-UY")}{o.lotes[0] ? ` · lote: ${o.lotes[0].lote}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge(o.status)}`}>{o.status}</span>
                {o.status === "PLANIFICADA" && (
                  <>
                    <button onClick={() => verReq(o.id)} className="rounded-lg bg-crust-100 px-3 py-1 text-xs font-semibold text-crust-700 hover:bg-crust-200">Requerimientos</button>
                    <button onClick={() => avanzar(o.id, "EN_PROCESO")} className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600">Iniciar (descuenta stock)</button>
                    <button onClick={() => avanzar(o.id, "CANCELADA")} className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50">Cancelar</button>
                  </>
                )}
                {o.status === "EN_PROCESO" && (
                  <button onClick={() => avanzar(o.id, "TERMINADA", { diasVencimiento: 3 })} className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700">Terminar</button>
                )}
              </div>
            </div>
            {reqs[o.id] && (
              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-crust-500">
                  <tr><th className="py-1">Insumo</th><th className="py-1 text-right">Necesita</th><th className="py-1 text-right">Disponible</th><th className="py-1 text-right">Falta</th></tr>
                </thead>
                <tbody>
                  {reqs[o.id].map((r, i) => (
                    <tr key={i} className="border-t border-crust-50">
                      <td className="py-1">{r.nombre}</td>
                      <td className="py-1 text-right">{r.necesario} {r.unidad}</td>
                      <td className="py-1 text-right">{r.disponible}</td>
                      <td className={`py-1 text-right font-semibold ${r.faltante > 0 ? "text-red-600" : "text-green-600"}`}>{r.faltante}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        {ordenes.length === 0 && <p className="rounded-2xl border border-crust-100 bg-white p-8 text-center text-crust-400">No hay órdenes de producción.</p>}
      </div>
    </div>
  );
}
