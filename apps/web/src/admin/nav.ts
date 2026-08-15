import { UserRole } from "@donjulio/shared";

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  /** Roles que pueden ver la sección (según lo que permite la API). */
  roles: UserRole[];
}

const { ADMIN, CAJERO, PRODUCCION, MOZO, DELIVERY } = UserRole;

/**
 * Menú del panel. Los roles de cada ítem reflejan los permisos reales de los
 * endpoints: si una sección no aparece, es porque la API la rechazaría.
 */
export const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: "📊", end: true, roles: [ADMIN] },
  { to: "/admin/salon", label: "Salón / Mesas", icon: "🍽️", roles: [ADMIN, CAJERO, MOZO] },
  { to: "/admin/kds", label: "Cocina (KDS)", icon: "🔔", roles: [ADMIN, CAJERO, PRODUCCION, MOZO] },
  { to: "/admin/pedidos", label: "Pedidos", icon: "🧾", roles: [ADMIN, CAJERO, PRODUCCION, DELIVERY] },
  { to: "/admin/encargos", label: "Encargos", icon: "🎂", roles: [ADMIN, CAJERO, PRODUCCION] },
  { to: "/admin/reservas", label: "Reservas", icon: "📅", roles: [ADMIN, CAJERO, PRODUCCION, MOZO] },
  { to: "/admin/produccion", label: "Producción", icon: "👨‍🍳", roles: [ADMIN, PRODUCCION] },
  { to: "/admin/recetas", label: "Recetas y costos", icon: "📖", roles: [ADMIN, PRODUCCION] },
  { to: "/admin/insumos", label: "Insumos / Stock", icon: "📦", roles: [ADMIN, PRODUCCION] },
  { to: "/admin/mermas", label: "Mermas", icon: "🗑️", roles: [ADMIN, CAJERO, PRODUCCION] },
  { to: "/admin/trazabilidad", label: "Trazabilidad", icon: "🔎", roles: [ADMIN, PRODUCCION] },
  { to: "/admin/caja", label: "Caja", icon: "💵", roles: [ADMIN, CAJERO] },
  { to: "/admin/reportes", label: "Reportes", icon: "📈", roles: [ADMIN] },
  { to: "/admin/productos", label: "Productos", icon: "🥖", roles: [ADMIN] },
  { to: "/admin/promociones", label: "Promociones", icon: "🏷️", roles: [ADMIN] },
  { to: "/admin/cms", label: "Contenido web", icon: "✏️", roles: [ADMIN] },
  { to: "/admin/turnos", label: "Turnos", icon: "⏱️", roles: [ADMIN, CAJERO, PRODUCCION, MOZO] },
  { to: "/admin/usuarios", label: "Usuarios", icon: "👤", roles: [ADMIN] },
];

/** Secciones visibles para un rol (tolerante al formato del rol recibido). */
export const navFor = (role?: string): NavItem[] => {
  const r = (role ?? "").trim().toUpperCase();
  if (!r) return [];
  return NAV.filter((i) => i.roles.some((x) => x === r));
};

/** Primera sección disponible: a dónde mandar a quien no ve el Dashboard. */
export const homeFor = (role?: string): string => navFor(role)[0]?.to ?? "/admin";
