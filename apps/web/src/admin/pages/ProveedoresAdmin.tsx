import { useEffect, useMemo, useState } from "react";
import { puede } from "@donjulio/shared";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { showToast } from "../../lib/toast";
import { formatUYU } from "../../lib/format";

interface CategoriaRef { id: string; nombre: string }
interface Proveedor {
  id: string;
  nombre: string;
  rut: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
  activo: boolean;
  categorias: CategoriaRef[];
  insumos: number;
  productos: number;
}
interface InsumoProveedor {
  id: string; nombre: string; unidad: string; costoUnitario: number; stockActual: number;
}
interface ProductoProveedor {
  id: string; nombre: string; precio: number; costoCompra: number | null;
  unidadVenta: string; disponible: boolean; categoria: CategoriaRef;
}
interface Detalle extends Omit<Proveedor, "insumos" | "productos"> {
  insumos: InsumoProveedor[];
  productos: ProductoProveedor[];
}

interface Form {
  nombre: string; rut: string; contacto: string; telefono: string;
  email: string; direccion: string; notas: string; activo: boolean;
  categoriaIds: string[];
}
const FORM_VACIO: Form = {
  nombre: "", rut: "", contacto: "", telefono: "", email: "",
  direccion: "", notas: "", activo: true, categoriaIds: [],
};

