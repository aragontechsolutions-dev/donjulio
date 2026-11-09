import { useCallback, useEffect, useMemo, useState } from "react";
import { UnidadVenta } from "@donjulio/shared";
import { api } from "../../lib/api";
import Modal from "../../lib/Modal";
import Paginador, { usePaginacion } from "../../lib/Paginador";
import { formatUYU } from "../../lib/format";

/**
 * El stock de los productos terminados.
 *
 * Los insumos son lo que se compra para producir: harina, manteca, levadura.
 * Los productos son lo que se vende. Hasta acá, la pantalla de stock mostraba
 * sólo insumos, y entonces una botella de agua —que se compra ya hecha y se
 * revende— no tenía dónde cargarse: había que inventarla también como insumo
 * para poder darle entrada, y llevar la misma cosa por duplicado.
 *
 * Acá se ve lo que hay de cada producto y se le puede dar entrada a lo que se
 * compra hecho. Lo que sale del horno no se carga a mano: entra solo cuando
 * se termina una orden de producción.
 */

interface ProductoStock {
  id: string;
  nombre: string;
  categoria: string;
  unidadVenta: string;
  controlaStock: boolean;
  esReventa: boolean;
  costoCompra: number | null;
  proveedor: string | null;
  /** null = no lleva control de stock (no es lo mismo que cero). */
  stock: number | null;
  /** Con receta: el stock lo genera la producción, no una compra. */
  seProduce: boolean;
}

const unidad = (p: ProductoStock) => (p.unidadVenta === UnidadVenta.KG ? "kg" : "u.");

