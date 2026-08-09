import { formatUYU, DIAS } from "../lib/format";
import { scrollToSection } from "../lib/useScrollSpy";
import type {
  Contacto,
  Horario,
  LandingData,
  MenuCategoria,
  Promocion,
  Testimonio,
} from "./types";

export function Hero({ contenido }: { contenido: Record<string, string> }) {
  return (
    <section
      id="inicio"
      className="relative overflow-hidden bg-gradient-to-b from-crust-100 to-masa"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-20 md:grid-cols-2 md:py-28">
        <div>
          <p className="mb-3 inline-block rounded-full bg-crust-200/60 px-3 py-1 text-sm font-semibold text-crust-700">
            Maldonado · Uruguay
          </p>
          <h1 className="font-display text-4xl font-extrabold leading-tight text-crust-900 md:text-6xl">
            {contenido["hero.titulo"] ?? "Panadería Artesanal Don Julio"}
          </h1>
          <p className="mt-4 max-w-md text-lg text-crust-700">
            {contenido["hero.subtitulo"] ??
              "Pan de verdad, horneado cada día."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={() => scrollToSection("productos")}
              className="rounded-full bg-crust-600 px-6 py-3 font-semibold text-white shadow-md transition-transform hover:scale-105"
            >
              Ver productos
            </button>
            <button
              onClick={() => scrollToSection("contacto")}
              className="rounded-full border border-crust-300 px-6 py-3 font-semibold text-crust-700 transition-colors hover:bg-crust-100"
            >
              Cómo llegar
            </button>
          </div>
        </div>
        <div className="grid place-items-center">
          <div className="grid h-64 w-64 place-items-center rounded-full bg-crust-200 text-[10rem] shadow-inner md:h-80 md:w-80">
            🥐
          </div>
        </div>
      </div>
    </section>
  );
}

export function Nosotros({ contenido }: { contenido: Record<string, string> }) {
  return (
    <section id="nosotros" className="mx-auto max-w-4xl px-4 py-20 text-center">
      <h2 className="font-display text-3xl font-bold text-crust-800 md:text-4xl">
        {contenido["historia.titulo"] ?? "Nuestra Historia"}
      </h2>
      <div className="mx-auto mt-3 h-1 w-16 rounded-full bg-crust-400" />
      <p className="mt-6 text-lg leading-relaxed text-crust-700">
        {contenido["historia.texto"] ??
          "Amasamos con las manos y el corazón desde hace años."}
      </p>
    </section>
  );
}

export function Productos({ categorias }: { categorias: MenuCategoria[] }) {
  return (
    <section id="productos" className="bg-crust-50 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center font-display text-3xl font-bold text-crust-800 md:text-4xl">
          Nuestros Productos
        </h2>
        <div className="mx-auto mt-3 mb-12 h-1 w-16 rounded-full bg-crust-400" />

        {categorias.length === 0 && (
          <p className="text-center text-crust-500">
            El catálogo se está horneando… 🥖
          </p>
        )}

        <div className="space-y-14">
          {categorias.map((cat) => (
            <div key={cat.id}>
              <h3 className="mb-6 font-display text-2xl font-semibold text-crust-700">
                {cat.nombre}
              </h3>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {cat.productos.map((p) => (
                  <article
                    key={p.id}
                    className="flex flex-col rounded-2xl border border-crust-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-crust-900">{p.nombre}</h4>
                      {p.destacado && (
                        <span className="rounded-full bg-crust-100 px-2 py-0.5 text-xs font-semibold text-crust-600">
                          ★ Destacado
                        </span>
                      )}
                    </div>
                    {p.descripcion && (
                      <p className="mb-4 flex-1 text-sm text-crust-600">
                        {p.descripcion}
                      </p>
                    )}
                    <p className="mt-auto text-lg font-bold text-crust-700">
                      {formatUYU(p.precio)}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Promociones({ promos }: { promos: Promocion[] }) {
  if (promos.length === 0) return null;
  return (
    <section id="promociones" className="mx-auto max-w-6xl px-4 py-20">
      <h2 className="text-center font-display text-3xl font-bold text-crust-800 md:text-4xl">
        Promociones del día
      </h2>
      <div className="mx-auto mt-3 mb-12 h-1 w-16 rounded-full bg-crust-400" />
      <div className="grid gap-5 md:grid-cols-3">
        {promos.map((promo) => (
          <div
            key={promo.id}
            className="rounded-2xl bg-crust-600 p-6 text-white shadow-md"
          >
            <p className="text-sm uppercase tracking-wide text-crust-100">
              Oferta
            </p>
            <h3 className="mt-1 text-xl font-bold">{promo.nombre}</h3>
            {promo.descripcion && (
              <p className="mt-2 text-crust-100">{promo.descripcion}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Galeria({ contenido }: { contenido: Record<string, string> }) {
  const emojis = ["🥖", "🥐", "🍞", "🎂", "🧁", "☕"];
  return (
    <section id="galeria" className="bg-crust-50 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center font-display text-3xl font-bold text-crust-800 md:text-4xl">
          Galería
        </h2>
        <div className="mx-auto mt-3 mb-12 h-1 w-16 rounded-full bg-crust-400" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {emojis.map((e, i) => (
            <div
              key={i}
              className="grid aspect-square place-items-center rounded-2xl bg-crust-100 text-6xl"
            >
              {e}
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-crust-500">
          {contenido["galeria.nota"] ??
            "Las fotos reales se cargan desde el panel (Supabase Storage)."}
        </p>
      </div>
    </section>
  );
}

export function Testimonios({ items }: { items: Testimonio[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <h2 className="text-center font-display text-3xl font-bold text-crust-800 md:text-4xl">
        Lo que dicen nuestros clientes
      </h2>
      <div className="mx-auto mt-3 mb-12 h-1 w-16 rounded-full bg-crust-400" />
      <div className="grid gap-5 md:grid-cols-3">
        {items.map((t) => (
          <blockquote
            key={t.id}
            className="rounded-2xl border border-crust-100 bg-white p-6 shadow-sm"
          >
            <p className="text-crust-700">“{t.texto}”</p>
            <footer className="mt-4 flex items-center justify-between">
              <cite className="font-semibold not-italic text-crust-800">
                {t.autor}
              </cite>
              <span className="text-crust-400">{"★".repeat(t.rating)}</span>
            </footer>
          </blockquote>
        ))}
      </div>
    </section>
  );
}

export function Contacto({
  contacto,
  horarios,
}: {
  contacto: Contacto | null;
  horarios: Horario[];
}) {
  return (
    <section id="contacto" className="bg-crust-800 py-20 text-crust-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl font-bold md:text-4xl">
            Visitanos
          </h2>
          <div className="mt-3 mb-8 h-1 w-16 rounded-full bg-crust-400" />
          <ul className="space-y-3 text-crust-100">
            {contacto?.direccion && (
              <li>📍 {contacto.direccion}</li>
            )}
            {contacto?.telefono && <li>📞 {contacto.telefono}</li>}
            {contacto?.whatsapp && <li>💬 WhatsApp: {contacto.whatsapp}</li>}
            {contacto?.email && <li>✉️ {contacto.email}</li>}
            {contacto?.instagram && <li>📷 {contacto.instagram}</li>}
          </ul>
        </div>
        <div>
          <h3 className="font-display text-2xl font-semibold">Horarios</h3>
          <table className="mt-4 w-full text-crust-100">
            <tbody>
              {horarios.map((h) => (
                <tr key={h.diaSemana} className="border-b border-crust-700/50">
                  <td className="py-2">{DIAS[h.diaSemana]}</td>
                  <td className="py-2 text-right">
                    {h.cerrado ? "Cerrado" : `${h.apertura} – ${h.cierre}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="bg-crust-900 py-8 text-center text-sm text-crust-200">
      <p>
        © {new Date().getFullYear()} Panadería Artesanal Don Julio · Maldonado,
        Uruguay
      </p>
      <p className="mt-1 text-crust-400">
        Hecho con harina, paciencia y buen código.
      </p>
    </footer>
  );
}
