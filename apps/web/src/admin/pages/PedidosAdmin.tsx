import { useEffect, useState } from "react";
import { nextOrderStatuses, OrderStatus, OrderType } from "@donjulio/shared";
import { api } from "../../lib/api";
import { formatUYU } from "../../lib/format";

interface Pedido {
  id: string;
  numero: number;
  status: OrderStatus;
  orderType: OrderType;
  total: string;
  createdAt: string;
}

export default function PedidosAdmin() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api.get<Pedido[]>("/admin/pedidos").then(setPedidos).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const cambiarEstado = async (p: Pedido, status: OrderStatus) => {
    setError(null);
    try {
      await api.patch(`/admin/pedidos/${p.id}/status`, { status });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold text-crust-800">
        Pedidos
      </h1>
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="space-y-3">
        {pedidos.map((p) => {
          const opciones = nextOrderStatuses(p.status, p.orderType);
          return (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-crust-100 bg-white p-4 shadow-sm"
            >
              <div>
                <p className="font-semibold text-crust-800">
                  Pedido #{p.numero}{" "}
                  <span className="ml-2 rounded-full bg-crust-100 px-2 py-0.5 text-xs text-crust-600">
                    {p.orderType}
                  </span>
                </p>
                <p className="text-sm text-crust-500">
                  {new Date(p.createdAt).toLocaleString("es-UY")} ·{" "}
                  {formatUYU(p.total)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-dj-terracota px-3 py-1 text-sm font-medium text-white">
                  {p.status}
                </span>
                {opciones.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) =>
                      e.target.value &&
                      cambiarEstado(p, e.target.value as OrderStatus)
                    }
                    className="rounded-lg border border-crust-200 px-2 py-1.5 text-sm"
                  >
                    <option value="">Cambiar a…</option>
                    {opciones.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}
        {pedidos.length === 0 && (
          <p className="rounded-2xl border border-crust-100 bg-white p-8 text-center text-crust-400">
            No hay pedidos todavía.
          </p>
        )}
      </div>
    </div>
  );
}
