import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UnitOfMeasure } from "@donjulio/shared";
import { api } from "../../lib/api";
import { formatUYU } from "../../lib/format";
import { showToast } from "../../lib/toast";
import { useDebounced } from "../../lib/useDebounced";
import Modal from "../../lib/Modal";

interface Insumo {
  id: string;
  nombre: string;
  unidad: string;
  costoUnitario: string;
  stockActual: string;
  puntoReorden: string;
}
interface Pagina {
  items: Insumo[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}
interface Lote {
  id: string;
  lote: string;
  vencimiento: string | null;
  insumo: { nombre: string };
}

/** Una fila del remito en la entrada múltiple. */
interface LineaEntrada {
  key: string;
  insumoId: string;
  cantidad: string;
  costoUnitario: string;
  lote: string;
  vencimiento: string;
}

const UNIDADES = Object.values(UnitOfMeasure);
const POR_PAGINA = [10, 20, 50, 100];
const nuevaLinea = (): LineaEntrada => ({
  key: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
  insumoId: "",
  cantidad: "",
  costoUnitario: "",
  lote: "",
  vencimiento: "",
});

export default function InsumosAdmin() {
  const [pagina, setPagina] = useState<Pagina>({
    items: [],
    total: 0,
    page: 1,
    perPage: POR_PAGINA[0],
    totalPages: 1,
  });
  const [cargando, setCargando] = useState(true);
  const [reorden, setReorden] = useState<Insumo[]>([]);
  const [vencimientos, setVencimientos] = useState<Lote[]>([]);
  const [form, setForm] = useState({ nombre: "", unidad: "KG", costoUnitario: 0, stockActual: 0, puntoReorden: 0 });
  const [error, setError] = useState<string | null>(null);

  // Búsqueda y paginación
  const [busqueda, setBusqueda] = useState("");
  const q = useDebounced(busqueda, 300);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(POR_PAGINA[0]);

  // Modal de Entrada / Ajuste sobre un insumo puntual.
  const [modal, setModal] = useState<{ type: "entrada" | "ajuste"; insumo: Insumo } | null>(null);
  const [modalForm, setModalForm] = useState({ cantidad: "", costoUnitario: "", lote: "", vencimiento: "", stockReal: "", motivo: "" });
  const [saving, setSaving] = useState(false);

  // Entrada múltiple (remito)
  const [remito, setRemito] = useState<LineaEntrada[] | null>(null);
  const [remitoMotivo, setRemitoMotivo] = useState("");
  const [opciones, setOpciones] = useState<Insumo[]>([]);

  // Descarta respuestas viejas: si el usuario sigue tecleando, la consulta
  // anterior puede llegar después de la nueva y pisar los resultados.
  const pedido = useRef(0);

  const cargarLista = useCallback(() => {
    const mio = ++pedido.current;
    setCargando(true);
    const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    if (q.trim()) params.set("q", q.trim());
    api
      .get<Pagina>(`/admin/inventario/insumos?${params}`)
      .then((p) => {
        if (mio !== pedido.current) return;
        setPagina(p);
        // El backend recorta la página si quedó fuera de rango (ej. al filtrar).
        if (p.page !== page) setPage(p.page);
      })
      .catch(() => {})
      .finally(() => {
        if (mio === pedido.current) setCargando(false);
      });
  }, [q, page, perPage]);

  const cargarAlertas = useCallback(() => {
    api.get<Insumo[]>("/admin/inventario/alertas/reorden").then(setReorden).catch(() => {});
    api.get<Lote[]>("/admin/inventario/alertas/vencimiento?dias=14").then(setVencimientos).catch(() => {});
  }, []);

  useEffect(cargarLista, [cargarLista]);
  useEffect(cargarAlertas, [cargarAlertas]);

  // Al cambiar la búsqueda o el tamaño de página, volver a la primera.
  useEffect(() => setPage(1), [q, perPage]);

  const recargar = () => {
    cargarLista();
    cargarAlertas();
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/admin/inventario/insumos", {
        ...form,
        costoUnitario: Number(form.costoUnitario),
        stockActual: Number(form.stockActual),
        puntoReorden: Number(form.puntoReorden),
      });
      setForm({ nombre: "", unidad: "KG", costoUnitario: 0, stockActual: 0, puntoReorden: 0 });
      recargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const abrirEntrada = (i: Insumo) => {
    setModalForm({ cantidad: "", costoUnitario: "", lote: "", vencimiento: "", stockReal: "", motivo: "" });
    setModal({ type: "entrada", insumo: i });
  };

