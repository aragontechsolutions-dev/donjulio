import { UserRole } from "./enums";

const { ADMIN, CAJERO, PRODUCCION, MOZO, DELIVERY } = UserRole;

/**
 * Qué puede hacer cada rol, por acción concreta.
 *
 * El panel usa esto para no ofrecer botones que la API va a rechazar con un
 * 403: hasta ahora un usuario de Producción podía llenar el formulario de un
 * encargo entero y recién al enviarlo se enteraba de que no le correspondía.
 *
 * `verbo` y `ruta` son el endpoint que respalda la acción. No se usan en
 * tiempo de ejecución: están para que `pnpm check:permisos` compare esta tabla
 * contra los @Roles reales de los controladores y avise si se desincronizan.
 */
export interface Capacidad {
  verbo: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  ruta: string;
  roles: UserRole[];
}

export const CAPACIDADES = {
  // ── Encargos: tomarlos y cobrar la seña es tarea de caja ──
  "encargos.crear": { verbo: "POST", ruta: "/admin/encargos", roles: [ADMIN, CAJERO] },
  "encargos.cambiarEstado": {
    verbo: "PATCH",
    ruta: "/admin/encargos/:id",
    roles: [ADMIN, CAJERO, PRODUCCION],
  },
  "encargos.registrarPago": {
    verbo: "POST",
    ruta: "/admin/encargos/:id/deposito",
    roles: [ADMIN, CAJERO],
  },
  "encargos.eliminar": { verbo: "DELETE", ruta: "/admin/encargos/:id", roles: [ADMIN] },

  // ── Salón: operarlo es de todos; rediseñar el plano es del admin ──
  "salon.editarPlano": { verbo: "PATCH", ruta: "/admin/salon/plano", roles: [ADMIN] },
  "salon.editarMesas": { verbo: "POST", ruta: "/admin/salon/mesas", roles: [ADMIN] },
  "salon.editarZonas": { verbo: "POST", ruta: "/admin/salon/zonas", roles: [ADMIN] },
  "salon.rotarQr": {
    verbo: "POST",
    ruta: "/admin/salon/mesas/:id/rotar-token",
    roles: [ADMIN],
  },
  "salon.verMesas": {
    verbo: "GET",
    ruta: "/admin/salon/mesas",
    roles: [ADMIN, CAJERO, MOZO],
  },

  // ── Reservas ──
  "reservas.cancelar": { verbo: "DELETE", ruta: "/admin/reservas/:id", roles: [ADMIN, CAJERO] },

  // ── Mermas: el insumo sólo lo ve quien maneja stock ──
  "inventario.verInsumos": {
    verbo: "GET",
    ruta: "/admin/inventario/insumos/opciones",
    roles: [ADMIN, PRODUCCION],
  },

  // ── Turnos: fichar es de todos; el historial y el tablet, no ──
  "turnos.verHistorial": { verbo: "GET", ruta: "/admin/turnos", roles: [ADMIN, CAJERO] },
  "turnos.verHorarios": { verbo: "GET", ruta: "/admin/horarios", roles: [ADMIN, CAJERO] },
  "turnos.editarHorarios": { verbo: "PUT", ruta: "/admin/horarios", roles: [ADMIN] },
  "turnos.configurarKiosco": { verbo: "GET", ruta: "/admin/turnos/kiosco", roles: [ADMIN] },
  "usuarios.listar": { verbo: "GET", ruta: "/admin/usuarios", roles: [ADMIN] },

  // ── Pedidos ──
  "pedidos.cambiarEstado": {
    verbo: "PATCH",
    ruta: "/admin/pedidos/:id/status",
    roles: [ADMIN, CAJERO, PRODUCCION, DELIVERY],
  },

  // ── Catálogo ──
  "productos.editar": {
    verbo: "POST",
    ruta: "/admin/productos",
    roles: [ADMIN, PRODUCCION],
  },
  "productos.eliminar": { verbo: "DELETE", ruta: "/admin/productos/:id", roles: [ADMIN] },
  "categorias.editar": { verbo: "POST", ruta: "/admin/categorias", roles: [ADMIN] },
} as const satisfies Record<string, Capacidad>;

export type Accion = keyof typeof CAPACIDADES;

/** ¿El rol puede hacer esta acción? Sin rol (sesión aún cargando) es que no. */
export const puede = (role: string | undefined, accion: Accion): boolean => {
  const r = (role ?? "").trim().toUpperCase();
  if (!r) return false;
  return (CAPACIDADES[accion].roles as readonly string[]).includes(r);
};
