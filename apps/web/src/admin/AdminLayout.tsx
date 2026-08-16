import { useCallback } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useIdleLogout } from "../lib/useIdleLogout";
import { homeFor, navFor } from "./nav";

export default function AdminLayout() {
  const { user, logout } = useAuth();
  // Cada rol ve sólo las secciones que la API le permite.
  const nav = navFor(user?.role);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Cierre de sesión por inactividad, según la política del rol.
  const salir = useCallback(() => {
    logout();
    navigate("/admin/login", { replace: true });
  }, [logout, navigate]);
  const { restante } = useIdleLogout(salir, !!user);

  // Acceso directo por URL a una sección sin permiso → a su primera sección.
  const permitida =
    pathname === "/admin" || nav.some((i) => i.to !== "/admin" && pathname.startsWith(i.to));
  if (user && !permitida) return <Navigate to={homeFor(user.role)} replace />;

  return (
    <div className="flex min-h-screen bg-crust-50">
      <aside className="flex w-60 flex-col border-r border-crust-100 bg-white">
        <div className="flex items-center gap-2 border-b border-crust-100 px-5 py-4 font-display text-lg font-bold text-crust-700">
          <span>🥖</span> Don Julio
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => (
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
        {restante != null && (
          <div className="mb-4 rounded-xl bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-800">
            Tu sesión se cerrará por inactividad en {restante} s. Movés el mouse o tocás una tecla para seguir.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