  const abrirAjuste = (i: Insumo) => {
    setModalForm({ cantidad: "", costoUnitario: "", lote: "", vencimiento: "", stockReal: String(Number(i.stockActual)), motivo: "" });
    setModal({ type: "ajuste", insumo: i });
  };

  const cerrarModal = () => setModal(null);

  const submitEntrada = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal) return;
    setSaving(true);
    try {
      await api.post(`/admin/inventario/insumos/${modal.insumo.id}/entrada`, {
        cantidad: Number(modalForm.cantidad),
        ...(modalForm.costoUnitario ? { costoUnitario: Number(modalForm.costoUnitario) } : {}),
        ...(modalForm.lote ? { lote: modalForm.lote } : {}),
        ...(modalForm.vencimiento ? { vencimiento: modalForm.vencimiento } : {}),
      });
      cerrarModal();
      recargar();
    } catch {
      /* el toast de error lo dispara el api client */
    } finally {
      setSaving(false);
    }
  };

  const submitAjuste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal) return;
    setSaving(true);
    try {
      await api.post(`/admin/inventario/insumos/${modal.insumo.id}/ajuste`, {
        stockReal: Number(modalForm.stockReal),
        ...(modalForm.motivo ? { motivo: modalForm.motivo } : {}),
      });
      cerrarModal();
      recargar();
    } catch {
      /* el toast de error lo dispara el api client */
    } finally {
      setSaving(false);
    }
  };

  // ---------- Entrada múltiple ----------
  const abrirRemito = async () => {
    setRemitoMotivo("");
    setRemito([nuevaLinea()]);
    if (opciones.length === 0) {
      try {
        setOpciones(await api.get<Insumo[]>("/admin/inventario/insumos/opciones"));
      } catch {
        /* toast del api */
      }
    }
  };

  const setLinea = (key: string, campos: Partial<LineaEntrada>) =>
    setRemito((prev) => prev!.map((l) => (l.key === key ? { ...l, ...campos } : l)));

  const insumoDe = (id: string) => opciones.find((o) => o.id === id);

  /** Insumos ya elegidos en otras líneas: no se pueden repetir. */
  const yaElegidos = useMemo(
    () => new Set((remito ?? []).map((l) => l.insumoId).filter(Boolean)),
    [remito],
  );

  const totalRemito = useMemo(
    () =>
      (remito ?? []).reduce((acc, l) => {
        const cant = Number(l.cantidad) || 0;
        const costo = l.costoUnitario !== ""
          ? Number(l.costoUnitario)
          : Number(insumoDe(l.insumoId)?.costoUnitario ?? 0);
        return acc + cant * costo;
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remito, opciones],
  );

  const lineasValidas = (remito ?? []).filter((l) => l.insumoId && Number(l.cantidad) > 0);

  const submitRemito = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lineasValidas.length === 0) {
      showToast("error", "Agregá al menos un insumo con cantidad.");
      return;
    }
    setSaving(true);
    try {
      // sinToast: el genérico "Operación realizada" sobra, abajo va uno con el detalle.
      const { aplicados } = await api.post<{ aplicados: number }>("/admin/inventario/entradas", {
        items: lineasValidas.map((l) => ({
          insumoId: l.insumoId,
          cantidad: Number(l.cantidad),
          ...(l.costoUnitario ? { costoUnitario: Number(l.costoUnitario) } : {}),
          ...(l.lote ? { lote: l.lote } : {}),
          ...(l.vencimiento ? { vencimiento: l.vencimiento } : {}),
        })),
        ...(remitoMotivo.trim() ? { motivo: remitoMotivo.trim() } : {}),
      }, { sinToast: true });
      showToast("success", `${aplicados} insumo${aplicados === 1 ? "" : "s"} ingresado${aplicados === 1 ? "" : "s"} ✓`);
      setRemito(null);
      recargar();
    } catch {
      /* toast del api */
    } finally {
      setSaving(false);
    }
  };

  const desde = pagina.total === 0 ? 0 : (pagina.page - 1) * pagina.perPage + 1;
  const hasta = Math.min(pagina.page * pagina.perPage, pagina.total);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-crust-800">Insumos y Stock</h1>
        <button
          onClick={abrirRemito}
          className="rounded-lg bg-dj-terracota px-4 py-2 text-sm font-semibold text-white hover:bg-dj-cobre"
        >
          + Entrada múltiple
        </button>
      </div>

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

      <form onSubmit={crear} className="mb-6 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
        <h3 className="mb-4 font-display text-lg font-semibold text-crust-800">Nuevo insumo</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block sm:col-span-2 lg:col-span-1">
            <span className="mb-1 block text-sm font-medium text-crust-700">Nombre</span>
            <input placeholder="Ej: Harina 000" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2" required />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crust-700">Unidad de medida</span>
            <select value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2">
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <span className="mt-1 block text-xs text-crust-400">Cómo lo medís (kg, litros, unidades…)</span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crust-700">Costo por {form.unidad}</span>
            <input type="number" step="0.01" min="0" value={form.costoUnitario} onChange={(e) => setForm({ ...form, costoUnitario: Number(e.target.value) })} className="w-full rounded-lg border border-crust-200 px-3 py-2" />
            <span className="mt-1 block text-xs text-crust-400">Lo que te cuesta 1 {form.unidad} (para costear recetas)</span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crust-700">Stock inicial</span>
            <input type="number" step="0.01" min="0" value={form.stockActual} onChange={(e) => setForm({ ...form, stockActual: Number(e.target.value) })} className="w-full rounded-lg border border-crust-200 px-3 py-2" />
            <span className="mt-1 block text-xs text-crust-400">Cuánto tenés ahora ({form.unidad}). Podés dejar 0.</span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crust-700">Punto de reorden</span>
            <input type="number" step="0.01" min="0" value={form.puntoReorden} onChange={(e) => setForm({ ...form, puntoReorden: Number(e.target.value) })} className="w-full rounded-lg border border-crust-200 px-3 py-2" />
            <span className="mt-1 block text-xs text-crust-400">Te avisa cuando el stock baje de este valor</span>
          </label>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4">
          <button className="rounded-lg bg-dj-terracota px-5 py-2 font-semibold text-white hover:bg-dj-cobre">Agregar insumo</button>
        </div>
      </form>

      {/* Buscador + tamaño de página */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar insumo por nombre…"
            className="w-full rounded-lg border border-crust-200 py-2 pl-9 pr-9"
            aria-label="Buscar insumo por nombre"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-crust-400">⌕</span>
          {busqueda && (
            <button
              onClick={() => setBusqueda("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-crust-400 hover:bg-crust-100 hover:text-crust-700"
              title="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-crust-600">
          Mostrar
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="rounded-lg border border-crust-200 px-2 py-2"
          >
            {POR_PAGINA.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          por página
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
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
            <tbody className={cargando ? "opacity-50 transition-opacity" : "transition-opacity"}>
              {pagina.items.map((i) => {
                const low = Number(i.stockActual) <= Number(i.puntoReorden);
                return (
                  <tr key={i.id} className="border-t border-crust-50">
                    <td className="px-4 py-3 font-medium text-crust-800">{i.nombre}</td>
                    <td className="px-4 py-3 text-crust-500">{i.unidad}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatUYU(i.costoUnitario)}</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${low ? "text-red-600" : "text-crust-800"}`}>{Number(i.stockActual)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-crust-500">{Number(i.puntoReorden)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-center">
                      <button onClick={() => abrirEntrada(i)} className="mr-2 rounded-lg bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-200">+ Entrada</button>
                      <button onClick={() => abrirAjuste(i)} className="rounded-lg bg-crust-100 px-3 py-1 text-xs font-semibold text-crust-700 hover:bg-crust-200">Ajuste</button>
                    </td>
                  </tr>
                );
              })}
              {pagina.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-crust-400">
                    {cargando
                      ? "Buscando…"
                      : q.trim()
                        ? `Ningún insumo coincide con “${q.trim()}”.`
                        : "No hay insumos cargados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginador */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-crust-100 bg-crust-50 px-4 py-3 text-sm">
          <span className="text-crust-500">
            {pagina.total === 0
              ? "Sin resultados"
              : `${desde}–${hasta} de ${pagina.total} insumo${pagina.total === 1 ? "" : "s"}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={pagina.page <= 1}
              className="rounded-lg px-2.5 py-1.5 text-crust-600 hover:bg-crust-100 disabled:opacity-30"
              title="Primera página"
            >
              «
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagina.page <= 1}
              className="rounded-lg px-3 py-1.5 text-crust-600 hover:bg-crust-100 disabled:opacity-30"
            >
              Anterior
            </button>
            <span className="px-2 tabular-nums text-crust-600">
              {pagina.page} / {pagina.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pagina.totalPages, p + 1))}
              disabled={pagina.page >= pagina.totalPages}
              className="rounded-lg px-3 py-1.5 text-crust-600 hover:bg-crust-100 disabled:opacity-30"
            >
              Siguiente
            </button>
            <button
              onClick={() => setPage(pagina.totalPages)}
              disabled={pagina.page >= pagina.totalPages}
              className="rounded-lg px-2.5 py-1.5 text-crust-600 hover:bg-crust-100 disabled:opacity-30"
              title="Última página"
            >
              »
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Entrada múltiple ---------- */}
      {remito && (
        <Modal
          title="Entrada múltiple"
          subtitle="Cargá de una vez todos los insumos de un remito"
          onClose={() => setRemito(null)}
          ancho="max-w-4xl"
        >
          <form onSubmit={submitRemito} className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-crust-500">
                  <tr>
                    <th className="pb-2 pr-2">Insumo</th>
                    <th className="pb-2 pr-2 w-28">Cantidad</th>
                    <th className="pb-2 pr-2 w-32">Costo unit.</th>
                    <th className="pb-2 pr-2 w-28">Lote</th>
                    <th className="pb-2 pr-2 w-36">Vencimiento</th>
                    <th className="pb-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {remito.map((l) => {
                    const ins = insumoDe(l.insumoId);
                    return (
                      <tr key={l.key} className="align-top">
                        <td className="py-1 pr-2">
                          <select
                            value={l.insumoId}
                            onChange={(e) => setLinea(l.key, { insumoId: e.target.value })}
                            className="w-full rounded-lg border border-crust-200 px-2 py-2"
                          >
                            <option value="">Elegí un insumo…</option>
                            {opciones.map((o) => (
                              <option
                                key={o.id}
                                value={o.id}
                                disabled={o.id !== l.insumoId && yaElegidos.has(o.id)}
                              >
                                {o.nombre}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1 pr-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number" step="0.01" min="0"
                              value={l.cantidad}
                              onChange={(e) => setLinea(l.key, { cantidad: e.target.value })}
                              className="w-full rounded-lg border border-crust-200 px-2 py-2 tabular-nums"
                            />
                            <span className="shrink-0 text-xs text-crust-400">{ins?.unidad ?? ""}</span>
                          </div>
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            type="number" step="0.01" min="0"
                            value={l.costoUnitario}
                            onChange={(e) => setLinea(l.key, { costoUnitario: e.target.value })}
                            placeholder={ins ? Number(ins.costoUnitario).toFixed(2) : "—"}
                            className="w-full rounded-lg border border-crust-200 px-2 py-2 tabular-nums"
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            value={l.lote}
                            onChange={(e) => setLinea(l.key, { lote: e.target.value })}
                            placeholder="opcional"
                            className="w-full rounded-lg border border-crust-200 px-2 py-2"
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            type="date"
                            value={l.vencimiento}
                            onChange={(e) => setLinea(l.key, { vencimiento: e.target.value })}
                            className="w-full rounded-lg border border-crust-200 px-2 py-2"
                          />
                        </td>
                        <td className="py-1">
                          <button
                            type="button"
                            onClick={() => setRemito((prev) => (prev!.length > 1 ? prev!.filter((x) => x.key !== l.key) : prev))}
                            disabled={remito.length === 1}
                            className="rounded-lg px-2 py-2 text-red-500 hover:bg-red-50 disabled:opacity-30"
                            title="Quitar línea"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={() => setRemito((prev) => [...prev!, nuevaLinea()])}
              className="rounded-lg border border-dashed border-crust-300 px-4 py-2 text-sm font-semibold text-crust-600 hover:bg-crust-50"
            >
              + Agregar otra línea
            </button>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">
                Motivo / remito <span className="font-normal text-crust-400">(opcional)</span>
              </span>
              <input
                value={remitoMotivo}
                onChange={(e) => setRemitoMotivo(e.target.value)}
                placeholder="Ej: Remito 4521 — Molino del Este"
                className="w-full rounded-lg border border-crust-200 px-3 py-2"
              />
              <span className="mt-1 block text-xs text-crust-400">
                Queda registrado en el movimiento de cada insumo.
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-crust-50 px-4 py-3">
              <span className="text-sm text-crust-600">
                {lineasValidas.length} insumo{lineasValidas.length === 1 ? "" : "s"} a ingresar
              </span>
              <span className="font-display text-lg font-bold text-crust-800">
                Total: {formatUYU(totalRemito)}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving || lineasValidas.length === 0}
                className="flex-1 rounded-lg bg-dj-terracota py-2.5 font-semibold text-white hover:bg-dj-cobre disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Registrar entradas"}
              </button>
              <button type="button" onClick={() => setRemito(null)} className="rounded-lg border border-crust-200 px-4 py-2 text-crust-700 hover:bg-crust-100">
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal?.type === "entrada" && (
        <Modal
          title="Entrada de stock"
          subtitle={`${modal.insumo.nombre} · se mide en ${modal.insumo.unidad}`}
          onClose={cerrarModal}
        >
          <form onSubmit={submitEntrada} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Cantidad que ingresa ({modal.insumo.unidad})</span>
              <input
                type="number" step="0.01" min="0" autoFocus required
                value={modalForm.cantidad}
                onChange={(e) => setModalForm({ ...modalForm, cantidad: e.target.value })}
                className="w-full rounded-lg border border-crust-200 px-3 py-2"
                placeholder="Ej: 25"
              />
              <span className="mt-1 block text-xs text-crust-400">Se suma al stock actual ({Number(modal.insumo.stockActual)} {modal.insumo.unidad}).</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Costo por {modal.insumo.unidad} <span className="font-normal text-crust-400">(opcional)</span></span>
              <input
                type="number" step="0.01" min="0"
                value={modalForm.costoUnitario}
                onChange={(e) => setModalForm({ ...modalForm, costoUnitario: e.target.value })}
                className="w-full rounded-lg border border-crust-200 px-3 py-2"
                placeholder={`Actual: ${formatUYU(modal.insumo.costoUnitario)}`}
              />
              <span className="mt-1 block text-xs text-crust-400">Actualiza el costo del insumo. Dejalo vacío para mantenerlo.</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Lote <span className="font-normal text-crust-400">(opcional)</span></span>
                <input
                  value={modalForm.lote}
                  onChange={(e) => setModalForm({ ...modalForm, lote: e.target.value })}
                  className="w-full rounded-lg border border-crust-200 px-3 py-2"
                  placeholder="Ej: L-240"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Vencimiento <span className="font-normal text-crust-400">(opcional)</span></span>
                <input
                  type="date"
                  value={modalForm.vencimiento}
                  onChange={(e) => setModalForm({ ...modalForm, vencimiento: e.target.value })}
                  className="w-full rounded-lg border border-crust-200 px-3 py-2"
                />
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-dj-terracota py-2 font-semibold text-white hover:bg-dj-cobre disabled:opacity-60">
                {saving ? "Guardando…" : "Registrar entrada"}
              </button>
              <button type="button" onClick={cerrarModal} className="rounded-lg border border-crust-200 px-4 py-2 text-crust-700 hover:bg-crust-100">Cancelar</button>
            </div>
          </form>
        </Modal>
      )}

      {modal?.type === "ajuste" && (
        <Modal
          title="Ajustar stock"
          subtitle={`${modal.insumo.nombre} · conteo físico`}
          onClose={cerrarModal}
        >
          <form onSubmit={submitAjuste} className="space-y-4">
            <div className="rounded-lg bg-crust-50 px-3 py-2 text-sm text-crust-600">
              Stock en sistema: <b className="text-crust-800">{Number(modal.insumo.stockActual)} {modal.insumo.unidad}</b>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Stock real contado ({modal.insumo.unidad})</span>
              <input
                type="number" step="0.01" min="0" autoFocus required
                value={modalForm.stockReal}
                onChange={(e) => setModalForm({ ...modalForm, stockReal: e.target.value })}
                className="w-full rounded-lg border border-crust-200 px-3 py-2"
              />
              <span className="mt-1 block text-xs text-crust-400">Lo que hay físicamente. El sistema registra la diferencia como merma o sobrante.</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Motivo <span className="font-normal text-crust-400">(opcional)</span></span>
              <input
                value={modalForm.motivo}
                onChange={(e) => setModalForm({ ...modalForm, motivo: e.target.value })}
                className="w-full rounded-lg border border-crust-200 px-3 py-2"
                placeholder="Ej: conteo de inventario, rotura…"
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-dj-terracota py-2 font-semibold text-white hover:bg-dj-cobre disabled:opacity-60">
                {saving ? "Guardando…" : "Aplicar ajuste"}
              </button>
              <button type="button" onClick={cerrarModal} className="rounded-lg border border-crust-200 px-4 py-2 text-crust-700 hover:bg-crust-100">Cancelar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
