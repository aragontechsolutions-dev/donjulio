import { showToast } from "./toast";

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string) ?? "http://localhost:3000/api";

const TOKEN_KEY = "donjulio_token";

// sessionStorage: el token vive mientras la pestaña esté abierta. Al cerrar
// la ventana la sesión se pierde y hay que volver a iniciar sesión.
export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t: string) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY); // limpia sesiones viejas persistidas
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Mensaje de éxito por método para el toast automático. */
function successMsg(method: string): string {
  switch (method) {
    case "POST":
      return "Operación realizada ✓";
    case "PATCH":
    case "PUT":
      return "Cambios guardados ✓";
    case "DELETE":
      return "Eliminado ✓";
    default:
      return "Listo ✓";
  }
}

// No notificar en endpoints de autenticación (el flujo de login navega solo).
const isAuthPath = (path: string) => path.startsWith("/auth");

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const method = (options.method ?? "GET").toUpperCase();
  const isMutation = method !== "GET";

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    // Error de red / servidor caído (típico cold start de Render).
    if (isMutation && !isAuthPath(path)) {
      showToast("error", "Sin conexión con el servidor. Reintentá en unos segundos.");
    }
    throw new ApiError(0, "Sin conexión con el servidor");
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? message;
    } catch {
      /* sin body */
    }
    const finalMsg = Array.isArray(message) ? message.join(", ") : message;
    if (isMutation && !isAuthPath(path)) showToast("error", finalMsg);
    throw new ApiError(res.status, finalMsg);
  }

  if (isMutation && !isAuthPath(path)) showToast("success", successMsg(method));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  /** Sube un archivo (multipart). El navegador fija el Content-Type. */
  upload: async <T>(path: string, file: File): Promise<T> => {
    const token = tokenStore.get();
    const form = new FormData();
    form.append("file", file);
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
    } catch {
      showToast("error", "Sin conexión con el servidor. Reintentá en unos segundos.");
      throw new ApiError(0, "upload failed");
    }
    if (!res.ok) {
      // Mostrar el motivo real del backend (tipo/tamaño/bucket) en vez de un genérico.
      let message = "No se pudo subir la imagen";
      try {
        const body = await res.json();
        if (body?.message) message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
      } catch {
        /* sin body */
      }
      showToast("error", message);
      throw new ApiError(res.status, message);
    }
    showToast("success", "Imagen subida ✓");
    return res.json() as Promise<T>;
  },
};
