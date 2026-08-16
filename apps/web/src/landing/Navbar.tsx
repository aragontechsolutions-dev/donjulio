import { useNavigate } from "react-router-dom";
import { scrollToSection, useScrollSpy } from "../lib/useScrollSpy";
import { LogoHorizontal } from "./Logo";

const LINKS = [
  { id: "inicio", label: "Inicio" },
  { id: "nosotros", label: "Nosotros" },
  { id: "productos", label: "Productos" },
  { id: "promociones", label: "Promociones" },
  { id: "galeria", label: "Galería" },
  { id: "ubicacion", label: "Cómo llegar" },
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
    <header className="sticky top-0 z-50 border-b border-dj-arena bg-dj-papel/95 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <button onClick={handleLogoClick} title="Don Julio" className="shrink-0">
          <LogoHorizontal
            tinta="#22211F"
            acento="#C0561D"
            className="h-11 w-auto md:h-12"
          />
        </button>

        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => scrollToSection(l.id)}
                className={`relative px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                  active === l.id
                    ? "text-dj-terracota"
                    : "text-dj-grafito hover:text-dj-carbon"
                }`}
              >
                {l.label}
                {/* Subrayado fino en vez de píldora: más cerca del manual. */}
                <span
                  aria-hidden
                  className={`absolute inset-x-3 -bottom-0.5 h-px origin-left bg-dj-terracota transition-transform duration-300 ${
                    active === l.id ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>

        <button
          onClick={() => scrollToSection("productos")}
          className="shrink-0 rounded-full bg-dj-carbon px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-dj-papel transition-colors hover:bg-dj-terracota"
        >
          Ver carta
        </button>
      </nav>

      {/* En pantallas chicas los siete enlaces no entran en una fila: van en una
          tira que se desliza con el dedo, en vez de esconderse tras un menú. */}
      <ul className="flex gap-1 overflow-x-auto border-t border-dj-arena/70 px-4 py-2 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {LINKS.map((l) => (
          <li key={l.id}>
            <button
              onClick={() => scrollToSection(l.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                active === l.id
                  ? "bg-dj-carbon text-dj-papel"
                  : "text-dj-grafito hover:bg-dj-crema"
              }`}
            >
              {l.label}
            </button>
          </li>
        ))}
      </ul>
    </header>
  );
}
