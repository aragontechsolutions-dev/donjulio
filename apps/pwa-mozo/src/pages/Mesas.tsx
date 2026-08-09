import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { cacheGet, cacheSet } from "../lib/db";
import { formatUYU } from "../lib/format";
import { useAuth } from "../lib/auth";
import type { MesaSel } from "../App";

interface Mesa {
  id: string;
  numero: number;
  capacidad: number;
  status: string;
  pedidoAbierto: { total: number; itemsCount: number; mozo: string | null } | null;
}

const COLOR: Record<string, string> = {
  LIBRE: "bg-green-50 border-green-300",
  OCUPADA: "bg-crust-100 border-crust-400",
  RESERVADA: "bg-amber-50 border-amber-300",
  PENDIENTE_PAGO: "bg-red-50 border-red-300",
};

export default function Mesas({ onSelect }: { onSelect: (m: MesaSel) => void }) {
  const { user, logout } = useAuth();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    api
      .get<Mesa[]>("/admin/salon/mesas")
      .then((m) => {
        setMesas(m);
        setFromCache(false);
        cacheSet("mesas", m);
      })
      .catch(async () => {
        const cached = await cacheGet<Mesa[]>("mesas");
        if (cached) {
          setMesas(cached);
          setFromCache(true);
        }
      });
  }, []);

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-crust-800">Mesas</h1>
          <p className="text-xs text-crust-500">
            {user?.nombre}
            {fromCache && " · datos en caché (offline)"}
          </p>
        </div>
        <button onClick={logout} className="rounded-lg border border-crust-200 px-3 py-1.5 text-sm text-crust-600">
          Salir
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {mesas.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect({ id: m.id, numero: m.numero })}
            className={`min-h-[110px] rounded-2xl border-2 p-4 text-left active:scale-95 ${COLOR[m.status] ?? "border-crust-200"}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-3xl font-bold text-crust-800">{m.numero}</span>
              <span className="text-xs text-crust-500">👥 {m.capacidad}</span>
            </div>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-crust-500">{m.status}</p>
            {m.pedidoAbierto && (
              <p className="mt-1 text-sm font-semibold text-crust-700">{formatUYU(m.pedidoAbierto.total)}</p>
            )}
          </button>
        ))}
        {mesas.length === 0 && <p className="col-span-full text-crust-400">Sin mesas disponibles.</p>}
      </div>
    </div>
  );
}
