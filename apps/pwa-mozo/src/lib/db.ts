/**
 * Almacenamiento local (IndexedDB) sin dependencias.
 * - `cache`: últimos datos leídos (mesas, menú) para funcionar sin red.
 * - `outbox`: comandas encoladas mientras no hay conexión, con clientTxnId
 *   para que el backend las procese de forma idempotente al reintentar.
 */

const DB_NAME = "donjulio-mozo";
const DB_VERSION = 1;

export interface OutboxComanda {
  id: string; // = clientTxnId
  mesaId: string;
  mesaNumero: number;
  items: { productoId: string; cantidad: number; modificadorIds?: string[]; notas?: string }[];
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ---- Cache ----
export const cacheGet = <T>(key: string) => tx<T>("cache", "readonly", (s) => s.get(key));
export const cacheSet = (key: string, val: unknown) =>
  tx("cache", "readwrite", (s) => s.put(val, key));

// ---- Outbox ----
export const outboxAdd = (c: OutboxComanda) => tx("outbox", "readwrite", (s) => s.put(c));
export const outboxAll = () => tx<OutboxComanda[]>("outbox", "readonly", (s) => s.getAll());
export const outboxDelete = (id: string) => tx("outbox", "readwrite", (s) => s.delete(id));

export function uuid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
