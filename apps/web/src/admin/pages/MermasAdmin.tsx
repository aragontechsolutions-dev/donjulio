import { useEffect, useState } from "react";
import { MermaMotivo } from "@donjulio/shared";
import { api } from "../../lib/api";
import { formatUYU } from "../../lib/format";

interface Insumo { id: string; nombre: string; unidad: string }
interface Producto { id: string; nombre: string }
interface Merma {
  id: string;
  motivo: string;
  cantidad: string;
  costo: string;
  createdAt: string;
  insumo: { nombre: string } | null;
  producto: { nombre: string } | null;
}

const MOTIVOS = Object.values(MermaMotivo);

export default function MermasAdmin() {
  const [mermas, setMermas] = useState<Merma[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [form, setForm] = useState({ objeto: "", motivo: "NO_VENDIDO", cantidad: 1, costo: "" });

  const load = () => {
    api.get<Merma[]>("/admin/mermas").then(setMermas).catch(() => {});
    api.get<Insumo[]>("/admin/inventario/insumos").then(setInsumos).catch(() => {});
    api.get<Producto[]>("/admin/productos").then(setProductos).catch(() => {});
  };
  useEffect(load, []);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.objeto) return;
    const [tipo, id] = form.objeto.split(":");
    await api.post("/admin/mermas", {
      ...(tipo === "insumo" ? { insumoId: id } : { productoId: id }),
      motivo: form.motivo,
      cantidad: Number(form.cantidad),
      ...(form.costo ? { costo: Number(form.costo) } : {}),
    });
    setForm({ objeto: "", motivo: "NO_VENDIDO", cantidad: 1, costo: "" });
    load();
  };

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold text-crust-800">Mermas y desperdicios</h1>

      <form onSubmit={crear} className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-crust-100 bg-white p-4 shadow-sm">
        <select value={form.objeto} onChange={(e) => setForm({ ...form, objeto: e.target.value })} className="flex-1 rounded-lg border border-crust-200 px-3 py-2" required>
          <option value="">— producto o insumo —</option>
          <optgroup label="Insumos (descuenta stock)">
            {insumos.map((i) => <option key={i.id} value={`insumo:${i.id}`}>{i.nombre}</option>)}
          </optgroup>
          <optgroup label="Productos terminados">
            {productos.map((p) => <option key={p.id} value={`producto:${p.id}`}>{p.nombre}</option>)}
          </optgroup>
        </select>
        <select value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} className="rounded-lg border border-crust-200 px-3 py-2">
          {MOTIVOS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
        </select>
        <input type="number" step="0.01" placeholder="Cantidad" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })} className="w-28 rounded-lg border border-crust-200 px-3 py-2" />
        <input type="number" step="0.01" placeholder="Costo (opc.)" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} className="w-32 rounded-lg border border-crust-200 px-3 py-2" />
        <button className="rounded-lg bg-dj-terracota px-4 py-2 font-semibold text-white hover:bg-dj-cobre">Registrar</button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-crust-50 text-left text-crust-600">
            <tr><th className="px-4 py-3">Ítem</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3 text-right">Cantidad</th><th className="px-4 py-3 text-right">Costo</th><th className="px-4 py-3 text-right">Fecha</th></tr>
          </thead>
          <tbody>
            {mermas.map((m) => (
              <tr key={m.id} className="border-t border-crust-50">
                <td className="px-4 py-3 font-medium text-crust-800">{m.insumo?.nombre ?? m.producto?.nombre ?? "—"}</td>
                <td className="px-4 py-3 text-crust-500">{m.motivo.replace(/_/g, " ")}</td>
                <td className="px-4 py-3 text-right">{Number(m.cantidad)}</td>
                <td className="px-4 py-3 text-right text-red-600">{formatUYU(m.costo)}</td>
                <td className="px-4 py-3 text-right text-crust-500">{new Date(m.createdAt).toLocaleDateString("es-UY")}</td>
              </tr>
            ))}
            {mermas.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-crust-400">Sin mermas registradas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
