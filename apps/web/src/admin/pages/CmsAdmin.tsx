import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { LandingData } from "../../landing/types";

const CAMPOS = [
  { clave: "hero.titulo", label: "Título del Hero" },
  { clave: "hero.subtitulo", label: "Subtítulo del Hero" },
  { clave: "historia.titulo", label: "Título de la Historia" },
  { clave: "historia.texto", label: "Texto de la Historia", textarea: true },
];

export default function CmsAdmin() {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<LandingData>("/cms/landing")
      .then((d) => setValores(d.contenido ?? {}))
      .catch(() => {});
  }, []);

  const guardar = async (clave: string) => {
    await api.put("/cms/contenido", { clave, valor: valores[clave] ?? "" });
    setSaved(clave);
    setTimeout(() => setSaved(null), 1500);
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
    </div>
  );
}
