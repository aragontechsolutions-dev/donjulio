import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { showToast } from "../../lib/toast";
import type { LandingData } from "../../landing/types";

const CAMPOS = [
  { clave: "hero.titulo", label: "Título del Hero" },
  { clave: "hero.subtitulo", label: "Subtítulo del Hero" },
  { clave: "historia.titulo", label: "Título de la Historia" },
  { clave: "historia.texto", label: "Texto de la Historia", textarea: true },
];

interface Foto { id: string; imagenUrl: string; titulo: string | null; orden: number; activa: boolean }

const MAX_MB = 5;
const TIPOS = ["image/jpeg", "image/png", "image/webp"];

export default function CmsAdmin() {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [subiendo, setSubiendo] = useState(false);

  const loadFotos = () => api.get<Foto[]>("/cms/galeria").then(setFotos).catch(() => {});

  useEffect(() => {
    api
      .get<LandingData>("/cms/landing")
      .then((d) => setValores(d.contenido ?? {}))
      .catch(() => {});
    loadFotos();
  }, []);

  const guardar = async (clave: string) => {
    await api.put("/cms/contenido", { clave, valor: valores[clave] ?? "" });
    setSaved(clave);
    setTimeout(() => setSaved(null), 1500);
  };

  // ---- Galería ----
  const subirFotos = async (files: FileList) => {
    setSubiendo(true);
    try {
      for (const file of Array.from(files)) {
        if (!TIPOS.includes(file.type)) { showToast("error", `${file.name}: formato no permitido (JPG, PNG o WEBP).`); continue; }
        if (file.size > MAX_MB * 1024 * 1024) { showToast("error", `${file.name}: supera los ${MAX_MB} MB.`); continue; }
        const { url } = await api.upload<{ url: string }>("/admin/storage/upload", file);
        await api.post("/cms/galeria", { imagenUrl: url });
      }
      loadFotos();
    } catch {
      /* toast del api */
    } finally {
      setSubiendo(false);
    }
  };
  const patchFoto = async (id: string, data: Partial<Foto>) => {
    setFotos((prev) => prev.map((f) => (f.id === id ? { ...f, ...data } : f)));
    await api.patch(`/cms/galeria/${id}`, data).catch(() => {});
  };
  const borrarFoto = async (f: Foto) => {
    if (!confirm("¿Eliminar esta foto de la galería?")) return;
    try { await api.del(`/cms/galeria/${f.id}`); loadFotos(); } catch { /* toast */ }
  };
  /** Mueve la foto una posición y persiste el nuevo orden de ambas. */
  const mover = async (idx: number, dir: -1 | 1) => {
    const destino = idx + dir;
    if (destino < 0 || destino >= fotos.length) return;
    const a = fotos[idx];
    const b = fotos[destino];
    const next = [...fotos];
    next[idx] = b;
    next[destino] = a;
    setFotos(next);
    await Promise.all([
      api.patch(`/cms/galeria/${a.id}`, { orden: b.orden }).catch(() => {}),
      api.patch(`/cms/galeria/${b.id}`, { orden: a.orden }).catch(() => {}),
    ]);
    loadFotos();
  };

  return (
    <div className="max-w-2xl">
      <h1 className="mb-2 font-display text-2xl font-bold text-crust-800">
        Contenido de la web
      </h1>
      <p className="mb-6 text-sm text-crust-500">
        Editá los textos de la landing sin tocar código.
      </p>

      <div className="space-y-5">
        {CAMPOS.map((c) => (
          <div
            key={c.clave}
            className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm"
          >
            <label className="mb-2 block text-sm font-medium text-crust-700">
              {c.label}
            </label>
            {c.textarea ? (
              <textarea
                rows={4}
                value={valores[c.clave] ?? ""}
                onChange={(e) =>
                  setValores({ ...valores, [c.clave]: e.target.value })
                }
                className="w-full rounded-lg border border-crust-200 px-3 py-2"
              />
            ) : (
              <input
                value={valores[c.clave] ?? ""}
                onChange={(e) =>
                  setValores({ ...valores, [c.clave]: e.target.value })
                }
                className="w-full rounded-lg border border-crust-200 px-3 py-2"
              />
            )}
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => guardar(c.clave)}
                className="rounded-lg bg-crust-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-crust-700"
              >
                Guardar
              </button>
              {saved === c.clave && (
                <span className="text-sm text-green-600">✓ Guardado</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Galería de fotos */}
      <div className="mt-8 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-crust-800">Galería de fotos</h2>
        <p className="mb-4 text-sm text-crust-500">
          Fotos del local y los productos que se muestran en la sección <b>Galería</b> de la web.
          Si no hay ninguna activa, la sección no aparece.
        </p>

        <label className="inline-block cursor-pointer rounded-lg bg-crust-600 px-4 py-2 text-sm font-semibold text-white hover:bg-crust-700">
          {subiendo ? "Subiendo…" : "+ Subir fotos"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            disabled={subiendo}
            onChange={(e) => { const fs = e.target.files; if (fs?.length) subirFotos(fs); e.target.value = ""; }}
          />
        </label>
        <span className="ml-2 text-xs text-crust-400">JPG, PNG o WEBP · hasta {MAX_MB} MB c/u</span>

        <div className="mt-4 space-y-3">
          {fotos.map((f, i) => (
            <div key={f.id} className={`flex items-center gap-3 rounded-xl border p-3 ${f.activa ? "border-crust-100" : "border-crust-100 bg-crust-50 opacity-70"}`}>
              <img src={f.imagenUrl} alt={f.titulo ?? ""} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <input
                  value={f.titulo ?? ""}
                  onChange={(e) => setFotos((prev) => prev.map((x) => (x.id === f.id ? { ...x, titulo: e.target.value } : x)))}
                  onBlur={() => patchFoto(f.id, { titulo: f.titulo || null })}
                  placeholder="Título (opcional, se ve al pasar el mouse)"
                  className="w-full rounded-lg border border-crust-200 px-2 py-1 text-sm"
                />
                <label className="mt-1 flex items-center gap-1.5 text-xs text-crust-500">
                  <input type="checkbox" checked={f.activa} onChange={(e) => patchFoto(f.id, { activa: e.target.checked })} />
                  Visible en la web
                </label>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button onClick={() => mover(i, -1)} disabled={i === 0} className="rounded px-2 text-xs text-crust-500 hover:bg-crust-100 disabled:opacity-30" title="Subir">▲</button>
                <button onClick={() => mover(i, 1)} disabled={i === fotos.length - 1} className="rounded px-2 text-xs text-crust-500 hover:bg-crust-100 disabled:opacity-30" title="Bajar">▼</button>
              </div>
              <button onClick={() => borrarFoto(f)} className="shrink-0 rounded-lg px-2 py-1 text-sm text-red-500 hover:bg-red-50" title="Eliminar">✕</button>
            </div>
          ))}
          {fotos.length === 0 && (
            <p className="rounded-xl border border-dashed border-crust-200 p-6 text-center text-sm text-crust-400">
              Todavía no cargaste fotos. Subí algunas del local, la vitrina o tus productos.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
