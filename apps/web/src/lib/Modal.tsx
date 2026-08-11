import { useEffect, type ReactNode } from "react";

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

/** Modal centrado con estilo propio (fondo oscuro, tarjeta, cierre con Esc / clic afuera). */
export default function Modal({ title, subtitle, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-[modalIn_.16s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold text-crust-800">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-crust-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-crust-400 hover:bg-crust-100 hover:text-crust-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
      <style>{`@keyframes modalIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
