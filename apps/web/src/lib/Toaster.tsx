import { useEffect, useState } from "react";
import { subscribeToast, type ToastItem } from "./toast";

const STYLE: Record<string, string> = {
  success: "bg-green-600",
  error: "bg-red-600",
  info: "bg-dj-terracota",
};
const ICON: Record<string, string> = { success: "✓", error: "✕", info: "ℹ" };
const DURATION = 3500;

/** Contenedor de toasts: apila arriba a la derecha y se auto-cierran. */
export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(
    () =>
      subscribeToast((t) => {
        setItems((prev) => [...prev, t]);
        setTimeout(() => {
          setItems((prev) => prev.filter((x) => x.id !== t.id));
        }, DURATION);
      }),
    [],
  );

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
          className={`pointer-events-auto flex cursor-pointer items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${STYLE[t.type]} animate-[toastIn_.18s_ease-out]`}
          role="status"
        >
          <span className="mt-0.5 font-bold">{ICON[t.type]}</span>
          <span className="flex-1">{t.msg}</span>
        </div>
      ))}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
