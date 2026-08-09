import { useNavigate } from "react-router-dom";
import { scrollToSection, useScrollSpy } from "../lib/useScrollSpy";

const LINKS = [
  { id: "inicio", label: "Inicio" },
  { id: "nosotros", label: "Nosotros" },
  { id: "productos", label: "Productos" },
  { id: "promociones", label: "Promociones" },
  { id: "galeria", label: "Galería" },
  { id: "contacto", label: "Contacto" },
];

export default function Navbar() {
  const active = useScrollSpy(LINKS.map((l) => l.id));
  const navigate = useNavigate();

  // Acceso oculto al panel: Shift+Ctrl+click en el logo.
  // NOTA: es sólo UX; la seguridad real recae en Auth + guards del backend.
  const handleLogoClick = (e: React.MouseEvent) => {
    if (e.shiftKey && e.ctrlKey) {
      e.preventDefault();
      navigate("/admin/login");
    } else {
      scrollToSection("inicio");
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-crust-100 bg-masa/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <button
          onClick={handleLogoClick}
          className="flex items-center gap-2 font-display text-xl font-bold text-crust-700"
          title="Don Julio"
        >
          <span aria-hidden>🥖</span>
          Don Julio
        </button>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => scrollToSection(l.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active === l.id
                    ? "bg-crust-600 text-white"
                    : "text-crust-700 hover:bg-crust-100"
                }`}
              >
                {l.label}
              </button>
            </li>
          ))}
        </ul>

        <button
          onClick={() => scrollToSection("productos")}
          className="rounded-full bg-crust-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-105"
        >
          Ver carta
        </button>
      </nav>
    </header>
  );
}
