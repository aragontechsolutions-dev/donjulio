import { useEffect, useMemo, useState } from "react";
import { FOOD_COST_OBJETIVO, RecipeCost, UnitOfMeasure } from "@donjulio/shared";
import { api } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { formatUYU } from "../../lib/format";
import Buscador, { type OpcionBuscador } from "../../lib/Buscador";

interface Receta {
  id: string;
  nombre: string;
  isSubRecipe: boolean;
  yieldQty: string;
  yieldUnit: string;
  producto: { nombre: string } | null;
}
interface Insumo { id: string; nombre: string; unidad: string }
interface ProductoRef {
  id: string;
  nombre: string;
  precio: string;
  esReventa: boolean;
  receta?: { id: string; nombre: string } | null;
}

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
  const [productos, setProductos] = useState<ProductoRef[]>([]);
  const [cost, setCost] = useState<RecipeCost | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    nombre: "",
    productoId: "",
    isSubRecipe: false,
    yieldQty: 1,
    yieldUnit: "UNIDAD",
    mermaPct: 0,
    manoObraCosto: 0,
    overheadCosto: 0,
    notas: "",
  });
  const [ings, setIngs] = useState<{ ref: string; cantidad: number; unidad: string }[]>([
    { ref: "", cantidad: 0, unidad: "KG" },
  ]);

  const load = () => {
    api.get<Receta[]>("/admin/recetas").then(setRecetas).catch(() => {});
    api.get<Insumo[]>("/admin/inventario/insumos/opciones").then(setInsumos).catch(() => {});
    api.get<ProductoRef[]>("/admin/productos").then(setProductos).catch(() => {});
  };
  useEffect(load, []);

  /**
   * Productos asociables. Los que ya tienen receta o son de reventa se
   * muestran bloqueados con el motivo, en vez de esconderlos: así se entiende
   * por qué no aparecen, que es la duda típica al asociar.
   */
  const opcionesProducto = useMemo<OpcionBuscador[]>(
    () =>
      productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        detalle: formatUYU(p.precio),
        bloqueado: p.esReventa || !!p.receta,
        motivo: p.esReventa ? "es de reventa" : p.receta ? `ya tiene “${p.receta.nombre}”` : undefined,
      })),
    [productos],
  );

  /** Insumos del stock y sub-recetas, en una sola lista agrupada. */
  const opcionesIngrediente = useMemo<OpcionBuscador[]>(
    () => [
      ...insumos.map((i) => ({
        id: `insumo:${i.id}`,
        nombre: i.nombre,
        detalle: i.unidad,
        grupo: "Insumos",
      })),
      ...recetas
        .filter((r) => r.isSubRecipe)
        .map((r) => ({
          id: `receta:${r.id}`,
          nombre: r.nombre,
          detalle: `${Number(r.yieldQty)} ${r.yieldUnit}`,
          grupo: "Sub-recetas",
        })),
    ],
    [insumos, recetas],
  );

  /**
   * Unidad con la que conviene arrancar al elegir un ingrediente: la del
   * insumo o el rendimiento de la sub-receta. Igual se puede cambiar, porque
   * el backend convierte.
   */
  const unidadSugerida = (ref: string): string | undefined => {
    const [tipo, id] = ref.split(":");
    if (tipo === "insumo") return insumos.find((i) => i.id === id)?.unidad;
    if (tipo === "receta") return recetas.find((r) => r.id === id)?.yieldUnit;
    return undefined;
  };

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
    if (ingredientes.length === 0) {
      showToast("error", "Agregá al menos un ingrediente con cantidad.");
      return;
    }
    try {
      await api.post("/admin/recetas", {
        nombre: form.nombre,
        isSubRecipe: form.isSubRecipe,
        yieldQty: Number(form.yieldQty),
        yieldUnit: form.yieldUnit,
        mermaPct: Number(form.mermaPct),
        manoObraCosto: Number(form.manoObraCosto),
        overheadCosto: Number(form.overheadCosto),
        ...(form.productoId && !form.isSubRecipe ? { productoId: form.productoId } : {}),
        ...(form.notas.trim() ? { notas: form.notas.trim() } : {}),
        ingredientes,
      });
      setShowForm(false);
      setForm({ nombre: "", productoId: "", isSubRecipe: false, yieldQty: 1, yieldUnit: "UNIDAD", mermaPct: 0, manoObraCosto: 0, overheadCosto: 0, notas: "" });
      setIngs([{ ref: "", cantidad: 0, unidad: "KG" }]);
      load();
    } catch {
      /* el toast de error lo dispara el api client */
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-crust-800">Recetas y costos</h1>
        <button onClick={() => setShowForm(!showForm)} className="rounded-lg bg-dj-terracota px-4 py-2 text-sm font-semibold text-white hover:bg-dj-cobre">
          {showForm ? "Cancelar" : "+ Nueva receta"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={crear} className="mb-6 space-y-5 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          {/* 1. Qué es */}
          <div>
            <h3 className="mb-1 font-display text-lg font-semibold text-crust-800">1 · Qué preparás</h3>
            <p className="mb-3 text-sm text-crust-500">La receta define cuánto cuesta producir algo, a partir de sus ingredientes.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Nombre de la receta</span>
                <input placeholder="Ej: Bizcochos de grasa" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2" required />
                <span className="mt-1 block text-xs text-crust-400">Cómo la vas a identificar en el listado.</span>
              </label>

              <div className="rounded-lg border border-crust-100 bg-crust-50 p-3">
                <label className="flex items-start gap-2 text-sm text-crust-700">
                  <input type="checkbox" className="mt-1" checked={form.isSubRecipe} onChange={(e) => setForm({ ...form, isSubRecipe: e.target.checked, productoId: "" })} />
                  <span>
                    <b>Es una sub-receta</b> (preparación intermedia)
                    <span className="mt-0.5 block text-xs text-crust-500">
                      Marcala si no se vende sola y se usa dentro de otras recetas (ej: masa madre, crema pastelera). Si es algo que vendés, dejala sin marcar.
                    </span>
                  </span>
                </label>
              </div>

              {!form.isSubRecipe && (
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-crust-700">Producto que se vende <span className="font-normal text-crust-400">(opcional)</span></span>
                  <Buscador
                    opciones={opcionesProducto}
                    valorId={form.productoId}
                    onSelect={(id) => setForm({ ...form, productoId: id })}
                    placeholder="Buscar producto por nombre…"
                    opcionVacia="— sin asociar —"
                    sinResultados="Ningún producto coincide. Crealo en Productos."
                  />
                  <span className="mt-1 block text-xs text-crust-400">Asocialo para comparar el costo con el precio de venta y ver el <b>food cost</b> (objetivo {FOOD_COST_OBJETIVO.min}–{FOOD_COST_OBJETIVO.max}%).</span>
                </label>
              )}
            </div>
          </div>

          {/* 2. Rendimiento */}
          <div className="border-t border-crust-100 pt-4">
            <h3 className="mb-1 font-display text-lg font-semibold text-crust-800">2 · Cuánto rinde</h3>
            <p className="mb-3 text-sm text-crust-500">Con una tanda completa de esta receta, ¿cuánto obtenés? Sirve para calcular el costo por unidad.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Rendimiento (cantidad)</span>
                <div className="flex gap-2">
                  {/* step="any": con step="0.01" y min="0.0001" el navegador
                      consideraba inválido cualquier valor redondo (1, 24…) y
                      bloqueaba el guardado sin mostrar nada. */}
                  <input type="number" step="any" min="0.0001" value={form.yieldQty} onChange={(e) => setForm({ ...form, yieldQty: Number(e.target.value) })} className="w-full rounded-lg border border-crust-200 px-3 py-2" required />
                  <select value={form.yieldUnit} onChange={(e) => setForm({ ...form, yieldUnit: e.target.value })} className="rounded-lg border border-crust-200 px-3 py-2">
                    {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <span className="mt-1 block text-xs text-crust-400">Ej: 24 UNIDAD (salen 24 bizcochos) o 2 KG de masa.</span>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Merma del proceso (%)</span>
                <input type="number" step="0.01" min="0" max="100" value={form.mermaPct} onChange={(e) => setForm({ ...form, mermaPct: Number(e.target.value) })} className="w-full rounded-lg border border-crust-200 px-3 py-2" />
                <span className="mt-1 block text-xs text-crust-400">Lo que se pierde al elaborar (evaporación, recortes, fallas). Encarece el material en ese %. Si no sabés, dejá 0.</span>
              </label>
            </div>
          </div>

          {/* 3. Ingredientes */}
          <div className="border-t border-crust-100 pt-4">
            <h3 className="mb-1 font-display text-lg font-semibold text-crust-800">3 · Ingredientes</h3>
            <p className="mb-3 text-sm text-crust-500">Qué lleva la receta para ese rendimiento. Podés usar insumos del stock y otras sub-recetas.</p>
            <div className="space-y-2">
              {ings.map((ing, idx) => (
                <div key={idx} className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[180px] flex-1">
                    {idx === 0 && <span className="mb-1 block text-xs font-medium text-crust-600">Insumo o sub-receta</span>}
                    <Buscador
                      opciones={opcionesIngrediente}
                      valorId={ing.ref}
                      onSelect={(ref) => setIngs(ings.map((x, i) => (i === idx ? { ...x, ref, unidad: unidadSugerida(ref) ?? x.unidad } : x)))}
                      placeholder="Buscar insumo o sub-receta…"
                      sinResultados="Nada coincide. Cargalo en Insumos, o creá la sub-receta."
                    />
                  </label>
                  <label className="w-28">
                    {idx === 0 && <span className="mb-1 block text-xs font-medium text-crust-600">Cantidad</span>}
                    <input type="number" step="0.001" min="0" placeholder="0" value={ing.cantidad} onChange={(e) => setIngs(ings.map((x, i) => i === idx ? { ...x, cantidad: Number(e.target.value) } : x))} className="w-full rounded-lg border border-crust-200 px-3 py-2" />
                  </label>
                  <label className="w-28">
                    {idx === 0 && <span className="mb-1 block text-xs font-medium text-crust-600">Unidad</span>}
                    <select value={ing.unidad} onChange={(e) => setIngs(ings.map((x, i) => i === idx ? { ...x, unidad: e.target.value } : x))} className="w-full rounded-lg border border-crust-200 px-3 py-2">
                      {UNIDADES.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </label>
                  {ings.length > 1 && (
                    <button type="button" onClick={() => setIngs(ings.filter((_, i) => i !== idx))} className="rounded-lg px-2 py-2 text-sm text-red-500 hover:bg-red-50" title="Quitar ingrediente">✕</button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setIngs([...ings, { ref: "", cantidad: 0, unidad: "KG" }])} className="mt-2 text-sm font-medium text-crust-600 hover:text-crust-800">+ agregar ingrediente</button>
            <p className="mt-1 text-xs text-crust-400">Podés cargar en otra unidad que la del insumo (ej: insumo en KG y acá 500 G): el sistema convierte.</p>
          </div>

          {/* 4. Otros costos */}
          <div className="border-t border-crust-100 pt-4">
            <h3 className="mb-1 font-display text-lg font-semibold text-crust-800">4 · Otros costos <span className="text-sm font-normal text-crust-400">(opcional)</span></h3>
            <p className="mb-3 text-sm text-crust-500">Se suman al costo de los ingredientes para obtener el costo real de la tanda.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Mano de obra ($ por tanda)</span>
                <input type="number" step="0.01" min="0" value={form.manoObraCosto} onChange={(e) => setForm({ ...form, manoObraCosto: Number(e.target.value) })} className="w-full rounded-lg border border-crust-200 px-3 py-2" />
                <span className="mt-1 block text-xs text-crust-400">Lo que cuesta el trabajo de elaborar esta tanda (ej: 1 h de panadero).</span>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Gastos indirectos ($ por tanda)</span>
                <input type="number" step="0.01" min="0" value={form.overheadCosto} onChange={(e) => setForm({ ...form, overheadCosto: Number(e.target.value) })} className="w-full rounded-lg border border-crust-200 px-3 py-2" />
                <span className="mt-1 block text-xs text-crust-400">Horno, luz, gas, envases… lo que no es ingrediente ni mano de obra.</span>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-crust-700">Notas de preparación <span className="font-normal text-crust-400">(opcional)</span></span>
                <textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Ej: amasar 10 min, leudar 1 h, horno 200 °C" className="w-full rounded-lg border border-crust-200 px-3 py-2 text-sm" />
              </label>
            </div>
          </div>

          <div className="border-t border-crust-100 pt-4">
            <button className="rounded-lg bg-dj-terracota px-5 py-2.5 font-semibold text-white hover:bg-dj-cobre">Guardar receta</button>
          </div>
        </form>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-crust-50 text-left text-crust-600">
              <tr><th className="px-4 py-3">Receta</th><th className="px-4 py-3">Producto asociado</th><th className="px-4 py-3">Rendimiento</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {recetas.map((r) => (
                <tr key={r.id} className="border-t border-crust-50">
                  <td className="px-4 py-3 font-medium text-crust-800">
                    {r.nombre}
                    {r.isSubRecipe && <span className="ml-2 rounded-full bg-crust-100 px-2 py-0.5 text-xs text-crust-600">sub-receta</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.producto ? (
                      <span className="text-crust-700">{r.producto.nombre}</span>
                    ) : r.isSubRecipe ? (
                      <span className="text-crust-400">—</span>
                    ) : (
                      <span className="text-amber-600" title="Sin producto no se puede calcular el food cost">
                        sin asociar
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-crust-500">{Number(r.yieldQty)} {r.yieldUnit}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => costear(r.id)} className="rounded-lg bg-crust-100 px-3 py-1 text-xs font-semibold text-crust-700 hover:bg-crust-200">Costear</button>
                  </td>
                </tr>
              ))}
              {recetas.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-crust-400">Todavía no cargaste recetas.</td></tr>}
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
