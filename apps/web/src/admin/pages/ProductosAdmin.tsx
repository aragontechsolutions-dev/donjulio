import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calcularOctogonos,
  FOOD_COST_OBJETIVO,
  IvaRate,
  puede,
  semaforoFoodCost,
  sugerirIva,
  umbralesPara,
  type ProductoCosteo,
  type SemaforoFoodCost,
} from "@donjulio/shared";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { showToast } from "../../lib/toast";
import { formatUYU } from "../../lib/format";
import { coincide } from "../../lib/texto";
import Modal from "../../lib/Modal";
import Octogonos from "../../lib/Octogonos";

const MAX_IMAGE_MB = 5;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

interface Categoria {
  id: string;
  nombre: string;
  slug: string;
  orden: number;
  activa: boolean;
}

interface Producto {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: string;
  imagenUrl: string | null;
  disponible: boolean;
  destacado: boolean;
  requiereOctogono: boolean;
  esReventa: boolean;
  costoCompra: string | null;
  controlaStock: boolean;
  /** Unidades producidas sin vender. null si el producto no controla stock. */
  stockProducido: number | null;
  ivaRate: string;
  categoriaId: string;
  categoria?: { nombre: string };
  receta?: { id: string; nombre: string } | null;
}

/** Ficha de rotulado; los numéricos se manejan como texto en el formulario. */
interface RotuladoForm {
  porcion: string;
  ingredientes: string;
  alergenos: string;
  esLiquido: boolean;
  energiaKcal: string;
  proteinas: string;
  carbohidratos: string;
  azucares: string;
  grasasTotales: string;
  grasasSaturadas: string;
  grasasTrans: string;
  fibra: string;
  sodioMg: string;
  autoOctogonos: boolean;
  excesoAzucares: boolean;
  excesoSodio: boolean;
  excesoGrasas: boolean;
  excesoGrasasSat: boolean;
  contieneEdulcorantes: boolean;
  contieneCafeina: boolean;
}

const ROTULADO_VACIO: RotuladoForm = {
  porcion: "", ingredientes: "", alergenos: "", esLiquido: false,
  energiaKcal: "", proteinas: "", carbohidratos: "", azucares: "",
  grasasTotales: "", grasasSaturadas: "", grasasTrans: "", fibra: "", sodioMg: "",
  autoOctogonos: true, excesoAzucares: false, excesoSodio: false,
  excesoGrasas: false, excesoGrasasSat: false,
  contieneEdulcorantes: false, contieneCafeina: false,
};
const nOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

/** Datos del formulario de alta/edición. */
interface ProductoForm {
  nombre: string;
  categoriaId: string;
  descripcion: string;
  precio: string;
  esReventa: boolean;
  costoCompra: string;
  controlaStock: boolean;
  ivaRate: string;
  disponible: boolean;
  destacado: boolean;
}

const FORM_VACIO: ProductoForm = {
  nombre: "", categoriaId: "", descripcion: "", precio: "",
  esReventa: false, costoCompra: "", controlaStock: false, ivaRate: IvaRate.MINIMA,
  disponible: true, destacado: false,
};

const IVA_LABEL: Record<string, string> = {
  [IvaRate.EXENTO]: "Exento",
  [IvaRate.MINIMA]: "Mínima (10 %)",
  [IvaRate.BASICA]: "Básica (22 %)",
};

/** Colores del semáforo de food cost. */
const SEMAFORO: Record<SemaforoFoodCost, { cls: string; ayuda: string }> = {
  SIN_DATO: { cls: "bg-crust-100 text-crust-400", ayuda: "Sin costo cargado" },
  BAJO: { cls: "bg-sky-100 text-sky-700", ayuda: `Por debajo del ${FOOD_COST_OBJETIVO.min} %: revisá que el costo esté completo` },
  OBJETIVO: { cls: "bg-green-100 text-green-700", ayuda: `Dentro del objetivo (${FOOD_COST_OBJETIVO.min}–${FOOD_COST_OBJETIVO.max} %)` },
  ALTO: { cls: "bg-amber-100 text-amber-800", ayuda: `Por encima del ${FOOD_COST_OBJETIVO.max} %: deja poco margen` },
  CRITICO: { cls: "bg-red-100 text-red-700", ayuda: "Más del 45 %: revisá precio o receta" },
};

