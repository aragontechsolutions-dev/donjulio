import { useRef, useState } from "react";
import { api, tokenStore } from "../../lib/api";
import { showToast } from "../../lib/toast";

interface FilaRevisada {
  fila: number;
  accion: "crear" | "actualizar" | "error";
  nombre: string;
  categoria: string;
  precio: number | null;
  iva: string | null;
  unidadVenta: string | null;
  proveedor: string | null;
  avisos: string[];
  errores: string[];
}
interface Revision {
  aplicado: boolean;
  resumen: {
    total: number;
    crear: number;
    actualizar: number;
    errores: number;
    categoriasNuevas: string[];
    proveedoresNuevos: string[];
  };
  filas: FilaRevisada[];
}

const BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "http://localhost:3000/api";

const ACCION_CLS: Record<string, string> = {
  crear: "bg-green-100 text-green-700",
  actualizar: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
};
const ACCION_LABEL: Record<string, string> = {
  crear: "Nuevo",
  actualizar: "Actualiza",
  error: "Error",
};

/**
 * Carga masiva de productos desde una planilla.
 *
 * Primero se revisa el archivo y se muestra fila por fila qué va a pasar;
 * recién después se aplica. Con una sola fila mal, no se escribe ninguna.
 */
export default function CargaMasiva({ onCerrar, onAplicado }: { onCerrar: () => void; onAplicado: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /** Las descargas van con fetch porque necesitan el token de la sesión. */
  const bajar = async (ruta: string, nombre: string, queEs: string) => {
    try {
      const r = await fetch(`${BASE}${ruta}`, {
        headers: { authorization: `Bearer ${tokenStore.get() ?? ""}` },
      });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("error", `No se pudo descargar ${queEs}.`);
    }
  };

  const enviar = async (aplicar: boolean) => {
    if (!archivo || trabajando) return;
    setTrabajando(true);
    try {
      const fd = new FormData();
      fd.append("file", archivo);
      if (aplicar) fd.append("aplicar", "true");
      const r = await api.postForm<Revision>("/admin/productos/importar", fd, { sinToast: true });
      setRevision(r);
      if (r.aplicado) {
        showToast("success", `Listo: ${r.resumen.crear} nuevos y ${r.resumen.actualizar} actualizados ✓`);
        onAplicado();
      }
    } catch {
      /* el toast de error lo dispara el api client */
    } finally {
      setTrabajando(false);
    }
  };

  const elegir = (f: File | null) => {
    setArchivo(f);
    setRevision(null);
  };

  const r = revision;
  const hayErrores = (r?.resumen.errores ?? 0) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-crust-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-carga"
      onClick={onCerrar}
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="titulo-carga" className="font-display text-xl font-bold text-crust-800">
          Carga masiva de productos
        </h3>
        <p className="mb-4 text-sm text-crust-500">
          Para cargar el catálogo de una vez desde una planilla.
        </p>

        <ol className="space-y-3 text-sm">
          <li className="rounded-xl border border-crust-100 bg-crust-50 p-3">
            <p className="font-semibold text-crust-800">1. Partí de una planilla</p>
            <p className="mb-2 text-crust-500">
              La <b>plantilla</b> viene vacía, con los encabezados y tres ejemplos. El{" "}
              <b>catálogo actual</b> trae todos tus productos en el mismo formato: lo editás y lo
              volvés a subir, o te lo llevás si mudás la base de servidor.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => bajar("/admin/productos/importar/plantilla", "productos-don-julio.csv", "la plantilla")}
                className="rounded-lg border border-crust-200 bg-white px-3 py-1.5 font-medium text-crust-700 hover:bg-crust-100"
              >
                Descargar plantilla vacía
              </button>
              <button
                onClick={() => bajar("/admin/productos/exportar", "catalogo-don-julio.csv", "el catálogo")}
                className="rounded-lg border border-crust-200 bg-white px-3 py-1.5 font-medium text-crust-700 hover:bg-crust-100"
              >
                Descargar catálogo actual
              </button>
            </div>
          </li>

          <li className="rounded-xl border border-crust-100 bg-crust-50 p-3">
            <p className="font-semibold text-crust-800">2. Subí el archivo lleno</p>
            <p className="mb-2 text-crust-500">
              Se revisa y te muestro qué va a pasar con cada fila. Todavía no se guarda nada.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => elegir(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-crust-600 file:mr-3 file:rounded-lg file:border-0 file:bg-crust-200 file:px-3 file:py-1.5 file:font-medium file:text-crust-800"
            />
            {archivo && !r && (
              <button
                onClick={() => enviar(false)}
                disabled={trabajando}
                className="mt-2 rounded-lg bg-crust-800 px-4 py-2 font-semibold text-white hover:bg-crust-900 disabled:opacity-50"
              >
                {trabajando ? "Revisando…" : "Revisar archivo"}
              </button>
            )}
          </li>
        </ol>

        {r && (
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-crust-100 px-3 py-1 text-crust-700">
                {r.resumen.total} filas
              </span>
              <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">
                {r.resumen.crear} nuevos
              </span>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                {r.resumen.actualizar} actualizan
              </span>
              {hayErrores && (
                <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700">
                  {r.resumen.errores} con error
                </span>
              )}
            </div>

            {(r.resumen.categoriasNuevas.length > 0 || r.resumen.proveedoresNuevos.length > 0) && !r.aplicado && (
              <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {r.resumen.categoriasNuevas.length > 0 && (
                  <>Se van a crear las categorías: <b>{r.resumen.categoriasNuevas.join(", ")}</b>. </>
                )}
                {r.resumen.proveedoresNuevos.length > 0 && (
                  <>Se van a crear los proveedores: <b>{r.resumen.proveedoresNuevos.join(", ")}</b>.</>
                )}
              </p>
            )}

            <div className="tabla-marco max-h-72 overflow-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 bg-crust-50 text-left text-crust-600">
                  <tr>
                    <th className="px-3 py-2">Fila</th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Categoría</th>
                    <th className="px-3 py-2 text-right">Precio</th>
                    <th className="px-3 py-2">Qué pasa</th>
                  </tr>
                </thead>
                <tbody>
                  {r.filas.map((f) => (
                    <tr key={f.fila} className="border-t border-crust-50 align-top">
                      <td className="px-3 py-2 text-crust-400 tabular-nums">{f.fila}</td>
                      <td className="px-3 py-2 text-crust-800">
                        {f.nombre || <span className="text-crust-300">—</span>}
                        {f.unidadVenta === "KG" && <span className="ml-1 text-xs text-crust-400">por kilo</span>}
                        {f.proveedor && <span className="block text-xs text-crust-400">{f.proveedor}</span>}
                      </td>
                      <td className="px-3 py-2 text-crust-600">{f.categoria}</td>
                      <td className="px-3 py-2 text-right text-crust-700 tabular-nums">
                        {f.precio != null ? f.precio : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACCION_CLS[f.accion]}`}>
                          {ACCION_LABEL[f.accion]}
                        </span>
                        {f.errores.map((e, i) => (
                          <span key={i} className="mt-1 block text-xs text-red-600">{e}</span>
                        ))}
                        {!r.aplicado && f.avisos.map((a, i) => (
                          <span key={i} className="mt-1 block text-xs text-crust-400">{a}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hayErrores && (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                Corregí las filas marcadas en el archivo y volvé a subirlo. Mientras haya un error,
                no se carga ninguna fila: un catálogo a medio cargar es peor que uno sin cargar.
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onCerrar}
            className="rounded-xl border border-crust-200 px-5 py-3 font-semibold text-crust-700 hover:bg-crust-100"
          >
            {r?.aplicado ? "Cerrar" : "Cancelar"}
          </button>
          {r && !r.aplicado && (
            <button
              onClick={() => enviar(true)}
              disabled={hayErrores || trabajando || r.resumen.total === 0}
              className="flex-1 rounded-xl bg-dj-terracota py-3 font-semibold text-white hover:bg-dj-cobre disabled:cursor-not-allowed disabled:opacity-50"
            >
              {trabajando
                ? "Cargando…"
                : `Cargar ${r.resumen.crear + r.resumen.actualizar} producto${r.resumen.crear + r.resumen.actualizar === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