export default function ProductosStock() {
  const [productos, setProductos] = useState<ProductoStock[]>([]);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(true);
  const [entrada, setEntrada] = useState<ProductoStock | null>(null);
  const [form, setForm] = useState({ cantidad: "", costoUnitario: "", lote: "", vencimiento: "" });
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    api
      .get<ProductoStock[]>("/admin/inventario/productos")
      .then(setProductos)
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);
  useEffect(cargar, [cargar]);

  const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visibles = useMemo(() => {
    const t = plano(q.trim());
    return t ? productos.filter((p) => plano(`${p.nombre} ${p.categoria}`).includes(t)) : productos;
  }, [productos, q]);

  // Los que llevan stock arriba: son los que se miran todos los días. Abajo,
  // los que no lo llevan, que es donde hay que ir a activarlo.
  const conStock = useMemo(() => visibles.filter((p) => p.controlaStock), [visibles]);
  const sinStock = useMemo(() => visibles.filter((p) => !p.controlaStock), [visibles]);
  // Se pagina la tabla de arriba, que es la que crece con el catálogo.
  const pag = usePaginacion(conStock);

  const abrirEntrada = (p: ProductoStock) => {
    setForm({ cantidad: "", costoUnitario: p.costoCompra ? String(p.costoCompra) : "", lote: "", vencimiento: "" });
    setEntrada(p);
  };

  const guardarEntrada = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entrada) return;
    setGuardando(true);
    try {
      await api.post(`/admin/inventario/productos/${entrada.id}/entrada`, {
        cantidad: Number(form.cantidad),
        ...(form.costoUnitario ? { costoUnitario: Number(form.costoUnitario) } : {}),
        ...(form.lote ? { lote: form.lote } : {}),
        ...(form.vencimiento ? { vencimiento: form.vencimiento } : {}),
      });
      setEntrada(null);
      cargar();
    } catch {
      /* el toast lo dispara el api client */
    } finally {
      setGuardando(false);
    }
  };

  /** Activa el control de stock desde acá, sin ir a la ficha del producto. */
  const activarStock = async (p: ProductoStock) => {
    try {
      await api.patch(`/admin/productos/${p.id}`, { controlaStock: true });
      cargar();
    } catch {
      /* el toast lo dispara el api client */
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full max-w-xs rounded-lg border border-crust-200 px-3 py-2 text-sm"
        />
        <p className="text-sm text-crust-500">
          {conStock.length} con control de stock · {sinStock.length} sin control
        </p>
      </div>

      {cargando ? (
        <p className="text-sm text-crust-500">Cargando…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-crust-100 bg-white shadow-sm">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="border-b border-crust-100 bg-crust-50 text-left text-xs uppercase tracking-wide text-crust-500">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3">Se repone</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {conStock.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-crust-500">
                      Ningún producto lleva control de stock todavía. Activalo en los de abajo.
                    </td>
                  </tr>
                )}
                {pag.visibles.map((p) => (
                  <tr key={p.id} className="border-b border-crust-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-crust-800">{p.nombre}</td>
                    <td className="px-4 py-3 text-crust-500">{p.categoria}</td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-semibold ${
                        (p.stock ?? 0) <= 0 ? "text-red-600" : "text-crust-800"
                      }`}
                    >
                      {(p.stock ?? 0).toLocaleString("es-UY", { maximumFractionDigits: 3 })} {unidad(p)}
                    </td>
                    <td className="px-4 py-3 text-crust-500">
                      {p.seProduce ? (
                        <span title="Entra solo al terminar una orden de producción">
                          Producción
                        </span>
                      ) : (
                        <span>Compra{p.proveedor ? ` · ${p.proveedor}` : ""}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-crust-500">
                      {p.costoCompra != null ? formatUYU(p.costoCompra) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.seProduce ? (
                        <span className="text-xs text-crust-400">desde Producción</span>
                      ) : (
                        <button
                          onClick={() => abrirEntrada(p)}
                          className="rounded-lg bg-dj-terracota px-3 py-1.5 text-xs font-semibold text-white hover:bg-dj-cobre"
                        >
                          Entrada
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {conStock.length > 0 && <Paginador {...pag} nombre="productos" />}
          </div>

          {sinStock.length > 0 && (
            <div className="mt-6 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
              <h3 className="font-display text-lg font-semibold text-crust-800">
                Sin control de stock
              </h3>
              <p className="mb-3 mt-1 text-sm text-crust-500">
                Se pueden vender siempre, sin descontar nada. Está bien para lo que se prepara
                al momento —un café, un tostado—, pero lo que se compra hecho y se cuenta en la
                vitrina conviene pasarlo a stock para saber cuánto queda.
              </p>
              <ul className="divide-y divide-crust-50">
                {sinStock.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-sm text-crust-700">
                      {p.nombre} <span className="text-crust-400">· {p.categoria}</span>
                      {p.esReventa && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          reventa
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => activarStock(p)}
                      className="rounded-lg border border-crust-200 px-3 py-1.5 text-xs font-medium text-crust-700 hover:bg-crust-100"
                    >
                      Llevar stock de este
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {entrada && (
        <Modal
          title="Entrada de mercadería"
          subtitle={`${entrada.nombre} · se vende por ${entrada.unidadVenta === UnidadVenta.KG ? "kilo" : "unidad"}`}
          onClose={() => setEntrada(null)}
        >
          <form onSubmit={guardarEntrada} className="grid gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">
                Cantidad que entró ({unidad(entrada)})
              </span>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={form.cantidad}
                onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                className="w-full rounded-lg border border-crust-200 px-3 py-2"
                required
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">
                Costo de compra por {unidad(entrada)}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.costoUnitario}
                onChange={(e) => setForm({ ...form, costoUnitario: e.target.value })}
                className="w-full rounded-lg border border-crust-200 px-3 py-2"
              />
              <span className="mt-1 block text-xs text-crust-400">
                Opcional. Si lo cargás, queda como el costo del producto y el margen se
                calcula con ese número.
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Remito o lote</span>
                <input
                  value={form.lote}
                  onChange={(e) => setForm({ ...form, lote: e.target.value })}
                  placeholder="Opcional"
                  className="w-full rounded-lg border border-crust-200 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Vencimiento</span>
                <input
                  type="date"
                  value={form.vencimiento}
                  onChange={(e) => setForm({ ...form, vencimiento: e.target.value })}
                  className="w-full rounded-lg border border-crust-200 px-3 py-2"
                />
                <span className="mt-1 block text-xs text-crust-400">
                  Con fecha, se vende primero lo que vence antes.
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEntrada(null)}
                className="rounded-lg border border-crust-200 px-4 py-2 text-sm font-medium text-crust-700 hover:bg-crust-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando}
                className="rounded-lg bg-dj-terracota px-4 py-2 text-sm font-semibold text-white hover:bg-dj-cobre disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Registrar entrada"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