export default function ProductosAdmin() {
  const { user } = useAuth();
  // Producción carga la ficha y el rótulo, pero no da de baja un producto ni
  // reorganiza las categorías de la carta: eso es del admin.
  const puedeBorrar = puede(user?.role, "productos.eliminar");
  const puedeCategorias =
    puede(user?.role, "categorias.crear") &&
    puede(user?.role, "categorias.editar") &&
    puede(user?.role, "categorias.eliminar");

  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [costeo, setCosteo] = useState<Record<string, ProductoCosteo>>({});
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [catFiltro, setCatFiltro] = useState("");

  // Alta / edición de producto
  const [editando, setEditando] = useState<Producto | "nuevo" | null>(null);
  // Al cargar un producto nuevo se propone la tasa por el nombre, para no
  // tener que acordarse de cuál va. Ver docs/iva.md.
  const [ivaTocado, setIvaTocado] = useState(false);
  const [form, setForm] = useState<ProductoForm>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  // Revisión de IVA de todo el catálogo
  const [revisandoIva, setRevisandoIva] = useState(false);
  const [aAplicar, setAAplicar] = useState<Set<string>>(new Set());
  const [aplicandoIva, setAplicandoIva] = useState(false);

  // Categorías
  const [gestionCat, setGestionCat] = useState(false);
  const [catNueva, setCatNueva] = useState("");

  // Rotulado
  const [rotDe, setRotDe] = useState<Producto | null>(null);
  const [rot, setRot] = useState<RotuladoForm>(ROTULADO_VACIO);
  const [savingRot, setSavingRot] = useState(false);

  const load = useCallback(async () => {
    setCargando(true);
    try {
      const [ps, cs] = await Promise.all([
        api.get<Producto[]>("/admin/productos"),
        api.get<Categoria[]>("/admin/categorias"),
      ]);
      setProductos(ps);
      setCategorias(cs);
      // El costeo recorre las recetas: se pide aparte para no demorar la tabla.
      api
        .get<ProductoCosteo[]>("/admin/productos/costeo")
        .then((cc) => setCosteo(Object.fromEntries(cc.map((c) => [c.productoId, c]))))
        .catch(() => {});
    } catch {
      /* toast del api */
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibles = useMemo(
    () =>
      productos.filter(
        (p) =>
          (!catFiltro || p.categoriaId === catFiltro) &&
          (!busqueda.trim() || coincide(p.nombre, busqueda)),
      ),
    [productos, busqueda, catFiltro],
  );

  const toggle = async (p: Producto, field: "disponible" | "destacado") => {
    // Optimista: el toggle tiene que sentirse inmediato.
    setProductos((prev) => prev.map((x) => (x.id === p.id ? { ...x, [field]: !x[field] } : x)));
    try {
      await api.patch(`/admin/productos/${p.id}`, { [field]: !p[field] }, { sinToast: true });
    } catch {
      load();
    }
  };

  // ---------- Alta / edición ----------
  const abrirNuevo = () => {
    if (categorias.length === 0) {
      showToast("error", "Creá primero una categoría.");
      setGestionCat(true);
      return;
    }
    setForm({ ...FORM_VACIO, categoriaId: categorias[0].id });
    setIvaTocado(false);
    setEditando("nuevo");
  };

  const abrirEdicion = (p: Producto) => {
    setForm({
      nombre: p.nombre,
      categoriaId: p.categoriaId,
      descripcion: p.descripcion ?? "",
      precio: String(Number(p.precio)),
      esReventa: p.esReventa,
      costoCompra: p.costoCompra != null ? String(Number(p.costoCompra)) : "",
      controlaStock: p.controlaStock,
      ivaRate: p.ivaRate,
      disponible: p.disponible,
      destacado: p.destacado,
    });
    setIvaTocado(true); // editando, la tasa guardada manda
    setEditando(p);
  };

  /**
   * Compara lo cargado en cada producto contra lo que sugiere la norma.
   * Se ordena poniendo primero lo que difiere, que es lo que hay que mirar.
   */
  const revisionIva = useMemo(() => {
    const filas = productos.map((p) => {
      const sug = sugerirIva(p.nombre);
      return {
        producto: p,
        sugerida: sug.tasa as string,
        motivo: sug.motivo,
        dudoso: !sug.reconocido,
        difiere: sug.tasa !== p.ivaRate,
      };
    });
    const peso = (f: (typeof filas)[number]) => (f.difiere ? 0 : f.dudoso ? 1 : 2);
    return filas.sort((a, b) => peso(a) - peso(b) || a.producto.nombre.localeCompare(b.producto.nombre));
  }, [productos]);

  const difieren = revisionIva.filter((f) => f.difiere);

  const abrirRevisionIva = () => {
    // Vienen marcadas las que difieren: es lo que uno quiere aplicar.
    setAAplicar(new Set(difieren.map((f) => f.producto.id)));
    setRevisandoIva(true);
  };

  const aplicarIva = async () => {
    const cambios = revisionIva
      .filter((f) => aAplicar.has(f.producto.id) && f.sugerida !== f.producto.ivaRate)
      .map((f) => ({ id: f.producto.id, ivaRate: f.sugerida }));
    if (cambios.length === 0) {
      showToast("info", "No hay cambios marcados.");
      return;
    }
    setAplicandoIva(true);
    try {
      await api.patch("/admin/productos/iva-masivo", { productos: cambios }, { sinToast: true });
      showToast("success", `IVA actualizado en ${cambios.length} producto${cambios.length === 1 ? "" : "s"} ✓`);
      setRevisandoIva(false);
      await load();
    } catch {
      /* toast del api */
    } finally {
      setAplicandoIva(false);
    }
  };

  /** Sugerencia de IVA para el nombre actual (sólo informativa). */
  const sugerencia = useMemo(
    () => (form.nombre.trim() ? sugerirIva(form.nombre) : null),
    [form.nombre],
  );

  const guardarProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      showToast("error", "Poné un nombre al producto.");
      return;
    }
    const precio = Number(form.precio);
    if (!Number.isFinite(precio) || precio < 0) {
      showToast("error", "El precio de venta no es válido.");
      return;
    }
    setGuardando(true);
    const payload = {
      nombre: form.nombre.trim(),
      categoriaId: form.categoriaId,
      descripcion: form.descripcion.trim() || null,
      precio,
      esReventa: form.esReventa,
      costoCompra: form.esReventa && form.costoCompra !== "" ? Number(form.costoCompra) : null,
      controlaStock: form.controlaStock,
      ivaRate: form.ivaRate,
      disponible: form.disponible,
      destacado: form.destacado,
    };
    try {
      if (editando === "nuevo") {
        await api.post("/admin/productos", payload, { sinToast: true });
        showToast("success", `“${payload.nombre}” creado ✓`);
      } else if (editando) {
        await api.patch(`/admin/productos/${editando.id}`, payload, { sinToast: true });
        showToast("success", "Producto actualizado ✓");
      }
      setEditando(null);
      load();
    } catch {
      /* toast del api */
    } finally {
      setGuardando(false);
    }
  };

  const borrarProducto = async (p: Producto) => {
    if (!confirm(`¿Eliminar “${p.nombre}”? Esto no se puede deshacer.`)) return;
    try {
      await api.del(`/admin/productos/${p.id}`);
      load();
    } catch {
      /* toast del api: explica si ya tiene ventas */
    }
  };

  // ---------- Categorías ----------
  const crearCategoria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNueva.trim()) return;
    try {
      await api.post("/admin/categorias", { nombre: catNueva.trim() }, { sinToast: true });
      showToast("success", `Categoría “${catNueva.trim()}” creada ✓`);
      setCatNueva("");
      load();
    } catch {
      /* toast del api */
    }
  };

  const toggleCategoria = async (c: Categoria) => {
    setCategorias((prev) => prev.map((x) => (x.id === c.id ? { ...x, activa: !x.activa } : x)));
    await api.patch(`/admin/categorias/${c.id}`, { activa: !c.activa }, { sinToast: true }).catch(load);
  };

  const borrarCategoria = async (c: Categoria) => {
    if (!confirm(`¿Eliminar la categoría “${c.nombre}”?`)) return;
    try {
      await api.del(`/admin/categorias/${c.id}`);
      load();
    } catch {
      /* toast del api: avisa si tiene productos */
    }
  };

  // ---------- Rotulado frontal ----------
  const abrirRotulado = async (p: Producto) => {
    setRotDe(p);
    setRot(ROTULADO_VACIO);
    try {
      const r = await api.get<Record<string, unknown> | null>(`/admin/productos/${p.id}/rotulado`);
      if (r) {
        const str = (k: string) => (r[k] == null ? "" : String(r[k]));
        setRot({
          porcion: str("porcion"), ingredientes: str("ingredientes"), alergenos: str("alergenos"),
          esLiquido: !!r.esLiquido,
          energiaKcal: str("energiaKcal"), proteinas: str("proteinas"), carbohidratos: str("carbohidratos"),
          azucares: str("azucares"), grasasTotales: str("grasasTotales"), grasasSaturadas: str("grasasSaturadas"),
          grasasTrans: str("grasasTrans"), fibra: str("fibra"), sodioMg: str("sodioMg"),
          autoOctogonos: r.autoOctogonos !== false,
          excesoAzucares: !!r.excesoAzucares, excesoSodio: !!r.excesoSodio,
          excesoGrasas: !!r.excesoGrasas, excesoGrasasSat: !!r.excesoGrasasSat,
          contieneEdulcorantes: !!r.contieneEdulcorantes, contieneCafeina: !!r.contieneCafeina,
        });
      }
    } catch { /* sin rotulado aún */ }
  };

  const guardarRotulado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rotDe) return;
    setSavingRot(true);
    try {
      await api.put(`/admin/productos/${rotDe.id}/rotulado`, {
        porcion: rot.porcion || null,
        ingredientes: rot.ingredientes || null,
        alergenos: rot.alergenos || null,
        esLiquido: rot.esLiquido,
        energiaKcal: nOrNull(rot.energiaKcal), proteinas: nOrNull(rot.proteinas),
        carbohidratos: nOrNull(rot.carbohidratos), azucares: nOrNull(rot.azucares),
        grasasTotales: nOrNull(rot.grasasTotales), grasasSaturadas: nOrNull(rot.grasasSaturadas),
        grasasTrans: nOrNull(rot.grasasTrans), fibra: nOrNull(rot.fibra), sodioMg: nOrNull(rot.sodioMg),
        autoOctogonos: rot.autoOctogonos,
        excesoAzucares: rot.excesoAzucares, excesoSodio: rot.excesoSodio,
        excesoGrasas: rot.excesoGrasas, excesoGrasasSat: rot.excesoGrasasSat,
        contieneEdulcorantes: rot.contieneEdulcorantes, contieneCafeina: rot.contieneCafeina,
      });
      setRotDe(null);
      load();
    } catch { /* toast del api */ } finally { setSavingRot(false); }
  };

  // Vista previa de sellos: automáticos o los marcados a mano.
  const sellosPreview = rot.autoOctogonos
    ? calcularOctogonos(
        {
          azucares: nOrNull(rot.azucares), sodioMg: nOrNull(rot.sodioMg),
          grasasTotales: nOrNull(rot.grasasTotales), grasasSaturadas: nOrNull(rot.grasasSaturadas),
        },
        rot.esLiquido,
      )
    : {
        excesoAzucares: rot.excesoAzucares, excesoSodio: rot.excesoSodio,
        excesoGrasas: rot.excesoGrasas, excesoGrasasSat: rot.excesoGrasasSat,
      };
  const umbrales = umbralesPara(rot.esLiquido);
  const unidad = rot.esLiquido ? "100 ml" : "100 g";

  const subirImagen = async (p: Producto, file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showToast("error", "Formato no permitido. Usá JPG, PNG, WEBP o GIF.");
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      showToast("error", `La imagen supera el máximo de ${MAX_IMAGE_MB} MB.`);
      return;
    }
    try {
      const { url } = await api.upload<{ url: string }>("/admin/storage/upload", file);
      await api.patch(`/admin/productos/${p.id}`, { imagenUrl: url }, { sinToast: true });
      await load();
    } catch {
      /* el toast de error ya lo disparó api.upload */
    }
  };

  // Margen que resultaría con lo cargado en el formulario, en vivo.
  const previaForm = (() => {
    const precio = Number(form.precio) || 0;
    const costo = form.esReventa ? Number(form.costoCompra) || 0 : null;
    if (!precio || costo == null || costo <= 0) return null;
    const pct = (costo / precio) * 100;
    return { pct, margen: precio - costo, sem: semaforoFoodCost(pct) };
  })();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-crust-800">Productos</h1>
        <div className="flex flex-wrap gap-2">
          {productos.length > 0 && (
            <button
              onClick={abrirRevisionIva}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                difieren.length > 0
                  ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  : "border-crust-200 text-crust-700 hover:bg-crust-100"
              }`}
              title="Compara el IVA cargado contra lo que dice la norma"
            >
              Revisar IVA
              {difieren.length > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-xs text-white">
                  {difieren.length}
                </span>
              )}
            </button>
          )}
          {puedeCategorias && (
          <button
            onClick={() => setGestionCat(true)}
            className="rounded-lg border border-crust-200 px-4 py-2 text-sm font-semibold text-crust-700 hover:bg-crust-100"
          >
            Categorías
          </button>
          )}
          <button
            onClick={abrirNuevo}
            className="rounded-lg bg-dj-terracota px-4 py-2 text-sm font-semibold text-white hover:bg-dj-cobre"
          >
            + Nuevo producto
          </button>
        </div>
      </div>

      {/* Filtros */}
      {productos.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto por nombre…"
              className="w-full rounded-lg border border-crust-200 py-2 pl-9 pr-9"
              aria-label="Buscar producto por nombre"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-crust-400">⌕</span>
            {busqueda && (
              <button
                onClick={() => setBusqueda("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-crust-400 hover:bg-crust-100"
                title="Limpiar"
              >
                ✕
              </button>
            )}
          </div>
          <select
            value={catFiltro}
            onChange={(e) => setCatFiltro(e.target.value)}
            className="rounded-lg border border-crust-200 px-3 py-2 text-sm"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <span className="text-sm text-crust-500">
            {visibles.length} de {productos.length}
          </span>
        </div>
      )}

      <div className="tabla-marco overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="tabla-cards w-full text-sm">
            <thead className="bg-crust-50 text-left text-crust-600">
              <tr>
                <th className="px-4 py-3">Img</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3 text-right">Costo</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-center" title={`Costo sobre precio. Objetivo ${FOOD_COST_OBJETIVO.min}–${FOOD_COST_OBJETIVO.max} %`}>
                  Food cost
                </th>
                <th className="px-4 py-3 text-right">Margen</th>
                <th className="px-4 py-3 text-right" title="Unidades producidas sin vender">Stock</th>
                <th className="px-4 py-3 text-center">Disp.</th>
                <th className="px-4 py-3 text-center">Dest.</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => {
                const c = costeo[p.id];
                const sem = semaforoFoodCost(c?.foodCostPct);
                return (
                  <tr key={p.id} className="border-t border-crust-50">
                    <td data-etiqueta="Imagen" className="px-4 py-3">
                      <label className="flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-crust-100 text-crust-400" title="Cambiar imagen">
                        {p.imagenUrl ? (
                          <img src={p.imagenUrl} alt={p.nombre} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-lg">📷</span>
                        )}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) subirImagen(p, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </td>
                    <td data-principal className="px-4 py-3">
                      <span className="font-medium text-crust-800">{p.nombre}</span>
                      <span className="mt-0.5 block text-xs text-crust-400">
                        {p.esReventa
                          ? "Reventa"
                          : p.receta
                            ? `Receta: ${p.receta.nombre}`
                            : "Elaborado · sin receta"}
                      </span>
                    </td>
                    <td data-etiqueta="Categoría" className="px-4 py-3 text-crust-500">{p.categoria?.nombre ?? "—"}</td>
                    <td data-etiqueta="Costo" className="px-4 py-3 text-right tabular-nums text-crust-600">
                      {c?.costoUnitario != null ? formatUYU(c.costoUnitario) : "—"}
                    </td>
                    <td data-etiqueta="Precio" className="px-4 py-3 text-right font-semibold tabular-nums">{formatUYU(p.precio)}</td>
                    <td data-etiqueta="Food cost" className="px-4 py-3 text-center">
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${SEMAFORO[sem].cls}`}
                        title={SEMAFORO[sem].ayuda}
                      >
                        {c?.foodCostPct != null ? `${c.foodCostPct.toFixed(1)} %` : "—"}
                      </span>
                    </td>
                    <td data-etiqueta="Margen" data-oculto-movil className="px-4 py-3 text-right tabular-nums text-crust-600">
                      {c?.margen != null ? formatUYU(c.margen) : "—"}
                    </td>
                    <td data-etiqueta="Stock" className="px-4 py-3 text-right tabular-nums">
                      {p.stockProducido == null ? (
                        <span className="text-crust-300" title="Se prepara al momento">—</span>
                      ) : (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            p.stockProducido > 0
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                          title={p.stockProducido > 0 ? "Producido sin vender" : "Sin stock: no se puede vender"}
                        >
                          {p.stockProducido}
                        </span>
                      )}
                    </td>
                    <td data-etiqueta="Disponible" className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggle(p, "disponible")}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          p.disponible ? "bg-green-100 text-green-700" : "bg-crust-100 text-crust-500"
                        }`}
                      >
                        {p.disponible ? "Sí" : "No"}
                      </button>
                    </td>
                    <td data-etiqueta="Destacado" className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggle(p, "destacado")}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          p.destacado ? "bg-dj-terracota text-white" : "bg-crust-100 text-crust-500"
                        }`}
                      >
                        {p.destacado ? "★" : "☆"}
                      </button>
                    </td>
                    <td data-acciones className="whitespace-nowrap px-4 py-3 text-center">
                      <button
                        onClick={() => abrirEdicion(p)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-crust-600 hover:bg-crust-100"
                        title="Editar"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => abrirRotulado(p)}
                        className={`ml-1 rounded-lg px-2 py-1 text-xs font-semibold ${
                          p.requiereOctogono
                            ? "bg-crust-800 text-white hover:bg-crust-900"
                            : "text-crust-600 hover:bg-crust-100"
                        }`}
                        title="Rotulado frontal y ficha nutricional"
                      >
                        {p.requiereOctogono ? "⬢ Rótulo" : "Rótulo"}
                      </button>
                      {puedeBorrar && (
                        <button
                          onClick={() => borrarProducto(p)}
                          className="ml-1 rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {visibles.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-14 text-center">
                    {cargando ? (
                      <span className="text-crust-400">Cargando…</span>
                    ) : productos.length > 0 ? (
                      <span className="text-crust-400">Ningún producto coincide con el filtro.</span>
                    ) : (
                      <div className="mx-auto max-w-md">
                        <p className="font-display text-lg font-semibold text-crust-700">
                          Todavía no cargaste productos
                        </p>
                        <p className="mt-2 text-sm text-crust-500">
                          Cargá lo que vendés: el pan y la pastelería que elaborás acá, y también
                          lo que comprás hecho para revender.
                        </p>
                        <button
                          onClick={abrirNuevo}
                          className="mt-5 rounded-lg bg-dj-terracota px-5 py-2.5 text-sm font-semibold text-white hover:bg-dj-cobre"
                        >
                          + Crear el primero
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {productos.length > 0 && (
        <p className="mt-3 text-xs text-crust-400">
          El <b>food cost</b> es cuánto del precio se va en costo. Objetivo {FOOD_COST_OBJETIVO.min}–
          {FOOD_COST_OBJETIVO.max} %. Los elaborados lo sacan de su receta; los de reventa, del costo
          de compra.
        </p>
      )}

      {/* ---------- Alta / edición ---------- */}
      {editando && (
        <Modal
          title={editando === "nuevo" ? "Nuevo producto" : "Editar producto"}
          subtitle={editando === "nuevo" ? "Lo que vendés en el mostrador o la web" : editando.nombre}
          onClose={() => setEditando(null)}
          ancho="max-w-2xl"
        >
          <form onSubmit={guardarProducto} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-crust-700">Nombre</span>
                <input
                  value={form.nombre}
                  onChange={(e) => {
                    const nombre = e.target.value;
                    // En un alta, la tasa sigue al nombre hasta que se toque
                    // el selector a mano. Editando un producto no se pisa.
                    const auto =
                      editando === "nuevo" && !ivaTocado && nombre.trim()
                        ? { ivaRate: sugerirIva(nombre).tasa }
                        : {};
                    setForm({ ...form, nombre, ...auto });
                  }}
                  placeholder="Ej: Pan de masa madre 800 g"
                  className="w-full rounded-lg border border-crust-200 px-3 py-2"
                  autoFocus
                  required
                />
                <span className="mt-1 block text-xs text-crust-400">
                  Es el nombre que ven los clientes en la carta y en la web.
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Categoría</span>
                <select
                  value={form.categoriaId}
                  onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}
                  className="w-full rounded-lg border border-crust-200 px-3 py-2"
                  required
                >
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}{c.activa ? "" : " (oculta)"}</option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-crust-400">Agrupa el producto en la carta.</span>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">IVA</span>
                <select
                  value={form.ivaRate}
                  onChange={(e) => {
                    setIvaTocado(true);
                    setForm({ ...form, ivaRate: e.target.value });
                  }}
                  className="w-full rounded-lg border border-crust-200 px-3 py-2"
                >
                  {Object.values(IvaRate).map((v) => (
                    <option key={v} value={v}>{IVA_LABEL[v]}</option>
                  ))}
                </select>
                {sugerencia && sugerencia.tasa === form.ivaRate && sugerencia.reconocido ? (
                  <span className="mt-1 block text-xs text-crust-400">{sugerencia.motivo}</span>
                ) : sugerencia && sugerencia.tasa !== form.ivaRate ? (
                  <button
                    type="button"
                    onClick={() => { setIvaTocado(true); setForm({ ...form, ivaRate: sugerencia.tasa }); }}
                    className="mt-1 block text-left text-xs text-dj-cobre underline"
                  >
                    Por el nombre correspondería {IVA_LABEL[sugerencia.tasa]}. Usar esa.
                  </button>
                ) : (
                  <span className="mt-1 block text-xs text-crust-400">La mayoría de los alimentos va en mínima.</span>
                )}
                <span className="mt-1 block text-xs text-crust-400">
                  El precio ya incluye el IVA: esto define cuánto se declara, no lo que paga el cliente.
                </span>
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-crust-700">
                  Descripción <span className="font-normal text-crust-400">(opcional)</span>
                </span>
                <textarea
                  rows={2}
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  placeholder="Fermentado 24 horas, corteza gruesa y miga alveolada."
                  className="w-full rounded-lg border border-crust-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            {/* Origen del producto: define de dónde sale el costo */}
            <fieldset className="rounded-xl border border-crust-100 p-4">
              <legend className="px-1 text-sm font-medium text-crust-700">¿De dónde sale?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={`flex cursor-pointer gap-2 rounded-lg border p-3 ${!form.esReventa ? "border-dj-terracota bg-dj-crema/40" : "border-crust-200"}`}>
                  <input
                    type="radio"
                    className="mt-1"
                    checked={!form.esReventa}
                    onChange={() => setForm({ ...form, esReventa: false, costoCompra: "" })}
                  />
                  <span>
                    <b className="block text-sm text-crust-800">Lo elaboramos acá</b>
                    <span className="text-xs text-crust-500">
                      El costo sale de su receta. Creala en <b>Recetas y costos</b> y asociala a este
                      producto.
                    </span>
                  </span>
                </label>
                <label className={`flex cursor-pointer gap-2 rounded-lg border p-3 ${form.esReventa ? "border-dj-terracota bg-dj-crema/40" : "border-crust-200"}`}>
                  <input
                    type="radio"
                    className="mt-1"
                    checked={form.esReventa}
                    onChange={() => setForm({ ...form, esReventa: true })}
                  />
                  <span>
                    <b className="block text-sm text-crust-800">Lo compramos hecho</b>
                    <span className="text-xs text-crust-500">
                      Reventa: se vende tal cual con un margen. El costo lo cargás acá.
                    </span>
                  </span>
                </label>
              </div>

              {!form.esReventa && (
                <label className="mt-3 flex items-start gap-2 rounded-lg border border-crust-100 bg-crust-50 p-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={form.controlaStock}
                    onChange={(e) => setForm({ ...form, controlaStock: e.target.checked })}
                  />
                  <span>
                    <b className="block text-sm text-crust-800">Se vende de lo producido</b>
                    <span className="text-xs text-crust-500">
                      La venta descuenta de las tandas producidas y se bloquea si no hay stock.
                      Marcalo para el pan y la pastelería que horneás por tanda; dejalo sin marcar
                      para lo que se prepara al momento (café, tostados).
                    </span>
                  </span>
                </label>
              )}

              {editando !== "nuevo" && !form.esReventa && !editando.receta && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Todavía no tiene receta asociada, así que no se puede calcular su food cost. Creala
                  en <b>Recetas y costos</b> eligiendo este producto.
                </p>
              )}

              {editando !== "nuevo" && form.controlaStock && (
                <p className="mt-3 text-xs text-crust-500">
                  Stock producido ahora:{" "}
                  <b className={editando.stockProducido ? "text-crust-800" : "text-red-600"}>
                    {editando.stockProducido ?? 0} unidades
                  </b>
                  . Se repone terminando una orden en <b>Producción</b>.
                </p>
              )}
            </fieldset>

            {/* Precio y costo */}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Precio de venta</span>
                <input
                  type="number" step="0.01" min="0"
                  value={form.precio}
                  onChange={(e) => setForm({ ...form, precio: e.target.value })}
                  placeholder="Ej: 220"
                  className="w-full rounded-lg border border-crust-200 px-3 py-2 tabular-nums"
                  required
                />
                <span className="mt-1 block text-xs text-crust-400">Lo que paga el cliente, IVA incluido.</span>
              </label>

              {form.esReventa && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-crust-700">Costo de compra</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={form.costoCompra}
                    onChange={(e) => setForm({ ...form, costoCompra: e.target.value })}
                    placeholder="Ej: 90"
                    className="w-full rounded-lg border border-crust-200 px-3 py-2 tabular-nums"
                  />
                  <span className="mt-1 block text-xs text-crust-400">
                    Lo que te cuesta a vos cada unidad.
                  </span>
                </label>
              )}
            </div>

            {previaForm && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-crust-50 px-4 py-3">
                <span className="text-sm text-crust-600">
                  Margen: <b className="text-crust-800">{formatUYU(previaForm.margen)}</b> por unidad
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${SEMAFORO[previaForm.sem].cls}`}>
                  Food cost {previaForm.pct.toFixed(1)} % · {SEMAFORO[previaForm.sem].ayuda}
                </span>
              </div>
            )}

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-crust-700">
                <input type="checkbox" checked={form.disponible} onChange={(e) => setForm({ ...form, disponible: e.target.checked })} />
                Disponible para la venta
              </label>
              <label className="flex items-center gap-2 text-sm text-crust-700">
                <input type="checkbox" checked={form.destacado} onChange={(e) => setForm({ ...form, destacado: e.target.checked })} />
                Destacado en la web
              </label>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={guardando} className="flex-1 rounded-lg bg-dj-terracota py-2.5 font-semibold text-white hover:bg-dj-cobre disabled:opacity-60">
                {guardando ? "Guardando…" : editando === "nuevo" ? "Crear producto" : "Guardar cambios"}
              </button>
              <button type="button" onClick={() => setEditando(null)} className="rounded-lg border border-crust-200 px-4 py-2 text-crust-700 hover:bg-crust-100">
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------- Revisión de IVA de todo el catálogo ---------- */}
      {revisandoIva && (
        <Modal
          title="Revisar IVA del catálogo"
          subtitle="Lo cargado contra lo que dice la norma"
          onClose={() => setRevisandoIva(false)}
          ancho="max-w-3xl"
        >
          <p className="mb-3 rounded-lg bg-crust-50 px-3 py-2 text-xs text-crust-600">
            La tasa sugerida sale del art. 101 del Decreto 220/998 y del art. 38 del
            Título 10. Es una ayuda: <b>la que vale es la que queda guardada</b>, y la
            confirma tu contador. El detalle está en <b>docs/iva.md</b>.
          </p>

          {difieren.length === 0 ? (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              Todo el catálogo coincide con lo sugerido.
            </p>
          ) : (
            <p className="mb-2 text-sm text-crust-600">
              <b>{difieren.length}</b> de {revisionIva.length} productos tienen una tasa
              distinta a la sugerida.
            </p>
          )}

          <div className="tabla-marco max-h-[45vh] overflow-auto rounded-xl border border-crust-100">
            <table className="tabla-cards w-full text-sm">
              <thead className="sticky top-0 bg-crust-50 text-left text-xs uppercase tracking-wide text-crust-500">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Cargado</th>
                  <th className="px-3 py-2">Sugerido</th>
                </tr>
              </thead>
              <tbody>
                {revisionIva.map((f) => (
                  <tr
                    key={f.producto.id}
                    className={`border-t border-crust-50 ${f.difiere ? "bg-amber-50/40" : ""}`}
                  >
                    <td data-etiqueta="Aplicar" className="px-3 py-2">
                      <input
                        type="checkbox"
                        disabled={!f.difiere}
                        checked={aAplicar.has(f.producto.id)}
                        onChange={(e) => {
                          const s = new Set(aAplicar);
                          if (e.target.checked) s.add(f.producto.id);
                          else s.delete(f.producto.id);
                          setAAplicar(s);
                        }}
                        title={f.difiere ? "Aplicar la sugerida" : "Ya coincide"}
                      />
                    </td>
                    <td data-principal className="px-3 py-2">
                      <span className="font-medium text-crust-800">{f.producto.nombre}</span>
                      {f.motivo && (
                        <span className="mt-0.5 block text-xs text-crust-400">{f.motivo}</span>
                      )}
                    </td>
                    <td data-etiqueta="Cargado" className="px-3 py-2 text-crust-600">
                      {IVA_LABEL[f.producto.ivaRate]}
                    </td>
                    <td data-etiqueta="Sugerido" className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          f.difiere
                            ? "bg-amber-100 text-amber-800"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {IVA_LABEL[f.sugerida]}
                      </span>
                      {f.dudoso && (
                        <span className="ml-1 text-xs text-crust-400" title="La norma depende de un dato que el nombre no dice">
                          · a revisar
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={aplicarIva}
              disabled={aplicandoIva || aAplicar.size === 0}
              className="rounded-lg bg-dj-terracota px-5 py-2.5 font-semibold text-white hover:bg-dj-cobre disabled:opacity-50"
            >
              {aplicandoIva ? "Aplicando…" : `Aplicar a ${aAplicar.size} producto${aAplicar.size === 1 ? "" : "s"}`}
            </button>
            {difieren.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setAAplicar(
                    aAplicar.size === difieren.length
                      ? new Set()
                      : new Set(difieren.map((f) => f.producto.id)),
                  )
                }
                className="rounded-lg border border-crust-200 px-4 py-2 text-sm text-crust-700 hover:bg-crust-100"
              >
                {aAplicar.size === difieren.length ? "Desmarcar todas" : "Marcar todas las que difieren"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setRevisandoIva(false)}
              className="rounded-lg border border-crust-200 px-4 py-2 text-sm text-crust-700 hover:bg-crust-100"
            >
              Cerrar
            </button>
          </div>
        </Modal>
      )}

      {/* ---------- Categorías ---------- */}
      {gestionCat && (
        <Modal title="Categorías" subtitle="Cómo se agrupan los productos en la carta" onClose={() => setGestionCat(false)}>
          <form onSubmit={crearCategoria} className="mb-4 flex gap-2">
            <input
              value={catNueva}
              onChange={(e) => setCatNueva(e.target.value)}
              placeholder="Ej: Panadería, Pastelería, Cafetería…"
              className="flex-1 rounded-lg border border-crust-200 px-3 py-2"
              autoFocus
            />
            <button className="rounded-lg bg-dj-terracota px-4 py-2 text-sm font-semibold text-white hover:bg-dj-cobre">
              Agregar
            </button>
          </form>

          <ul className="space-y-2">
            {categorias.map((c) => {
              const cuantos = productos.filter((p) => p.categoriaId === c.id).length;
              return (
                <li key={c.id} className="flex items-center gap-3 rounded-lg border border-crust-100 px-3 py-2">
                  <span className={`flex-1 text-sm ${c.activa ? "text-crust-800" : "text-crust-400 line-through"}`}>
                    {c.nombre}
                    <span className="ml-2 text-xs text-crust-400">
                      {cuantos} producto{cuantos === 1 ? "" : "s"}
                    </span>
                  </span>
                  <button
                    onClick={() => toggleCategoria(c)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      c.activa ? "bg-green-100 text-green-700" : "bg-crust-100 text-crust-500"
                    }`}
                    title={c.activa ? "Visible en la carta" : "Oculta en la carta"}
                  >
                    {c.activa ? "Visible" : "Oculta"}
                  </button>
                  <button
                    onClick={() => borrarCategoria(c)}
                    className="rounded-lg px-2 py-1 text-sm text-red-500 hover:bg-red-50"
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
            {categorias.length === 0 && (
              <li className="rounded-lg border border-dashed border-crust-200 p-6 text-center text-sm text-crust-400">
                Creá la primera categoría para poder cargar productos.
              </li>
            )}
          </ul>
        </Modal>
      )}

      {/* ---------- Rotulado ---------- */}
      {rotDe && (
        <Modal title="Rotulado frontal" subtitle={rotDe.nombre} onClose={() => setRotDe(null)}>
          <form onSubmit={guardarRotulado} className="space-y-4">
            <div className="rounded-xl border border-crust-100 bg-crust-50 p-3 text-center">
              <p className="mb-2 text-xs font-semibold uppercase text-crust-500">Sellos que se aplicarán</p>
              <Octogonos flags={sellosPreview} size={56} className="justify-center" />
              {!Object.values(sellosPreview).some(Boolean) && (
                <p className="text-sm text-crust-400">Sin sellos con los valores actuales.</p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-crust-700">
              <input type="checkbox" checked={rot.esLiquido} onChange={(e) => setRot({ ...rot, esLiquido: e.target.checked })} />
              Es líquido (los valores se declaran por 100 ml y cambian los límites)
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Porción</span>
              <input value={rot.porcion} onChange={(e) => setRot({ ...rot, porcion: e.target.value })} placeholder="Ej: 1 unidad (60 g)" className="w-full rounded-lg border border-crust-200 px-3 py-2" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Ingredientes</span>
              <textarea rows={2} value={rot.ingredientes} onChange={(e) => setRot({ ...rot, ingredientes: e.target.value })} placeholder="En orden decreciente: harina de trigo, agua, grasa…" className="w-full rounded-lg border border-crust-200 px-3 py-2 text-sm" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Alérgenos</span>
              <input value={rot.alergenos} onChange={(e) => setRot({ ...rot, alergenos: e.target.value })} placeholder="Ej: Contiene gluten, leche y huevo" className="w-full rounded-lg border border-crust-200 px-3 py-2" />
            </label>

            <div>
              <p className="mb-2 text-sm font-semibold text-crust-700">Información nutricional por {unidad}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {([
                  ["energiaKcal", "Energía (kcal)"],
                  ["proteinas", "Proteínas (g)"],
                  ["carbohidratos", "Carbohidratos (g)"],
                  ["azucares", `Azúcares (g) · límite ${umbrales.azucares}`],
                  ["grasasTotales", `Grasas totales (g) · límite ${umbrales.grasasTotales}`],
                  ["grasasSaturadas", `Grasas saturadas (g) · límite ${umbrales.grasasSaturadas}`],
                  ["grasasTrans", "Grasas trans (g)"],
                  ["fibra", "Fibra (g)"],
                  ["sodioMg", `Sodio (mg) · límite ${umbrales.sodioMg}`],
                ] as const).map(([k, label]) => (
                  <label key={k} className="block">
                    <span className="mb-0.5 block text-[11px] text-crust-500">{label}</span>
                    <input
                      type="number" step="0.01" min="0"
                      value={rot[k]}
                      onChange={(e) => setRot({ ...rot, [k]: e.target.value })}
                      className="w-full rounded-lg border border-crust-200 px-2 py-1.5 text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-crust-100 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-crust-700">
                <input type="checkbox" checked={rot.autoOctogonos} onChange={(e) => setRot({ ...rot, autoOctogonos: e.target.checked })} />
                Calcular los sellos automáticamente
              </label>
              {!rot.autoOctogonos && (
                <div className="mt-2 grid grid-cols-2 gap-1 text-sm text-crust-600">
                  {([
                    ["excesoAzucares", "Exceso azúcares"],
                    ["excesoSodio", "Exceso sodio"],
                    ["excesoGrasas", "Exceso grasas"],
                    ["excesoGrasasSat", "Exceso grasas saturadas"],
                  ] as const).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-1.5">
                      <input type="checkbox" checked={rot[k]} onChange={(e) => setRot({ ...rot, [k]: e.target.checked })} />
                      {label}
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-crust-600">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={rot.contieneEdulcorantes} onChange={(e) => setRot({ ...rot, contieneEdulcorantes: e.target.checked })} />
                  Contiene edulcorantes
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={rot.contieneCafeina} onChange={(e) => setRot({ ...rot, contieneCafeina: e.target.checked })} />
                  Contiene cafeína
                </label>
              </div>
            </div>

            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              El cálculo es una <b>ayuda</b> según los límites cargados del Decreto 272/018. La
              declaración final debe validarse con el análisis bromatológico del producto y la
              normativa vigente.
            </p>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={savingRot} className="flex-1 rounded-lg bg-dj-terracota py-2 font-semibold text-white hover:bg-dj-cobre disabled:opacity-60">
                {savingRot ? "Guardando…" : "Guardar rotulado"}
              </button>
              <button type="button" onClick={() => setRotDe(null)} className="rounded-lg border border-crust-200 px-4 py-2 text-crust-700 hover:bg-crust-100">Cancelar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
