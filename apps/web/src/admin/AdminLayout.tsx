import { useCallback, useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useIdleLogout } from "../lib/useIdleLogout";
import { homeFor, navFor } from "./nav";
import { LogoHorizontal, Monograma } from "../lib/Logo";

export default function AdminLayout() {
  const { user, logout } = useAuth();
  // Cada rol ve sólo las secciones que la API le permite.
  const nav = navFor(user?.role);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // En teléfono el menú es un cajón que se abre por encima del contenido.
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Cierre de sesión por inactividad, según la política del rol.
  const salir = useCallback(() => {
    logout();
    navigate("/admin/login", { replace: true });
  }, [logout, navigate]);
  const { restante } = useIdleLogout(salir, !!user);

  // Navegar cierra el cajón: si no, tapa la sección recién elegida.
  useEffect(() => setMenuAbierto(false), [pathname]);

  // Con el cajón abierto no se scrollea lo de atrás, y Escape lo cierra.
  useEffect(() => {
    if (!menuAbierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setMenuAbierto(false);
    window.addEventListener("keydown", alTeclear);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener("keydown", alTeclear);
    };
  }, [menuAbierto]);

  // Acceso directo por URL a una sección sin permiso → a su primera sección.
  const permitida =
    pathname === "/admin" || nav.some((i) => i.to !== "/admin" && pathname.startsWith(i.to));
  if (user && !permitida) return <Navigate to={homeFor(user.role)} replace />;

  const seccion = nav.find((i) => i.to !== "/admin" && pathname.startsWith(i.to)) ?? nav[0];

  return (
    <div className="panel-admin flex min-h-[100dvh] bg-crust-50">
      {/* Fondo oscuro detrás del cajón; tocarlo lo cierra. */}
      {menuAbierto && (
        <div
          onClick={() => setMenuAbierto(false)}
          className="fixed inset-0 z-40 bg-dj-carbon/60 lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Barra lateral en carbón, como la fachada del local.
          En teléfono entra deslizándose; desde lg queda fija en su columna. */}
      <aside
        id="menu-lateral"
        className={`fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col bg-dj-carbon transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-60 lg:max-w-none lg:translate-x-0 ${
          menuAbierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-dj-papel/10 px-5 py-5">
          <LogoHorizontal tinta="#F5F0E6" acento="#C9A56B" className="h-10 w-auto" />
          <button
            onClick={() => setMenuAbierto(false)}
            className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-2xl leading-none text-dj-papel/70 hover:bg-dj-papel/10 lg:hidden"
            aria-label="Cerrar menú"
          >
            ×
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-sm px-3 py-3 text-sm font-medium transition-colors lg:py-2 ${
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
        <div className="border-t border-dj-papel/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="text-sm font-medium text-dj-papel/90">{user?.nombre}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-dj-dorado">
            {user?.role}
          </p>
          <button
            onClick={() => {
              logout();
              navigate("/admin/login");
            }}
            className="mt-3 w-full rounded-full border border-dj-papel/25 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dj-papel/80 transition-colors hover:border-dj-terracota hover:bg-dj-terracota hover:text-dj-papel"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabecera de teléfono: abre el menú y dice dónde estás. */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-crust-200 bg-dj-carbon px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:hidden">
          <button
            onClick={() => setMenuAbierto(true)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-dj-papel hover:bg-dj-papel/10"
            aria-label="Abrir menú"
            aria-expanded={menuAbierto}
            aria-controls="menu-lateral"
          >
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h16M3 11h16M3 16h16" />
              </g>
            </svg>
          </button>
          <Monograma tinta="#F5F0E6" acento="#C9A56B" className="h-7 w-auto shrink-0" />
          <span className="truncate font-display text-base font-semibold text-dj-papel">
            {seccion?.label ?? "Panel"}
          </span>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 lg:overflow-auto lg:p-8">
          {restante != null && (
            <div className="mb-4 rounded-xl bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-800">
              Tu sesión se cerrará por inactividad en {restante} s. Movés el mouse o tocás una tecla para seguir.
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
