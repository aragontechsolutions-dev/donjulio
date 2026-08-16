import { formatUYU, DIAS } from "../lib/format";
import { scrollToSection } from "../lib/useScrollSpy";
import Octogonos from "../lib/Octogonos";
import Mapa from "../lib/MapaLazy";
import type {
  Contacto,
  GaleriaItem,
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
              onClick={() => scrollToSection("ubicacion")}
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

/** Placeholder animado mientras el catálogo carga. */
function ProductoSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
      <div className="aspect-[4/3] w-full animate-pulse bg-crust-100" />
      <div className="flex flex-col gap-3 p-5">
        <div className="h-4 w-2/3 animate-pulse rounded bg-crust-100" />
        <div className="h-3 w-full animate-pulse rounded bg-crust-100" />
        <div className="h-5 w-1/3 animate-pulse rounded bg-crust-100" />
      </div>
    </div>
  );
}

export function Productos({
  categorias,
  loading = false,
}: {
  categorias: MenuCategoria[];
  loading?: boolean;
}) {
  return (
    <section id="productos" className="bg-crust-50 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center font-display text-3xl font-bold text-crust-800 md:text-4xl">
          Nuestros Productos
        </h2>
        <div className="mx-auto mt-3 mb-12 h-1 w-16 rounded-full bg-crust-400" />

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProductoSkeleton key={i} />
            ))}
          </div>
        ) : categorias.length === 0 ? (
          <p className="text-center text-crust-500">
            El catálogo se está horneando… 🥖
          </p>
        ) : (
          <div className="space-y-14">
            {categorias.map((cat) => (
              <div key={cat.id}>
                <h3 className="mb-6 font-display text-2xl font-semibold text-crust-700">
                  {cat.nombre}
                </h3>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {cat.productos.map((p, i) => (
                    <article
                      key={p.id}
                      style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                      className="group flex animate-[cardIn_.5s_ease-out_both] flex-col overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                    >
                      {/* Imagen grande arriba (zoom sutil en hover) */}
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-crust-100">
                        {p.imagenUrl ? (
                          <img
                            src={p.imagenUrl}
                            alt={p.nombre}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-5xl text-crust-300 transition-transform duration-500 group-hover:scale-110">
                            🥐
                          </div>
                        )}
                        {p.destacado && (
                          <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-crust-700 shadow-sm backdrop-blur">
                            ★ Destacado
                          </span>
                        )}
                        {/* Sellos frontales (Decreto 272/018) */}
                        {p.rotulado && (
                          <Octogonos flags={p.rotulado} size={38} className="absolute bottom-2 left-2" />
                        )}
                      </div>
                      {/* Nombre, descripción y precio debajo */}
                      <div className="flex flex-1 flex-col p-5">
                        <h4 className="font-semibold text-crust-900">{p.nombre}</h4>
                        {p.descripcion && (
                          <p className="mt-1 flex-1 text-sm text-crust-600">
                            {p.descripcion}
                          </p>
                        )}
                        {p.rotulado?.alergenos && (
                          <p className="mt-2 text-xs text-crust-400">⚠ {p.rotulado.alergenos}</p>
                        )}
                        <p className="mt-4 text-lg font-bold text-crust-700">
                          {formatUYU(p.precio)}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`@keyframes cardIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}`}</style>
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

export function Galeria({
  contenido,
  fotos,
}: {
  contenido: Record<string, string>;
  fotos: GaleriaItem[];
}) {
  // Sin fotos cargadas la sección no se muestra (evita un bloque vacío).
  if (fotos.length === 0) return null;
  return (
    <section id="galeria" className="bg-crust-50 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center font-display text-3xl font-bold text-crust-800 md:text-4xl">
          Galería
        </h2>
        <div className="mx-auto mt-3 mb-12 h-1 w-16 rounded-full bg-crust-400" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {fotos.map((f, i) => (
            <figure
              key={f.id}
              style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              className="group relative aspect-square animate-[cardIn_.5s_ease-out_both] overflow-hidden rounded-2xl bg-crust-100 shadow-sm"
            >
              <img
                src={f.imagenUrl}
                alt={f.titulo ?? "Foto de Don Julio"}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {f.titulo && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 text-sm font-medium text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  {f.titulo}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
        {contenido["galeria.nota"] && (
          <p className="mt-6 text-center text-sm text-crust-500">{contenido["galeria.nota"]}</p>
        )}
      </div>
      <style>{`@keyframes cardIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}`}</style>
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

/** URL de indicaciones "desde donde estés" hasta el local. */
export function comoLlegarUrl(contacto: Contacto | null): string | null {
  if (!contacto) return null;
  if (contacto.mapsUrl) return contacto.mapsUrl;
  if (contacto.lat != null && contacto.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${contacto.lat},${contacto.lng}`;
  }
  if (contacto.direccion) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      contacto.direccion,
    )}`;
  }
  return null;
}

export function Ubicacion({ contacto }: { contacto: Contacto | null }) {
  const tieneCoords = contacto?.lat != null && contacto?.lng != null;
  const url = comoLlegarUrl(contacto);

  return (
    <section id="ubicacion" className="mx-auto max-w-6xl px-4 py-20">
      <h2 className="text-center font-display text-3xl font-bold text-crust-800 md:text-4xl">
        Dónde estamos
      </h2>
      <div className="mx-auto mt-3 mb-4 h-1 w-16 rounded-full bg-crust-400" />
      {contacto?.direccion && (
        <p className="mb-8 text-center text-lg text-crust-600">
          📍 {contacto.direccion}
        </p>
      )}

      {tieneCoords ? (
        <div className="overflow-hidden rounded-2xl border border-crust-100 shadow-sm">
          <Mapa
            lat={contacto!.lat!}
            lng={contacto!.lng!}
            zoom={contacto!.mapZoom ?? 16}
            className="h-[380px] w-full md:h-[440px]"
          />
        </div>
      ) : (
        <div className="grid h-48 place-items-center rounded-2xl border border-dashed border-crust-200 bg-crust-50 text-center text-crust-400">
          <p className="px-6 text-sm">
            Estamos cargando la ubicación exacta del local.
            <br />
            Mientras tanto, escribinos y te indicamos cómo llegar.
          </p>
        </div>
      )}

      {url && (
        <div className="mt-6 flex justify-center">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-crust-600 px-6 py-3 font-semibold text-white shadow-md transition-transform hover:scale-105"
          >
            <span aria-hidden>🧭</span>
            Abrir indicaciones en Google Maps
          </a>
        </div>
      )}
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
              <li>
                📍{" "}
                <button
                  onClick={() => scrollToSection("ubicacion")}
                  className="underline decoration-crust-400 underline-offset-4 hover:text-white"
                >
                  {contacto.direccion}
                </button>
              </li>
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
