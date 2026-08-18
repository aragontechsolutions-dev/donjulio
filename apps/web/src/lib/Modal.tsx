import { useEffect, type ReactNode } from "react";

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Ancho máximo de la tarjeta (clase de Tailwind). Por defecto `max-w-md`. */
  ancho?: string;
}

/** Modal centrado con estilo propio (fondo oscuro, tarjeta, cierre con Esc / clic afuera). */
export default function Modal({ title, subtitle, onClose, children, ancho = "max-w-md" }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      {/* min-w-0: sin esto un contenido ancho (una tabla con min-w, por
          ejemplo) estira la tarjeta y se sale de la pantalla del teléfono. */}
      <div
        className={`flex max-h-[88dvh] w-full min-w-0 ${ancho} flex-col rounded-2xl bg-white p-4 shadow-xl sm:p-6 animate-[modalIn_.16s_ease-out]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold text-crust-800">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-crust-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-1 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-crust-400 hover:bg-crust-100 hover:text-crust-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="-mx-1 min-h-0 min-w-0 flex-1 overflow-y-auto px-1">{children}</div>
      </div>
      <style>{`@keyframes modalIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
