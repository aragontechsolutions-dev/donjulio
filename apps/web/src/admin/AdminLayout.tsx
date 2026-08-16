import { useCallback } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useIdleLogout } from "../lib/useIdleLogout";
import { homeFor, navFor } from "./nav";
import { LogoHorizontal } from "../lib/Logo";

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
      {/* Barra lateral en carbón, como la fachada del local. */}
      <aside className="flex w-60 flex-col bg-dj-carbon">
        <div className="border-b border-dj-papel/10 px-5 py-5">
          <LogoHorizontal tinta="#F5F0E6" acento="#C9A56B" className="h-10 w-auto" />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-dj-terracota text-dj-papel"
                    : "text-dj-papel/70 hover:bg-dj-papel/10 hover:text-dj-papel"
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-dj-papel/10 p-4">
          <p className="text-sm font-medium text-dj-papel/90">{user?.nombre}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-dj-dorado">
            {user?.role}
          </p>
          <button
            onClick={() => {
              logout();
              navigate("/admin/login");
            }}
            className="mt-3 w-full rounded-full border border-dj-papel/25 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-dj-papel/80 transition-colors hover:border-dj-terracota hover:bg-dj-terracota hover:text-dj-papel"
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
