import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UnitOfMeasure } from "@donjulio/shared";
import { api } from "../../lib/api";
import { formatUYU } from "../../lib/format";
import { showToast } from "../../lib/toast";
import { useDebounced } from "../../lib/useDebounced";
import Modal from "../../lib/Modal";
import ProductosStock from "./ProductosStock";
import Buscador from "../../lib/Buscador";

interface Insumo {
  id: string;
  nombre: string;
  unidad: string;
  costoUnitario: string;
  stockActual: string;
  puntoReorden: string;
  /** Archivado: ya no se compra, pero su historial sigue. */
  activo?: boolean;
  proveedorId?: string | null;
  proveedor?: { id: string; nombre: string } | null;
}
interface Pagina {
  items: Insumo[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}
/** Una línea del historial de un insumo. */
interface Movimiento {
  id: string;
  tipo: "ENTRADA" | "SALIDA" | "AJUSTE" | "MERMA";
  cantidad: number;
  costoUnitario: number;
  motivo: string | null;
  lote: string | null;
  produccion: string | null;
  usuario: string | null;
  createdAt: string;
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
/** Cómo se nombra y se pinta cada tipo de movimiento de stock. */
const ETIQUETA_MOV: Record<string, string> = {
  ENTRADA: "Entrada", SALIDA: "Salida", AJUSTE: "Ajuste", MERMA: "Merma",
};
/** ¿Este movimiento sumó stock? */
const sumaStock = (m: Movimiento) =>
  m.tipo === "AJUSTE" ? m.cantidad >= 0 : m.tipo === "ENTRADA";
const TONO_MOV: Record<string, string> = {
  ENTRADA: "bg-green-100 text-green-700",
  SALIDA: "bg-crust-100 text-crust-600",
  AJUSTE: "bg-amber-100 text-amber-800",
  MERMA: "bg-red-100 text-red-700",
};
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
  const [form, setForm] = useState({ nombre: "", unidad: "KG", costoUnitario: 0, stockActual: 0, puntoReorden: 0, proveedorId: "" });
  const [proveedores, setProveedores] = useState<{ id: string; nombre: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Búsqueda y paginación
  const [busqueda, setBusqueda] = useState("");
  const q = useDebounced(busqueda, 300);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(POR_PAGINA[0]);

  // Ver también los archivados, para revisarlos o reactivarlos.
  const [verArchivados, setVerArchivados] = useState(false);
  // Historial de movimientos del insumo que se está mirando.
  const [historial, setHistorial] = useState<{ insumo: Insumo; movs: Movimiento[] | null } | null>(null);

  // Insumo que se está editando, con su formulario.
  const [editando, setEditando] = useState<Insumo | null>(null);
  const [editForm, setEditForm] = useState({ nombre: "", unidad: "", costoUnitario: "", puntoReorden: "", proveedorId: "" });

  // Insumos (lo que se compra para producir) o productos terminados.
  const [vista, setVista] = useState<"insumos" | "productos">("insumos");

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
    if (verArchivados) params.set("incluirArchivados", "true");
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
  }, [q, page, perPage, verArchivados]);

  const cargarAlertas = useCallback(() => {
    api.get<Insumo[]>("/admin/inventario/alertas/reorden").then(setReorden).catch(() => {});
    api.get<Lote[]>("/admin/inventario/alertas/vencimiento?dias=14").then(setVencimientos).catch(() => {});
  }, []);

  // Para el selector de proveedor. Sin permiso no viene y el selector queda
  // vacío sin romper nada.
  useEffect(() => {
    api
      .get<{ id: string; nombre: string }[]>("/admin/proveedores")
      .then(setProveedores)
      .catch(() => {});
  }, []);

  useEffect(cargarLista, [cargarLista]);
  useEffect(cargarAlertas, [cargarAlertas]);

  // Al cambiar la búsqueda o el tamaño de página, volver a la primera.
  useEffect(() => setPage(1), [q, perPage, verArchivados]);

  const verHistorial = async (i: Insumo) => {
    setHistorial({ insumo: i, movs: null });
    try {
      const movs = await api.get<Movimiento[]>(`/admin/inventario/insumos/${i.id}/movimientos`);
      setHistorial({ insumo: i, movs });
    } catch {
      setHistorial({ insumo: i, movs: [] });
    }
  };

