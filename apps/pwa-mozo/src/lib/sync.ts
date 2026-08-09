import { api } from "./api";
import { outboxAll, outboxDelete, type OutboxComanda } from "./db";

let flushing = false;

/**
 * Reenvía las comandas encoladas al backend. El endpoint es idempotente
 * (clientTxnId), así que reintentar es seguro. Devuelve cuántas se sincronizaron.
 */
export async function flushOutbox(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let ok = 0;
  try {
    const pendientes = await outboxAll();
    // Orden FIFO por antigüedad.
    pendientes.sort((a, b) => a.createdAt - b.createdAt);
    for (const c of pendientes) {
      try {
        await api.post(`/admin/salon/mesas/${c.mesaId}/comanda`, {
          items: c.items,
          clientTxnId: c.id,
        });
        await outboxDelete(c.id);
        ok++;
      } catch {
        // Si falla una, cortamos: probablemente volvió a caer la red.
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return ok;
}

export function onConnectivityChange(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export type { OutboxComanda };