export default function ProveedoresAdmin() {
  const { user } = useAuth();
  const puedeEditar = puede(user?.role, "proveedores.crear");
  const puedeBorrar = puede(user?.role, "proveedores.eliminar");

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [categorias, setCategorias] = useState<CategoriaRef[]>([]);
  const [verInactivos, setVerInactivos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<Proveedor | "nuevo" | null>(null);
  const [form, setForm] = useState<Form>(FORM_VACIO);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<Record<string, Detalle>>({});
  const [guardando, setGuardando] = useState(false);

  const cargar = (inactivos = verInactivos) =>
    api
      .get<Proveedor[]>(`/admin/proveedores${inactivos ? "?inactivos=true" : ""}`)
      .then(setProveedores)
      .catch(() => {});

  useEffect(() => {
    cargar();
    api.get<CategoriaRef[]>("/admin/categorias").then(setCategorias).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return proveedores;
    return proveedores.filter((p) =>
      [p.nombre, p.contacto, p.rut, p.telefono, p.email]
        .filter(Boolean)
        .some((c) => c!.toLowerCase().includes(q)),
    );
  }, [proveedores, busqueda]);

  const abrirNuevo = () => {
    setForm(FORM_VACIO);
    setEditando("nuevo");
  };
  const abrirEditar = (p: Proveedor) => {
    setForm({
      nombre: p.nombre,
      rut: p.rut ?? "",
      contacto: p.contacto ?? "",
      telefono: p.telefono ?? "",
      email: p.email ?? "",
      direccion: p.direccion ?? "",
      notas: p.notas ?? "",
      activo: p.activo,
      categoriaIds: p.categorias.map((c) => c.id),
    });
    setEditando(p);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || guardando) return;
    setGuardando(true);
    const payload = {
      nombre: form.nombre.trim(),
      rut: form.rut.trim() || null,
      contacto: form.contacto.trim() || null,
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      direccion: form.direccion.trim() || null,
      notas: form.notas.trim() || null,
      activo: form.activo,
      categoriaIds: form.categoriaIds,
    };
    try {
      if (editando === "nuevo") {
        await api.post("/admin/proveedores", payload, { sinToast: true });
        showToast("success", `“${payload.nombre}” agregado ✓`);
      } else if (editando) {
        await api.patch(`/admin/proveedores/${editando.id}`, payload, { sinToast: true });
        showToast("success", "Cambios guardados ✓");
        setDetalles((d) => ({ ...d, [editando.id]: undefined as unknown as Detalle }));
      }
      setEditando(null);
      cargar();
    } catch {
      /* el toast de error lo dispara el api client */
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (p: Proveedor) => {
    if (!confirm(`¿Borrar a “${p.nombre}”? Si tiene compras asociadas, desactivalo en vez de borrarlo.`)) return;
    try {
      await api.del(`/admin/proveedores/${p.id}`);
      cargar();
    } catch {
      /* el api client muestra el motivo */
    }
  };

  const verDetalle = (id: string) => {
    if (abierto === id) {
      setAbierto(null);
      return;
    }
    setAbierto(id);
    if (detalles[id]) return;
    api
      .get<Detalle>(`/admin/proveedores/${id}`)
      .then((d) => setDetalles((prev) => ({ ...prev, [id]: d })))
      .catch(() => setAbierto(null));
  };

  const toggleCategoria = (id: string) =>
    setForm((f) => ({
      ...f,
      categoriaIds: f.categoriaIds.includes(id)
        ? f.categoriaIds.filter((x) => x !== id)
        : [...f.categoriaIds, id],
    }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-crust-800">Proveedores</h1>
          <p className="text-sm text-crust-500">A quién le compramos y qué.</p>
        </div>
        {puedeEditar && (
          <button
            onClick={abrirNuevo}
            className="rounded-xl bg-dj-terracota px-4 py-2.5 font-semibold text-white hover:bg-dj-cobre"
          >
            Nuevo proveedor
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, contacto, RUT…"
          className="min-w-0 flex-1 rounded-xl border border-crust-200 px-4 py-2.5"
        />
        <label className="flex items-center gap-2 text-sm text-crust-600">
          <input
            type="checkbox"
            checked={verInactivos}
            onChange={(e) => { setVerInactivos(e.target.checked); cargar(e.target.checked); }}
          />
          Ver inactivos
        </label>
      </div>

      <div className="space-y-2">
        {visibles.map((p) => {
          const esteAbierto = abierto === p.id;
          const det = detalles[p.id];
          return (
            <div key={p.id} className="rounded-2xl border border-crust-100 bg-white shadow-sm">
              <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <button
                  type="button"
                  onClick={() => verDetalle(p.id)}
                  aria-expanded={esteAbierto}
                  className="control-compacto min-w-0 text-left sm:flex-1"
                >
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-crust-800">
                    <span>
                      <span className={`mr-1 inline-block w-3 text-crust-400 transition-transform ${esteAbierto ? "rotate-90" : ""}`}>›</span>
                      {p.nombre}
                    </span>
                    {!p.activo && (
                      <span className="rounded-full bg-crust-100 px-2 py-0.5 text-xs font-normal text-crust-500">
                        Inactivo
                      </span>
                    )}
                    {p.categorias.map((c) => (
                      <span key={c.id} className="whitespace-nowrap rounded-full bg-dj-crema px-2 py-0.5 text-xs font-normal text-crust-600">
                        {c.nombre}
                      </span>
                    ))}
                  </p>
                  <p className="pl-4 text-sm text-crust-500">
                    {[
                      p.contacto,
                      p.telefono,
                      p.insumos > 0 ? `${p.insumos} insumo${p.insumos === 1 ? "" : "s"}` : "",
                      p.productos > 0 ? `${p.productos} producto${p.productos === 1 ? "" : "s"}` : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Sin datos de contacto"}
                  </p>
                </button>
                {puedeEditar && (
                  <div className="flex shrink-0 items-center gap-2 pl-4 sm:pl-0">
                    <button
                      onClick={() => abrirEditar(p)}
                      className="control-compacto rounded-lg border border-crust-200 px-3 py-1.5 text-sm font-medium text-crust-700 hover:bg-crust-50"
                    >
                      Editar
                    </button>
                    {puedeBorrar && (
                      <button
                        onClick={() => borrar(p)}
                        className="control-compacto rounded-lg px-2 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        Borrar
                      </button>
                    )}
                  </div>
                )}
              </div>

              {esteAbierto && (
                <div className="border-t border-crust-100 px-4 py-3 text-sm">
                  {!det ? (
                    <p className="text-crust-400">Buscando…</p>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-crust-400">Datos</p>
                        <ul className="space-y-0.5 text-crust-600">
                          {det.rut && <li>RUT {det.rut}</li>}
                          {det.contacto && <li>{det.contacto}</li>}
                          {det.telefono && <li>{det.telefono}</li>}
                          {det.email && <li className="break-all">{det.email}</li>}
                          {det.direccion && <li>{det.direccion}</li>}
                          {det.notas && <li className="mt-1 text-crust-500">{det.notas}</li>}
                          {!det.rut && !det.contacto && !det.telefono && !det.email && !det.direccion && !det.notas && (
                            <li className="text-crust-400">Sin datos cargados.</li>
                          )}
                        </ul>
                      </div>

                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-crust-400">
                          Qué se le compra
                        </p>
                        {det.insumos.length === 0 && det.productos.length === 0 ? (
                          <p className="text-crust-400">
                            Todavía nada. Asignale insumos en <b>Insumos / Stock</b> o productos en{" "}
                            <b>Productos</b>.
                          </p>
                        ) : (
                          <ul className="space-y-0.5 text-crust-600">
                            {det.insumos.map((i) => (
                              <li key={i.id} className="flex justify-between gap-3">
                                <span>{i.nombre} <span className="text-crust-400">insumo</span></span>
                                <span className="shrink-0 tabular-nums">{formatUYU(i.costoUnitario)}/{i.unidad.toLowerCase()}</span>
                              </li>
                            ))}
                            {det.productos.map((pr) => (
                              <li key={pr.id} className="flex justify-between gap-3">
                                <span>
                                  {pr.nombre} <span className="text-crust-400">{pr.categoria.nombre}</span>
                                </span>
                                <span className="shrink-0 tabular-nums">
                                  {pr.costoCompra != null ? `${formatUYU(pr.costoCompra)} costo` : formatUYU(pr.precio)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visibles.length === 0 && (
          <p className="rounded-2xl border border-crust-100 bg-white p-8 text-center text-crust-400">
            {busqueda ? "Ningún proveedor coincide." : "Todavía no hay proveedores cargados."}
          </p>
        )}
      </div>

      {/* Alta / edición */}
      {editando && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-crust-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-proveedor"
          onClick={() => setEditando(null)}
        >
          <form
            onSubmit={guardar}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
          >
            <h3 id="titulo-proveedor" className="mb-4 font-display text-xl font-bold text-crust-800">
              {editando === "nuevo" ? "Nuevo proveedor" : editando.nombre}
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-crust-700">Nombre</span>
                <input
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Molino del Sur"
                  className="w-full rounded-lg border border-crust-200 px-3 py-2"
                  required
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">RUT</span>
                <input
                  value={form.rut}
                  onChange={(e) => setForm({ ...form, rut: e.target.value })}
                  placeholder="Ej: 210001234567"
                  inputMode="numeric"
                  className="w-full rounded-lg border border-crust-200 px-3 py-2 tabular-nums"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Contacto</span>
                <input
                  value={form.contacto}
                  onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                  placeholder="Con quién se habla"
                  className="w-full rounded-lg border border-crust-200 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Teléfono</span>
                <input
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  placeholder="Ej: 099 123 456"
                  inputMode="tel"
                  className="w-full rounded-lg border border-crust-200 px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-crust-200 px-3 py-2"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-crust-700">Dirección</span>
                <input
                  value={form.direccion}
                  onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                  className="w-full rounded-lg border border-crust-200 px-3 py-2"
                />
              </label>
            </div>

            <fieldset className="mt-4">
              <legend className="mb-1 text-sm font-medium text-crust-700">Rubros que se le compran</legend>
              <p className="mb-2 text-xs text-crust-400">
                Para saber a quién pedirle cada cosa, aunque todavía no tenga productos cargados.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {categorias.map((c) => {
                  const on = form.categoriaIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCategoria(c.id)}
                      className={`control-compacto rounded-full border px-3 py-1.5 text-sm ${
                        on ? "border-dj-terracota bg-dj-terracota text-white" : "border-crust-200 text-crust-700"
                      }`}
                    >
                      {c.nombre}
                    </button>
                  );
                })}
                {categorias.length === 0 && (
                  <p className="text-sm text-crust-400">No hay categorías cargadas todavía.</p>
                )}
              </div>
            </fieldset>

            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Notas</span>
              <textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                rows={2}
                placeholder="Días de reparto, forma de pago, pedido mínimo…"
                className="w-full rounded-lg border border-crust-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="mt-3 flex items-center gap-2 text-sm text-crust-700">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              />
              Activo
            </label>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setEditando(null)}
                className="rounded-xl border border-crust-200 px-5 py-3 font-semibold text-crust-700 hover:bg-crust-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!form.nombre.trim() || guardando}
                className="flex-1 rounded-xl bg-dj-terracota py-3 font-semibold text-white hover:bg-dj-cobre disabled:opacity-50"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