  const abrirEdicion = (i: Insumo) => {
    setError(null);
    setEditForm({
      nombre: i.nombre,
      unidad: i.unidad,
      costoUnitario: String(Number(i.costoUnitario)),
      puntoReorden: String(Number(i.puntoReorden)),
      proveedorId: i.proveedorId ?? "",
    });
    setEditando(i);
  };

  const guardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setError(null);
    try {
      await api.patch(`/admin/inventario/insumos/${editando.id}`, {
        nombre: editForm.nombre.trim(),
        unidad: editForm.unidad,
        costoUnitario: Number(editForm.costoUnitario),
        puntoReorden: Number(editForm.puntoReorden),
        // Cadena vacía = sin proveedor: hay que mandar null, no "".
        proveedorId: editForm.proveedorId || null,
      });
      setEditando(null);
      recargar();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  /** Lo saca de la lista sin tocar su historial (o lo vuelve a traer). */
  const archivar = async (i: Insumo, activo: boolean) => {
    setError(null);
    try {
      await api.patch(`/admin/inventario/insumos/${i.id}/archivar`, { activo });
      recargar();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  /** Borra de verdad. La API lo impide si el insumo ya dejó rastro. */
  const eliminar = async (i: Insumo) => {
    if (!confirm(`¿Borrar “${i.nombre}”? Si ya tiene movimientos no se va a poder.`)) return;
    setError(null);
    try {
      await api.del(`/admin/inventario/insumos/${i.id}`);
      recargar();
    } catch (err) {
      setError((err as Error).message);
    }
  };

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
        proveedorId: form.proveedorId || null,
        costoUnitario: Number(form.costoUnitario),
        stockActual: Number(form.stockActual),
        puntoReorden: Number(form.puntoReorden),
      });
      // Se conserva el proveedor: cuando se carga un remito van varios
      // insumos seguidos del mismo, y volver a elegirlo cada vez molesta.
      setForm((f) => ({ nombre: "", unidad: "KG", costoUnitario: 0, stockActual: 0, puntoReorden: 0, proveedorId: f.proveedorId }));
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-crust-800">Stock</h1>
        {vista === "insumos" && (
          <button
            onClick={abrirRemito}
            className="rounded-lg bg-dj-terracota px-4 py-2 text-sm font-semibold text-white hover:bg-dj-cobre"
          >
            + Entrada múltiple
          </button>
        )}
      </div>

      {/* Dos cosas distintas que viven en la misma pantalla: lo que se compra
          para producir, y lo que se vende. */}
      <div className="mb-6 flex gap-1 border-b border-crust-100">
        {([
          ["insumos", "Insumos", "Lo que se compra para producir"],
          ["productos", "Productos", "Lo que se vende"],
        ] as const).map(([clave, label, ayuda]) => (
          <button
            key={clave}
            onClick={() => setVista(clave)}
            title={ayuda}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              vista === clave
                ? "border-dj-terracota text-dj-terracota"
                : "border-transparent text-crust-500 hover:text-crust-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {vista === "productos" && <ProductosStock />}

      {vista === "insumos" && (
       <>

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crust-700">Proveedor</span>
            <select value={form.proveedorId} onChange={(e) => setForm({ ...form, proveedorId: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2">
              <option value="">— Sin proveedor —</option>
              {proveedores.map((pv) => <option key={pv.id} value={pv.id}>{pv.nombre}</option>)}
            </select>
            <span className="mt-1 block text-xs text-crust-400">A quién se lo comprás. Se gestionan en <b>Proveedores</b>.</span>
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
          <input
            type="checkbox"
            checked={verArchivados}
            onChange={(e) => setVerArchivados(e.target.checked)}
            className="h-4 w-4 rounded border-crust-300"
          />
          Ver archivados
        </label>
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

      <div className="tabla-marco overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="tabla-cards w-full text-sm">
            <thead className="bg-crust-50 text-left text-crust-600">
              <tr>
                <th className="px-4 py-3">Insumo</th>
                <th className="px-4 py-3">Unidad</th>
                <th className="px-4 py-3">Proveedor</th>
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
                    <td data-principal className="px-4 py-3 font-medium text-crust-800">
                      {i.nombre}
                      {i.activo === false && (
                        <span className="ml-2 rounded-full bg-crust-100 px-2 py-0.5 text-[11px] font-medium text-crust-500">
                          archivado
                        </span>
                      )}
                    </td>
                    <td data-etiqueta="Unidad" className="px-4 py-3 text-crust-500">{i.unidad}</td>
                    <td data-etiqueta="Proveedor" className="px-4 py-3 text-crust-500">
                      {i.proveedor?.nombre ?? <span className="text-crust-300">—</span>}
                    </td>
                    <td data-etiqueta="Costo" className="px-4 py-3 text-right tabular-nums">{formatUYU(i.costoUnitario)}</td>
                    <td data-etiqueta="Stock" className={`px-4 py-3 text-right font-semibold tabular-nums ${low ? "text-red-600" : "text-crust-800"}`}>{Number(i.stockActual)}</td>
                    <td data-etiqueta="Reorden" className="px-4 py-3 text-right tabular-nums text-crust-500">{Number(i.puntoReorden)}</td>
                    <td data-acciones className="whitespace-nowrap px-4 py-3 text-center">
                      <button onClick={() => abrirEntrada(i)} className="mr-2 rounded-lg bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-200">+ Entrada</button>
                      <button onClick={() => abrirAjuste(i)} className="mr-2 rounded-lg bg-crust-100 px-3 py-1 text-xs font-semibold text-crust-700 hover:bg-crust-200">Ajuste</button>
                      <button onClick={() => verHistorial(i)} className="mr-2 rounded-lg border border-crust-200 px-3 py-1 text-xs font-medium text-crust-700 hover:bg-crust-100" title="Qué entró y qué salió">Movimientos</button>
                      <button onClick={() => abrirEdicion(i)} className="mr-2 rounded-lg border border-crust-200 px-3 py-1 text-xs font-medium text-crust-700 hover:bg-crust-100">Editar</button>
                      {i.activo === false ? (
                        <button onClick={() => archivar(i, true)} className="rounded-lg border border-green-300 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-50">Reactivar</button>
                      ) : (
                        <>
                          <button onClick={() => archivar(i, false)} className="mr-2 rounded-lg border border-crust-200 px-3 py-1 text-xs font-medium text-crust-500 hover:bg-crust-100" title="Lo saca de la lista sin borrar su historial">Archivar</button>
                          <button onClick={() => eliminar(i)} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50" title="Sólo si todavía no tiene movimientos">Borrar</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pagina.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-crust-400">
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

       </>
      )}

      {/* ---------- Historial de un insumo ---------- */}
      {historial && (
        <Modal
          title="Movimientos"
          subtitle={`${historial.insumo.nombre} · stock actual ${Number(historial.insumo.stockActual)} ${historial.insumo.unidad}`}
          onClose={() => setHistorial(null)}
          ancho="max-w-2xl"
        >
          {historial.movs === null ? (
            <p className="py-6 text-center text-sm text-crust-400">Cargando…</p>
          ) : historial.movs.length === 0 ? (
            <p className="py-6 text-center text-sm text-crust-500">
              Todavía no tiene movimientos. Las entradas, los ajustes y lo que consume la
              producción van a aparecer acá.
            </p>
          ) : (
            <ul className="divide-y divide-crust-50 text-sm">
              {historial.movs.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                  <div className="min-w-0">
                    <span className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONO_MOV[m.tipo]}`}>
                      {ETIQUETA_MOV[m.tipo]}
                    </span>
                    <span className="text-crust-700">
                      {m.produccion
                        ? `Producción de ${m.produccion}`
                        : m.motivo || (m.lote ? `Lote ${m.lote}` : "—")}
                    </span>
                    {m.lote && m.motivo && (
                      <span className="text-crust-400"> · lote {m.lote}</span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-3 tabular-nums">
                    {/* Entrada suma y salida/merma restan, lo diga o no el
                        signo guardado. En un ajuste el signo es el dato: es
                        lo único que distingue un conteo que encontró
                        mercadería de uno que descubrió que faltaba. */}
                    <span className={`font-semibold ${sumaStock(m) ? "text-green-700" : "text-crust-700"}`}>
                      {sumaStock(m) ? "+" : "−"}
                      {Math.abs(m.cantidad)} {historial.insumo.unidad}
                    </span>
                    <span className="text-xs text-crust-400">
                      {new Date(m.createdAt).toLocaleString("es-UY", {
                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                      })}
                      {m.usuario ? ` · ${m.usuario}` : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {/* ---------- Editar un insumo ---------- */}
      {editando && (
        <Modal
          title="Editar insumo"
          subtitle="Corregí lo que esté mal cargado. No cambia el stock."
          onClose={() => setEditando(null)}
        >
          <form onSubmit={guardarEdicion} className="grid gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Nombre</span>
              <input
                value={editForm.nombre}
                onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                className="w-full rounded-lg border border-crust-200 px-3 py-2"
                required
                autoFocus
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Unidad</span>
                <select
                  value={editForm.unidad}
                  onChange={(e) => setEditForm({ ...editForm, unidad: e.target.value })}
                  className="w-full rounded-lg border border-crust-200 px-3 py-2"
                >
                  {UNIDADES.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-crust-400">
                  El stock cargado no se convierte: si cambiás de kg a g, revisalo con un ajuste.
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Costo por unidad</span>
                <input
                  type="number" step="0.0001" min="0"
                  value={editForm.costoUnitario}
                  onChange={(e) => setEditForm({ ...editForm, costoUnitario: e.target.value })}
                  className="w-full rounded-lg border border-crust-200 px-3 py-2"
                  required
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Punto de reorden</span>
              <input
                type="number" step="0.001" min="0"
                value={editForm.puntoReorden}
                onChange={(e) => setEditForm({ ...editForm, puntoReorden: e.target.value })}
                className="w-full rounded-lg border border-crust-200 px-3 py-2"
                required
              />
              <span className="mt-1 block text-xs text-crust-400">
                Cuando el stock baje de acá, aparece en el aviso de reposición.
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Proveedor</span>
              <select
                value={editForm.proveedorId}
                onChange={(e) => setEditForm({ ...editForm, proveedorId: e.target.value })}
                className="w-full rounded-lg border border-crust-200 px-3 py-2"
              >
                <option value="">— Sin proveedor —</option>
                {proveedores.map((pv) => (
                  <option key={pv.id} value={pv.id}>{pv.nombre}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-crust-400">
                A quién se lo comprás. Aparece en su ficha, en <b>Proveedores</b>.
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditando(null)} className="rounded-lg border border-crust-200 px-4 py-2 text-sm font-medium text-crust-700 hover:bg-crust-100">
                Cancelar
              </button>
              <button type="submit" className="rounded-lg bg-dj-terracota px-4 py-2 text-sm font-semibold text-white hover:bg-dj-cobre">
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------- Entrada múltiple ---------- */}
      {remito && (
        <Modal
          title="Entrada múltiple"
          subtitle="Cargá de una vez todos los insumos de un remito"
          onClose={() => setRemito(null)}
          ancho="max-w-4xl"
        >
          <form onSubmit={submitRemito} className="space-y-4">
            <div className="overflow-x-auto sm:overflow-x-auto">
              <table className="tabla-cards w-full text-sm sm:min-w-[720px]">
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
                        <td data-principal className="py-1 pr-2">
                          <Buscador
                            opciones={opciones.map((o) => ({
                              id: o.id,
                              nombre: o.nombre,
                              detalle: `${Number(o.stockActual)} ${o.unidad}`,
                              bloqueado: yaElegidos.has(o.id),
                              motivo: "ya está en el remito",
                            }))}
                            valorId={l.insumoId}
                            onSelect={(id) => setLinea(l.key, { insumoId: id })}
                            placeholder="Buscar insumo…"
                            sinResultados="Ningún insumo coincide."
                          />
                        </td>
                        <td data-etiqueta="Cantidad" className="py-1 pr-2">
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
                        <td data-etiqueta="Costo unit." className="py-1 pr-2">
                          <input
                            type="number" step="0.01" min="0"
                            value={l.costoUnitario}
                            onChange={(e) => setLinea(l.key, { costoUnitario: e.target.value })}
                            placeholder={ins ? Number(ins.costoUnitario).toFixed(2) : "—"}
                            className="w-full rounded-lg border border-crust-200 px-2 py-2 tabular-nums"
                          />
                        </td>
                        <td data-etiqueta="Lote" className="py-1 pr-2">
                          <input
                            value={l.lote}
                            onChange={(e) => setLinea(l.key, { lote: e.target.value })}
                            placeholder="opcional"
                            className="w-full rounded-lg border border-crust-200 px-2 py-2"
                          />
                        </td>
                        <td data-etiqueta="Vencimiento" className="py-1 pr-2">
                          <input
                            type="date"
                            value={l.vencimiento}
                            onChange={(e) => setLinea(l.key, { vencimiento: e.target.value })}
                            className="w-full rounded-lg border border-crust-200 px-2 py-2"
                          />
                        </td>
                        <td data-acciones className="py-1">
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
