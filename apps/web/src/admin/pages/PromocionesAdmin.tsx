import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface Promocion {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipoDescuento: string;
  valor: string;
  vigenciaDesde: string;
  vigenciaHasta: string;
  activa: boolean;
}

const hoy = () => new Date().toISOString().slice(0, 10);

export default function PromocionesAdmin() {
  const [promos, setPromos] = useState<Promocion[]>([]);
  const [form, setForm] = useState({
    nombre: "",
    descripcion: "",
    tipoDescuento: "PORCENTAJE",
    valor: 10,
    vigenciaDesde: hoy(),
    vigenciaHasta: hoy(),
  });
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .get<Promocion[]>("/admin/promociones")
      .then(setPromos)
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/admin/promociones", {
        ...form,
        valor: Number(form.valor),
        vigenciaDesde: new Date(form.vigenciaDesde).toISOString(),
        vigenciaHasta: new Date(form.vigenciaHasta).toISOString(),
      });
      setForm({ ...form, nombre: "", descripcion: "" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const eliminar = async (id: string) => {
    await api.del(`/admin/promociones/${id}`);
    await load();
  };

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold text-crust-800">
        Promociones
      </h1>

      <form
        onSubmit={crear}
        className="mb-8 grid gap-3 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm sm:grid-cols-2"
      >
        <input
          placeholder="Nombre de la promo"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          className="rounded-lg border border-crust-200 px-3 py-2"
          required
        />
        <input
          placeholder="Descripción"
          value={form.descripcion}
          onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
          className="rounded-lg border border-crust-200 px-3 py-2"
        />
        <select
          value={form.tipoDescuento}
          onChange={(e) => setForm({ ...form, tipoDescuento: e.target.value })}
          className="rounded-lg border border-crust-200 px-3 py-2"
        >
          <option value="PORCENTAJE">% Porcentaje</option>
          <option value="MONTO_FIJO">Monto fijo</option>
          <option value="PRECIO_FIJO">Precio fijo</option>
        </select>
        <input
          type="number"
          value={form.valor}
          onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })}
          className="rounded-lg border border-crust-200 px-3 py-2"
        />
        <input
          type="date"
          value={form.vigenciaDesde}
          onChange={(e) => setForm({ ...form, vigenciaDesde: e.target.value })}
          className="rounded-lg border border-crust-200 px-3 py-2"
        />
        <input
          type="date"
          value={form.vigenciaHasta}
          onChange={(e) => setForm({ ...form, vigenciaHasta: e.target.value })}
          className="rounded-lg border border-crust-200 px-3 py-2"
        />
        {error && (
          <p className="text-sm text-red-600 sm:col-span-2">{error}</p>
        )}
        <button
          type="submit"
          className="rounded-lg bg-dj-terracota py-2 font-semibold text-white hover:bg-dj-cobre sm:col-span-2"
        >
          Crear promoción
        </button>
      </form>

      <div className="space-y-3">
        {promos.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-2xl border border-crust-100 bg-white p-4 shadow-sm"
          >
            <div>
              <p className="font-semibold text-crust-800">{p.nombre}</p>
              <p className="text-sm text-crust-500">
                {p.tipoDescuento} · {p.valor} ·{" "}
                {new Date(p.vigenciaDesde).toLocaleDateString("es-UY")} →{" "}
                {new Date(p.vigenciaHasta).toLocaleDateString("es-UY")}
              </p>
            </div>
            <button
              onClick={() => eliminar(p.id)}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              Eliminar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
