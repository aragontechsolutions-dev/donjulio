import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { formatUYU } from "../../lib/format";

interface Producto {
  id: string;
  nombre: string;
  precio: string;
  imagenUrl: string | null;
  disponible: boolean;
  destacado: boolean;
  categoria?: { nombre: string };
}

export default function ProductosAdmin() {
  const [productos, setProductos] = useState<Producto[]>([]);

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

  const subirImagen = async (p: Producto, file: File) => {
    const { url } = await api.upload<{ url: string }>("/admin/storage/upload", file);
    await api.patch(`/admin/productos/${p.id}`, { imagenUrl: url });
    await load();
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
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && subirImagen(p, e.target.files[0])}
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
                        ? "bg-crust-600 text-white"
                        : "bg-crust-100 text-crust-500"
                    }`}
                  >
                    {p.destacado ? "★" : "☆"}
                  </button>
                </td>
              </tr>
            ))}
            {productos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-crust-400">
                  No hay productos. Corré el seed: <code>pnpm db:seed</code>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
