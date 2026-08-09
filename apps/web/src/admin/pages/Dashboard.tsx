import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { formatUYU } from "../../lib/format";

interface Pedido {
  id: string;
  numero: number;
  status: string;
  total: string;
  createdAt: string;
}

export default function Dashboard() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  useEffect(() => {
    api.get<Pedido[]>("/admin/pedidos").then(setPedidos).catch(() => {});
  }, []);

  const hoy = new Date().toDateString();
  const pedidosHoy = pedidos.filter(
    (p) => new Date(p.createdAt).toDateString() === hoy,
  );
  const ventasHoy = pedidosHoy
    .filter((p) => !["CANCELADO", "RECHAZADO"].includes(p.status))
    .reduce((a, p) => a + Number(p.total), 0);
  const enPrep = pedidos.filter((p) =>
    ["PAGADO", "EN_PREPARACION"].includes(p.status),
  ).length;
  const ticket = pedidosHoy.length ? ventasHoy / pedidosHoy.length : 0;

  const kpis = [
    { label: "Ventas de hoy", value: formatUYU(ventasHoy), icon: "💰" },
    { label: "Pedidos de hoy", value: pedidosHoy.length, icon: "🧾" },
    { label: "En preparación", value: enPrep, icon: "👨‍🍳" },
    { label: "Ticket promedio", value: formatUYU(ticket), icon: "📈" },
  ];

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold text-crust-800">
        Dashboard
      </h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm"
          >
            <div className="text-2xl">{k.icon}</div>
            <p className="mt-2 text-sm text-crust-500">{k.label}</p>
            <p className="text-2xl font-bold text-crust-800">{k.value}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 font-display text-lg font-semibold text-crust-700">
        Últimos pedidos
      </h2>
      <div className="overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-crust-50 text-left text-crust-600">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.slice(0, 10).map((p) => (
              <tr key={p.id} className="border-t border-crust-50">
                <td className="px-4 py-3 font-medium">#{p.numero}</td>
                <td className="px-4 py-3">{p.status}</td>
                <td className="px-4 py-3 text-right">{formatUYU(p.total)}</td>
                <td className="px-4 py-3 text-right text-crust-500">
                  {new Date(p.createdAt).toLocaleString("es-UY")}
                </td>
              </tr>
            ))}
            {pedidos.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-crust-400">
                  Aún no hay pedidos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
