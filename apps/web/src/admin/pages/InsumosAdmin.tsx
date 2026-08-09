import { useEffect, useState } from "react";
import { UnitOfMeasure } from "@donjulio/shared";
import { api } from "../../lib/api";
import { formatUYU } from "../../lib/format";

interface Insumo {
  id: string;
  nombre: string;
  unidad: string;
  costoUnitario: string;
  stockActual: string;
  puntoReorden: string;
}
interface Lote {
  id: string;
  lote: string;
  vencimiento: string | null;
  insumo: { nombre: string };
}

const UNIDADES = Object.values(UnitOfMeasure);

export default function InsumosAdmin() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [reorden, setReorden] = useState<Insumo[]>([]);
  const [vencimientos, setVencimientos] = useState<Lote[]>([]);
  const [form, setForm] = useState({ nombre: "", unidad: "KG", costoUnitario: 0, puntoReorden: 0 });
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.get<Insumo[]>("/admin/inventario/insumos").then(setInsumos).catch(() => {});
    api.get<Insumo[]>("/admin/inventario/alertas/reorden").then(setReorden).catch(() => {});
    api.get<Lote[]>("/admin/inventario/alertas/vencimiento?dias=14").then(setVencimientos).catch(() => {});
  };
  useEffect(load, []);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/admin/inventario/insumos", { ...form, costoUnitario: Number(form.costoUnitario), puntoReorden: Number(form.puntoReorden) });
      setForm({ nombre: "", unidad: "KG", costoUnitario: 0, puntoReorden: 0 });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const entrada = async (i: Insumo) => {
    const cant = window.prompt(`Entrada de stock para ${i.nombre} (${i.unidad}). Cantidad:`);
    if (!cant) return;
    const costo = window.prompt("Costo unitario (opcional, enter para mantener):");
    await api.post(`/admin/inventario/insumos/${i.id}/entrada`, {
      cantidad: Number(cant),
      ...(costo ? { costoUnitario: Number(costo) } : {}),
    });
    load();
  };

  const ajustar = async (i: Insumo) => {
    const real = window.prompt(`Stock real contado de ${i.nombre} (${i.unidad}):`, i.stockActual);
    if (real == null) return;
    await api.post(`/admin/inventario/insumos/${i.id}/ajuste`, { stockReal: Number(real) });
    load();
  };

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold text-crust-800">Insumos y Stock</h1>

      {(reorden.length > 0 || vencimientos.length > 0) && (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="mb-2 font-semibold text-amber-800">⚠️ Bajo punto de reorden</h3>
            {reorden.length === 0 ? (
              <p className="text-sm text-amber-700">Todo en orden.</p>
            ) : (
              <ul className="text-sm text-amber-800">
                {reorden.map((i) => (
                  <li key={i.id}>• {i.nombre}: {Number(i.stockActual)} {i.unidad} (reorden {Number(i.puntoReorden)})</li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <h3 className="mb-2 font-semibold text-red-800">⏰ Vencimientos próximos (14 días)</h3>
            {vencimientos.length === 0 ? (
              <p className="text-sm text-red-700">Sin vencimientos próximos.</p>
            ) : (
              <ul className="text-sm text-red-800">
                {vencimientos.map((l) => (
                  <li key={l.id}>• {l.insumo.nombre} (lote {l.lote}): {l.vencimiento ? new Date(l.vencimiento).toLocaleDateString("es-UY") : "—"}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <form onSubmit={crear} className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-crust-100 bg-white p-4 shadow-sm">
        <input placeholder="Nombre del insumo" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="flex-1 rounded-lg border border-crust-200 px-3 py-2" required />
        <select value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} className="rounded-lg border border-crust-200 px-3 py-2">
          {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <input type="number" step="0.01" placeholder="Costo unit." value={form.costoUnitario} onChange={(e) => setForm({ ...form, costoUnitario: Number(e.target.value) })} className="w-28 rounded-lg border border-crust-200 px-3 py-2" />
        <input type="number" step="0.01" placeholder="Reorden" value={form.puntoReorden} onChange={(e) => setForm({ ...form, puntoReorden: Number(e.target.value) })} className="w-28 rounded-lg border border-crust-200 px-3 py-2" />
        <button className="rounded-lg bg-crust-600 px-4 py-2 font-semibold text-white hover:bg-crust-700">Agregar</button>
      </form>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-crust-50 text-left text-crust-600">
            <tr>
              <th className="px-4 py-3">Insumo</th>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3 text-right">Costo</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Reorden</th>
              <th className="px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {insumos.map((i) => {
              const low = Number(i.stockActual) <= Number(i.puntoReorden);
              return (
                <tr key={i.id} className="border-t border-crust-50">
                  <td className="px-4 py-3 font-medium text-crust-800">{i.nombre}</td>
                  <td className="px-4 py-3 text-crust-500">{i.unidad}</td>
                  <td className="px-4 py-3 text-right">{formatUYU(i.costoUnitario)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${low ? "text-red-600" : "text-crust-800"}`}>{Number(i.stockActual)}</td>
                  <td className="px-4 py-3 text-right text-crust-500">{Number(i.puntoReorden)}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => entrada(i)} className="mr-2 rounded-lg bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-200">+ Entrada</button>
                    <button onClick={() => ajustar(i)} className="rounded-lg bg-crust-100 px-3 py-1 text-xs font-semibold text-crust-700 hover:bg-crust-200">Ajuste</button>
                  </td>
                </tr>
              );
            })}
            {insumos.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-crust-400">No hay insumos cargados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
