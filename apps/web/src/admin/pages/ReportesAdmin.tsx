import { useEffect, useState } from "react";
import { DashboardKpis, FOOD_COST_OBJETIVO } from "@donjulio/shared";
import { api } from "../../lib/api";
import { formatUYU } from "../../lib/format";

export default function ReportesAdmin() {
  const [kpi, setKpi] = useState<DashboardKpis | null>(null);

  useEffect(() => {
    api.get<DashboardKpis>("/admin/reportes/dashboard").then(setKpi).catch(() => {});
  }, []);

  if (!kpi) {
    return <div className="text-crust-500">Cargando reportes…</div>;
  }

  const fcColor =
    kpi.foodCostPromedioPct == null
      ? "text-crust-800"
      : kpi.foodCostPromedioPct <= FOOD_COST_OBJETIVO.max
        ? "text-green-600"
        : "text-red-600";

  const cards = [
    { label: "Ventas del período", value: formatUYU(kpi.ventasTotales), icon: "💰" },
    { label: "Pedidos", value: kpi.cantidadPedidos, icon: "🧾" },
    { label: "Ticket promedio", value: formatUYU(kpi.ticketPromedio), icon: "📈" },
    { label: "Merma (costo)", value: formatUYU(kpi.mermaTotalCosto), icon: "🗑️" },
  ];

  const maxCat = Math.max(1, ...kpi.ventasPorCategoria.map((c) => c.total));

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-bold text-crust-800">Reportes y KPIs</h1>
      <p className="mb-6 text-sm text-crust-500">
        {new Date(kpi.desde).toLocaleDateString("es-UY")} – {new Date(kpi.hasta).toLocaleDateString("es-UY")} (últimos 30 días)
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
            <div className="text-2xl">{c.icon}</div>
            <p className="mt-2 text-sm text-crust-500">{c.label}</p>
            <p className="text-2xl font-bold text-crust-800">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-crust-700">Ventas por categoría</h3>
          {kpi.ventasPorCategoria.length === 0 && <p className="text-sm text-crust-400">Sin datos.</p>}
          <div className="space-y-3">
            {kpi.ventasPorCategoria.map((c) => (
              <div key={c.categoria}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-crust-700">{c.categoria}</span>
                  <span className="font-medium">{formatUYU(c.total)}</span>
                </div>
                <div className="h-2 rounded-full bg-crust-100">
                  <div className="h-2 rounded-full bg-crust-500" style={{ width: `${(c.total / maxCat) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-crust-700">Food cost promedio</h3>
          <p className={`text-4xl font-bold ${fcColor}`}>
            {kpi.foodCostPromedioPct != null ? `${kpi.foodCostPromedioPct}%` : "—"}
          </p>
          <p className="mt-1 text-sm text-crust-500">Objetivo saludable: {FOOD_COST_OBJETIVO.min}–{FOOD_COST_OBJETIVO.max}%</p>

          <h3 className="mb-3 mt-6 font-semibold text-crust-700">Productos más vendidos</h3>
          <ul className="space-y-1 text-sm">
            {kpi.productosTop.map((p) => (
              <li key={p.nombre} className="flex justify-between border-b border-crust-50 py-1">
                <span className="text-crust-700">{p.nombre} <span className="text-crust-400">×{p.cantidad}</span></span>
                <span className="font-medium">{formatUYU(p.total)}</span>
              </li>
            ))}
            {kpi.productosTop.length === 0 && <li className="text-crust-400">Sin ventas en el período.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
