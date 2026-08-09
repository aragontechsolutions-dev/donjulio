import { useCallback, useEffect, useState } from "react";
import { OrderItemStatus } from "@donjulio/shared";
import { api } from "../../lib/api";

interface Station { id: string; nombre: string; tipo: string }
interface KdsItem {
  id: string;
  producto: string;
  cantidad: number;
  notas: string | null;
  status: string;
  estacion: string;
  modificadores: string[];
  pedidoNumero: number;
  mesa: number | null;
  canal: string;
  desde: string;
}

const NEXT: Record<string, { label: string; status: OrderItemStatus } | null> = {
  PENDIENTE: { label: "Empezar", status: OrderItemStatus.EN_PREPARACION },
  EN_PREPARACION: { label: "Listo ✓", status: OrderItemStatus.LISTO },
  LISTO: { label: "Entregar", status: OrderItemStatus.ENTREGADO },
};

const STATUS_STYLE: Record<string, string> = {
  PENDIENTE: "border-l-4 border-red-400",
  EN_PREPARACION: "border-l-4 border-amber-400",
  LISTO: "border-l-4 border-green-500",
};

function minsAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return m <= 0 ? "recién" : `${m} min`;
}

export default function KdsAdmin() {
  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState<string>("");
  const [items, setItems] = useState<KdsItem[]>([]);
  const [incluirListos, setIncluirListos] = useState(true);

  useEffect(() => {
    api.get<Station[]>("/admin/kds/estaciones").then(setStations).catch(() => {});
  }, []);

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (stationId) qs.set("stationId", stationId);
    if (incluirListos) qs.set("incluirListos", "true");
    api.get<KdsItem[]>(`/admin/kds?${qs.toString()}`).then(setItems).catch(() => {});
  }, [stationId, incluirListos]);

  // Auto-refresh cada 5s (sin realtime).
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const avanzar = async (id: string, status: OrderItemStatus) => {
    await api.patch(`/admin/kds/items/${id}`, { status });
    load();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-crust-800">Cocina — KDS</h1>
        <label className="flex items-center gap-2 text-sm text-crust-600">
          <input type="checkbox" checked={incluirListos} onChange={(e) => setIncluirListos(e.target.checked)} />
          Mostrar listos
        </label>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <button onClick={() => setStationId("")} className={`rounded-full px-4 py-1.5 text-sm font-medium ${stationId === "" ? "bg-crust-600 text-white" : "bg-crust-100 text-crust-700"}`}>
          Todas
        </button>
        {stations.map((s) => (
          <button key={s.id} onClick={() => setStationId(s.id)} className={`rounded-full px-4 py-1.5 text-sm font-medium ${stationId === s.id ? "bg-crust-600 text-white" : "bg-crust-100 text-crust-700"}`}>
            {s.nombre}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-crust-100 bg-white p-10 text-center text-crust-400">
          🎉 No hay comandas pendientes.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((it) => {
            const next = NEXT[it.status];
            return (
              <div key={it.id} className={`rounded-xl bg-white p-4 shadow-sm ${STATUS_STYLE[it.status] ?? ""}`}>
                <div className="flex items-start justify-between">
                  <span className="text-lg font-bold text-crust-900">{it.cantidad}× {it.producto}</span>
                  <span className="text-xs text-crust-400">{minsAgo(it.desde)}</span>
                </div>
                <p className="text-xs text-crust-500">
                  {it.mesa ? `Mesa ${it.mesa}` : it.canal} · #{it.pedidoNumero} · {it.estacion}
                </p>
                {it.modificadores.length > 0 && (
                  <p className="mt-1 text-sm text-crust-600">+ {it.modificadores.join(", ")}</p>
                )}
                {it.notas && <p className="mt-1 text-sm italic text-amber-700">“{it.notas}”</p>}
                <div className="mt-3 flex items-center justify-between">
                  <span className="rounded-full bg-crust-100 px-2 py-0.5 text-xs font-semibold text-crust-600">{it.status}</span>
                  {next && (
                    <button onClick={() => avanzar(it.id, next.status)} className="rounded-lg bg-crust-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-crust-700">
                      {next.label}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
