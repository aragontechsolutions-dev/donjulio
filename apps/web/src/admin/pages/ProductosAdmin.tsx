import { useEffect, useState } from "react";
import { calcularOctogonos, umbralesPara } from "@donjulio/shared";
import { api } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { formatUYU } from "../../lib/format";
import Modal from "../../lib/Modal";
import Octogonos from "../../lib/Octogonos";

const MAX_IMAGE_MB = 5;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

interface Producto {
  id: string;
  nombre: string;
  precio: string;
  imagenUrl: string | null;
  disponible: boolean;
  destacado: boolean;
  requiereOctogono: boolean;
  categoria?: { nombre: string };
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

export default function ProductosAdmin() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [rotDe, setRotDe] = useState<Producto | null>(null);
  const [rot, setRot] = useState<RotuladoForm>(ROTULADO_VACIO);
  const [savingRot, setSavingRot] = useState(false);

  const load = () =>
    api
      .get<Producto[]>("/admin/productos")
      .then(setProductos)
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const toggle = async (p: Producto, field: "disponible" | "destacado") => {
    await api.patch(`/admin/productos/${p.id}`, { [field]: !p[field] });
    await load();
  };

  // ---- Rotulado frontal ----
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
    // Validación de tipo y tamaño antes de enviar (feedback inmediato).
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
      await api.patch(`/admin/productos/${p.id}`, { imagenUrl: url });
      await load();
    } catch {
      /* el toast de error ya lo disparó api.upload */
    }
  };

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold text-crust-800">
        Productos
      </h1>
      <div className="overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-crust-50 text-left text-crust-600">
            <tr>
              <th className="px-4 py-3">Img</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3 text-right">Precio</th>
              <th className="px-4 py-3 text-center">Disponible</th>
              <th className="px-4 py-3 text-center">Destacado</th>
              <th className="px-4 py-3 text-center">Rótulo</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id} className="border-t border-crust-50">
                <td className="px-4 py-3">
                  <label className="flex h-10 w-10 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-crust-100 text-crust-400">
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
                        e.target.value = ""; // permite reintentar el mismo archivo
                      }}
                    />
                  </label>
                </td>
                <td className="px-4 py-3 font-medium text-crust-800">
                  {p.nombre}
                </td>
                <td className="px-4 py-3 text-crust-500">
                  {p.categoria?.nombre ?? "—"}
                </td>
                <td className="px-4 py-3 text-right">{formatUYU(p.precio)}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggle(p, "disponible")}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      p.disponible
                        ? "bg-green-100 text-green-700"
                        : "bg-crust-100 text-crust-500"
                    }`}
                  >
                    {p.disponible ? "Sí" : "No"}
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggle(p, "destacado")}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      p.destacado
                        ? "bg-dj-terracota text-white"
                        : "bg-crust-100 text-crust-500"
                    }`}
                  >
                    {p.destacado ? "★" : "☆"}
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => abrirRotulado(p)}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                      p.requiereOctogono
                        ? "bg-crust-800 text-white hover:bg-crust-900"
                        : "bg-crust-100 text-crust-700 hover:bg-crust-200"
                    }`}
                    title="Rotulado frontal y ficha nutricional"
                  >
                    {p.requiereOctogono ? "⬢ Con sellos" : "Rotulado"}
                  </button>
                </td>
              </tr>
            ))}
            {productos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-crust-400">
                  No hay productos. Corré el seed: <code>pnpm db:seed</code>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rotDe && (
        <Modal title="Rotulado frontal" subtitle={rotDe.nombre} onClose={() => setRotDe(null)}>
          <form onSubmit={guardarRotulado} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            {/* Vista previa de sellos */}
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

            {/* Ficha nutricional */}
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

            {/* Sellos */}
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
