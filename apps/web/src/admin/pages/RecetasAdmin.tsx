import { useEffect, useState } from "react";
import { FOOD_COST_OBJETIVO, RecipeCost, UnitOfMeasure } from "@donjulio/shared";
import { api } from "../../lib/api";
import { formatUYU } from "../../lib/format";

interface Receta {
  id: string;
  nombre: string;
  isSubRecipe: boolean;
  yieldQty: string;
  yieldUnit: string;
  producto: { nombre: string } | null;
}
interface Insumo { id: string; nombre: string; unidad: string }

const UNIDADES = Object.values(UnitOfMeasure);

function foodCostColor(pct?: number) {
  if (pct == null) return "text-crust-500";
  if (pct <= FOOD_COST_OBJETIVO.max) return "text-green-600";
  if (pct <= FOOD_COST_OBJETIVO.max + 8) return "text-amber-600";
  return "text-red-600";
}

export default function RecetasAdmin() {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [cost, setCost] = useState<RecipeCost | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    nombre: "",
    isSubRecipe: false,
    yieldQty: 1,
    yieldUnit: "UNIDAD",
    mermaPct: 0,
    manoObraCosto: 0,
    overheadCosto: 0,
  });
  const [ings, setIngs] = useState<{ ref: string; cantidad: number; unidad: string }[]>([
    { ref: "", cantidad: 0, unidad: "KG" },
  ]);

  const load = () => {
    api.get<Receta[]>("/admin/recetas").then(setRecetas).catch(() => {});
    api.get<Insumo[]>("/admin/inventario/insumos").then(setInsumos).catch(() => {});
  };
  useEffect(load, []);

  const costear = async (id: string) => {
    setCost(null);
    const c = await api.get<RecipeCost>(`/admin/recetas/${id}/costeo`);
    setCost(c);
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    const ingredientes = ings
      .filter((i) => i.ref && i.cantidad > 0)
      .map((i) => {
        const [tipo, id] = i.ref.split(":");
        return tipo === "insumo"
          ? { insumoId: id, cantidad: i.cantidad, unidad: i.unidad }
          : { subRecetaId: id, cantidad: i.cantidad, unidad: i.unidad };
      });
    await api.post("/admin/recetas", {
      ...form,
      yieldQty: Number(form.yieldQty),
      mermaPct: Number(form.mermaPct),
      manoObraCosto: Number(form.manoObraCosto),
      overheadCosto: Number(form.overheadCosto),
      ingredientes,
    });
    setShowForm(false);
    setForm({ nombre: "", isSubRecipe: false, yieldQty: 1, yieldUnit: "UNIDAD", mermaPct: 0, manoObraCosto: 0, overheadCosto: 0 });
    setIngs([{ ref: "", cantidad: 0, unidad: "KG" }]);
    load();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-crust-800">Recetas y costos</h1>
        <button onClick={() => setShowForm(!showForm)} className="rounded-lg bg-crust-600 px-4 py-2 text-sm font-semibold text-white hover:bg-crust-700">
          {showForm ? "Cancelar" : "+ Nueva receta"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={crear} className="mb-6 space-y-3 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="rounded-lg border border-crust-200 px-3 py-2" required />
            <label className="flex items-center gap-2 text-sm text-crust-700">
              <input type="checkbox" checked={form.isSubRecipe} onChange={(e) => setForm({ ...form, isSubRecipe: e.target.checked })} />
              Es sub-receta (preparación intermedia)
            </label>
            <div className="flex gap-2">
              <input type="number" step="0.01" placeholder="Rendimiento" value={form.yieldQty} onChange={(e) => setForm({ ...form, yieldQty: Number(e.target.value) })} className="w-32 rounded-lg border border-crust-200 px-3 py-2" />
              <select value={form.yieldUnit} onChange={(e) => setForm({ ...form, yieldUnit: e.target.value })} className="rounded-lg border border-crust-200 px-3 py-2">
                {UNIDADES.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <input type="number" step="0.01" placeholder="% merma" value={form.mermaPct} onChange={(e) => setForm({ ...form, mermaPct: Number(e.target.value) })} className="rounded-lg border border-crust-200 px-3 py-2" />
            <input type="number" step="0.01" placeholder="Mano de obra $" value={form.manoObraCosto} onChange={(e) => setForm({ ...form, manoObraCosto: Number(e.target.value) })} className="rounded-lg border border-crust-200 px-3 py-2" />
            <input type="number" step="0.01" placeholder="Overhead $" value={form.overheadCosto} onChange={(e) => setForm({ ...form, overheadCosto: Number(e.target.value) })} className="rounded-lg border border-crust-200 px-3 py-2" />
          </div>

          <p className="text-sm font-semibold text-crust-700">Ingredientes (insumos y sub-recetas)</p>
          {ings.map((ing, idx) => (
            <div key={idx} className="flex gap-2">
              <select value={ing.ref} onChange={(e) => setIngs(ings.map((x, i) => i === idx ? { ...x, ref: e.target.value } : x))} className="flex-1 rounded-lg border border-crust-200 px-3 py-2">
                <option value="">— elegir —</option>
                <optgroup label="Insumos">
                  {insumos.map((i) => <option key={i.id} value={`insumo:${i.id}`}>{i.nombre}</option>)}
                </optgroup>
                <optgroup label="Sub-recetas">
                  {recetas.filter((r) => r.isSubRecipe).map((r) => <option key={r.id} value={`receta:${r.id}`}>{r.nombre}</option>)}
                </optgroup>
              </select>
              <input type="number" step="0.001" placeholder="Cant." value={ing.cantidad} onChange={(e) => setIngs(ings.map((x, i) => i === idx ? { ...x, cantidad: Number(e.target.value) } : x))} className="w-24 rounded-lg border border-crust-200 px-3 py-2" />
              <select value={ing.unidad} onChange={(e) => setIngs(ings.map((x, i) => i === idx ? { ...x, unidad: e.target.value } : x))} className="rounded-lg border border-crust-200 px-3 py-2">
                {UNIDADES.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
          ))}
          <button type="button" onClick={() => setIngs([...ings, { ref: "", cantidad: 0, unidad: "KG" }])} className="text-sm font-medium text-crust-600">+ agregar ingrediente</button>
          <div><button className="rounded-lg bg-crust-600 px-4 py-2 font-semibold text-white hover:bg-crust-700">Guardar receta</button></div>
        </form>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-crust-50 text-left text-crust-600">
              <tr><th className="px-4 py-3">Receta</th><th className="px-4 py-3">Rendimiento</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {recetas.map((r) => (
                <tr key={r.id} className="border-t border-crust-50">
                  <td className="px-4 py-3 font-medium text-crust-800">
                    {r.nombre}
                    {r.isSubRecipe && <span className="ml-2 rounded-full bg-crust-100 px-2 py-0.5 text-xs text-crust-600">sub-receta</span>}
                  </td>
                  <td className="px-4 py-3 text-crust-500">{Number(r.yieldQty)} {r.yieldUnit}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => costear(r.id)} className="rounded-lg bg-crust-100 px-3 py-1 text-xs font-semibold text-crust-700 hover:bg-crust-200">Costear</button>
                  </td>
                </tr>
              ))}
              {recetas.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-crust-400">No hay recetas.</td></tr>}
            </tbody>
          </table>
        </div>

        {cost && (
          <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
            <h3 className="font-display text-lg font-semibold text-crust-800">{cost.nombre}</h3>
            <p className="text-sm text-crust-500">Rinde {cost.yieldQty} {cost.yieldUnit}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {cost.breakdown.map((b, i) => (
                <li key={i} className="flex justify-between">
                  <span className="text-crust-600">{b.tipo === "SUBRECETA" ? "↳ " : ""}{b.nombre} ({b.cantidad} {b.unidad})</span>
                  <span className="font-medium">{formatUYU(b.costo)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 border-t border-crust-100 pt-3 text-sm">
              <div className="flex justify-between"><span>Material (+{cost.mermaPct}% merma)</span><span>{formatUYU(cost.materialCostConMerma)}</span></div>
              <div className="flex justify-between"><span>Mano de obra</span><span>{formatUYU(cost.laborCost)}</span></div>
              <div className="flex justify-between"><span>Overhead</span><span>{formatUYU(cost.overheadCost)}</span></div>
              <div className="flex justify-between font-bold text-crust-900"><span>Costo total</span><span>{formatUYU(cost.totalCost)}</span></div>
              <div className="flex justify-between"><span>Costo unitario</span><span>{formatUYU(cost.unitCost)}</span></div>
            </div>
            {cost.precioVenta != null && (
              <div className="mt-3 rounded-lg bg-crust-50 p-3 text-sm">
                <div className="flex justify-between"><span>Precio de venta</span><span>{formatUYU(cost.precioVenta)}</span></div>
                <div className="flex justify-between font-bold">
                  <span>Food cost</span>
                  <span className={foodCostColor(cost.foodCostPct)}>{cost.foodCostPct}% {cost.foodCostPct != null && cost.foodCostPct <= FOOD_COST_OBJETIVO.max ? "✓" : "⚠"}</span>
                </div>
                <p className="mt-1 text-xs text-crust-400">Objetivo: {FOOD_COST_OBJETIVO.min}–{FOOD_COST_OBJETIVO.max}%</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
