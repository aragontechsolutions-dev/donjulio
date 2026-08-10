export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  type: ToastType;
  msg: string;
}

type Listener = (t: ToastItem) => void;

let listeners: Listener[] = [];
let seq = 0;

export function subscribeToast(l: Listener): () => void {
  listeners.push(l);
  return () => {
    listeners = listeners.filter((x) => x !== l);
  };
}

export function showToast(type: ToastType, msg: string) {
  const item: ToastItem = { id: ++seq, type, msg };
  listeners.forEach((l) => l(item));
}

/** Atajos para usar desde cualquier pantalla. */
export const toast = {
  success: (m: string) => showToast("success", m),
  error: (m: string) => showToast("error", m),
  info: (m: string) => showToast("info", m),
};
