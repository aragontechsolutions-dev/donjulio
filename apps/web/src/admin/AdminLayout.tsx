import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: "📊", end: true },
  { to: "/admin/salon", label: "Salón / Mesas", icon: "🍽️" },
  { to: "/admin/kds", label: "Cocina (KDS)", icon: "🔔" },
  { to: "/admin/pedidos", label: "Pedidos", icon: "🧾" },
  { to: "/admin/produccion", label: "Producción", icon: "👨‍🍳" },
  { to: "/admin/recetas", label: "Recetas y costos", icon: "📖" },
  { to: "/admin/insumos", label: "Insumos / Stock", icon: "📦" },
  { to: "/admin/mermas", label: "Mermas", icon: "🗑️" },
  { to: "/admin/caja", label: "Caja", icon: "💵" },
  { to: "/admin/reportes", label: "Reportes", icon: "📈" },
  { to: "/admin/productos", label: "Productos", icon: "🥖" },
  { to: "/admin/promociones", label: "Promociones", icon: "🏷️" },
  { to: "/admin/cms", label: "Contenido web", icon: "✏️" },
  { to: "/admin/usuarios", label: "Usuarios", icon: "👤" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-crust-50">
      <aside className="flex w-60 flex-col border-r border-crust-100 bg-white">
        <div className="flex items-center gap-2 border-b border-crust-100 px-5 py-4 font-display text-lg font-bold text-crust-700">
          <span>🥖</span> Don Julio
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-crust-600 text-white"
                    : "text-crust-700 hover:bg-crust-100"
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-crust-100 p-3">
          <p className="px-2 text-xs text-crust-500">{user?.nombre}</p>
          <p className="px-2 text-xs text-crust-400">{user?.role}</p>
          <button
            onClick={() => {
              logout();
              navigate("/admin/login");
            }}
            className="mt-2 w-full rounded-lg border border-crust-200 px-3 py-1.5 text-sm text-crust-700 hover:bg-crust-100"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
