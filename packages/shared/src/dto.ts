import {
  OrderChannel,
  OrderStatus,
  OrderType,
  PaymentMethod,
  UserRole,
} from "./enums";

/** Usuario autenticado tal como lo expone la API (sin secretos). */
export interface AuthUser {
  id: string;
  email: string;
  nombre: string;
  role: UserRole;
}

/** Respuesta del login del panel. */
export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

/** Producto del catálogo público. */
export interface ProductoPublic {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  imagenUrl: string | null;
  destacado: boolean;
  disponible: boolean;
  categoriaId: string;
}

export interface CategoriaPublic {
  id: string;
  nombre: string;
  slug: string;
  orden: number;
  productos?: ProductoPublic[];
}

/** Ítem del carrito enviado por el frontend al crear un pedido. */
export interface CartItemInput {
  productoId: string;
  cantidad: number;
  /** IDs de modificadores seleccionados (café, etc.). Opcional. */
  modificadorIds?: string[];
  notas?: string;
}

export interface CreateOrderInput {
  channel: OrderChannel;
  orderType: OrderType;
  items: CartItemInput[];
  cliente?: {
    nombre: string;
    telefono: string;
    email?: string;
    direccion?: string;
  };
  notas?: string;
}

export interface OrderItemView {
  id: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  notas: string | null;
}

export interface OrderView {
  id: string;
  numero: number;
  status: OrderStatus;
  orderType: OrderType;
  channel: OrderChannel;
  total: number;
  metodoPago: PaymentMethod | null;
  items: OrderItemView[];
  createdAt: string;
}

/** Resultado de crear un intento de pago (mock o real). */
export interface PaymentIntentResult {
  provider: string;
  paymentId: string;
  status: string;
  /** URL de checkout para redirección (Checkout Pro) o null si es embebido. */
  checkoutUrl: string | null;
  /** Datos crudos del proveedor (útil para debugging). */
  raw?: Record<string, unknown>;
}

/** Resultado de emitir un CFE (mock o real vía proveedor homologado). */
export interface CfeEmitResult {
  provider: string;
  caeNumero: string;
  caeVencimiento: string;
  serie: string;
  numero: number;
  hash: string;
  qrUrl: string | null;
  raw?: Record<string, unknown>;
}
