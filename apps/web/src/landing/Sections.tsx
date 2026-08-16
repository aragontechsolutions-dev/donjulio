import { formatUYU, DIAS } from "../lib/format";
import { scrollToSection } from "../lib/useScrollSpy";
import Octogonos from "../lib/Octogonos";
import Mapa from "../lib/MapaLazy";
import { LogoPrincipal, Monograma, Sello } from "../lib/Logo";
import type { ReactNode } from "react";
import type {
  Contacto,
  GaleriaItem,
  Horario,
  MenuCategoria,
  Promocion,
  Testimonio,
} from "./types";

/** Rombo de la marca, usado como viñeta y separador. */
function Rombo({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 rotate-45 ${className}`} />;
}

/** Filete con rombo al centro: reemplaza a la barra redondeada genérica. */
function Filete({ tono = "arena" }: { tono?: "arena" | "dorado" }) {
  const linea = tono === "arena" ? "bg-dj-arena" : "bg-dj-dorado/40";
  const punto = tono === "arena" ? "bg-dj-terracota" : "bg-dj-dorado";
  return (
    <div className="mx-auto flex items-center justify-center gap-3" aria-hidden>
      <span className={`h-px w-12 ${linea}`} />
      <Rombo className={punto} />
      <span className={`h-px w-12 ${linea}`} />
    </div>
  );
}

/** Encabezado de sección: volanta, título serif y filete. */
function Encabezado({
  volanta,
  titulo,
  oscuro = false,
}: {
  volanta: string;
  titulo: string;
  oscuro?: boolean;
}) {
  return (
    <header className="text-center">
      <p
        className={`text-xs font-medium uppercase tracking-marca ${
          oscuro ? "text-dj-dorado" : "text-dj-terracota"
        }`}
      >
        {volanta}
      </p>
      <h2
        className={`mt-3 font-display text-3xl font-bold tracking-tight md:text-[2.6rem] ${
          oscuro ? "text-dj-papel" : "text-dj-carbon"
        }`}
      >
        {titulo}
      </h2>
      <div className="mt-5">
        <Filete tono={oscuro ? "dorado" : "arena"} />
      </div>
    </header>
  );
}

export function Hero({ contenido }: { contenido: Record<string, string> }) {
  return (
    <section id="inicio" className="relative overflow-hidden bg-dj-papel">
      {/* Halo cálido detrás del sello, como la vidriera iluminada del local. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-12%] top-[-20%] h-[36rem] w-[36rem] rounded-full bg-dj-arena/45 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-[1.05fr_.95fr] md:py-28">
        <div>
          <p className="flex items-center gap-3 text-xs font-medium uppercase tracking-marca text-dj-terracota">
            <Rombo className="bg-dj-terracota" />
            Desde 1987 · Maldonado
          </p>

          <h1 className="mt-6 font-display text-[2.75rem] font-extrabold leading-[1.05] tracking-tight text-dj-carbon md:text-6xl">
            {contenido["hero.titulo"] ?? "Panadería Artesanal Don Julio"}
          </h1>

          <p className="mt-5 text-sm font-medium uppercase tracking-marca text-dj-humo">
            Panadería &amp; Pastelería
          </p>

          <p className="mt-6 max-w-md text-lg leading-relaxed text-dj-grafito">
            {contenido["hero.subtitulo"] ?? "Pan de verdad, horneado cada día."}
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <button
              onClick={() => scrollToSection("productos")}
              className="rounded-full bg-dj-terracota px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.14em] text-dj-papel shadow-lg shadow-dj-terracota/20 transition-colors hover:bg-dj-cobre"
            >
              Ver productos
            </button>
            <button
              onClick={() => scrollToSection("ubicacion")}
              className="rounded-full border border-dj-carbon/25 px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.14em] text-dj-carbon transition-colors hover:bg-dj-carbon hover:text-dj-papel"
            >
              Cómo llegar
            </button>
          </div>
        </div>

        {/* Medallón: el cartel de fachada, colgado sobre el papel crema. */}
        <div className="grid place-items-center">
          <div className="relative grid h-64 w-64 place-items-center rounded-full bg-dj-carbon shadow-2xl shadow-dj-carbon/30 md:h-80 md:w-80">
            <span
              aria-hidden
              className="absolute inset-3 rounded-full border border-dj-dorado/25"
            />
            <Sello tinta="#F5F0E6" acento="#C9A56B" className="h-[78%] w-[78%]" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function Nosotros({ contenido }: { contenido: Record<string, string> }) {
  return (
    <section id="nosotros" className="bg-dj-papel">
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <Monograma
          tinta="#E3D5B8"
          acento="#E3D5B8"
          className="mx-auto mb-8 h-14 w-14"
        />
        <Encabezado
          volanta="Nuestra casa"
          titulo={contenido["historia.titulo"] ?? "Nuestra Historia"}
        />
        <p className="mt-8 text-lg leading-relaxed text-dj-grafito">
          {contenido["historia.texto"] ??
            "Amasamos con las manos y el corazón desde hace años."}
        </p>
      </div>
    </section>
  );
}

/** Placeholder animado mientras el catálogo carga. */
function ProductoSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-sm border border-dj-arena bg-white">
      <div className="aspect-[4/3] w-full animate-pulse bg-dj-crema" />
      <div className="flex flex-col gap-3 p-6">
        <div className="h-4 w-2/3 animate-pulse rounded bg-dj-crema" />
        <div className="h-3 w-full animate-pulse rounded bg-dj-crema" />
        <div className="h-5 w-1/3 animate-pulse rounded bg-dj-crema" />
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
    <section id="productos" className="bg-dj-crema/60 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <Encabezado volanta="La carta" titulo="Nuestros Productos" />

        <div className="mt-14">
          {loading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductoSkeleton key={i} />
              ))}
            </div>
          ) : categorias.length === 0 ? (
            <p className="text-center text-dj-humo">El catálogo se está horneando…</p>
          ) : (
            <div className="space-y-16">
              {categorias.map((cat) => (
                <div key={cat.id}>
                  <h3 className="mb-7 flex items-center gap-3 font-display text-2xl font-semibold text-dj-carbon">
                    <Rombo className="bg-dj-dorado" />
                    {cat.nombre}
                  </h3>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {cat.productos.map((p, i) => (
                      <article
                        key={p.id}
                        style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                        className="group flex animate-[cardIn_.5s_ease-out_both] flex-col overflow-hidden rounded-sm border border-dj-arena bg-white transition-all duration-300 hover:-translate-y-1 hover:border-dj-dorado hover:shadow-xl hover:shadow-dj-carbon/10"
                      >
                        {/* Imagen grande arriba (zoom sutil en hover) */}
                        <div className="relative aspect-[4/3] w-full overflow-hidden bg-dj-crema">
                          {p.imagenUrl ? (
                            <img
                              src={p.imagenUrl}
                              alt={p.nombre}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="grid h-full w-full place-items-center transition-transform duration-500 group-hover:scale-110">
                              <Monograma
                                tinta="#E3D5B8"
                                acento="#D8C7A4"
                                className="h-16 w-16"
                              />
                            </div>
                          )}
                          {p.destacado && (
                            <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-dj-carbon/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-dj-papel backdrop-blur">
                              <Rombo className="bg-dj-dorado" />
                              Destacado
                            </span>
                          )}
                          {/* Sellos frontales (Decreto 272/018) */}
                          {p.rotulado && (
                            <Octogonos flags={p.rotulado} size={38} className="absolute bottom-3 left-3" />
                          )}
                        </div>
                        {/* Nombre, descripción y precio debajo */}
                        <div className="flex flex-1 flex-col p-6">
                          <h4 className="font-display text-lg font-semibold text-dj-carbon">
                            {p.nombre}
                          </h4>
                          {p.descripcion && (
                            <p className="mt-2 flex-1 text-sm leading-relaxed text-dj-humo">
                              {p.descripcion}
                            </p>
                          )}
                          {p.rotulado?.alergenos && (
                            <p className="mt-3 text-xs text-dj-humo/80">
                              Contiene: {p.rotulado.alergenos}
                            </p>
                          )}
                          <p className="mt-5 border-t border-dj-arena pt-4 font-display text-xl font-bold text-dj-terracota">
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
      </div>
      <style>{`@keyframes cardIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}`}</style>
    </section>
  );
}

export function Promociones({ promos }: { promos: Promocion[] }) {
  if (promos.length === 0) return null;
  return (
    <section id="promociones" className="bg-dj-papel py-20">
      <div className="mx-auto max-w-6xl px-4">
        <Encabezado volanta="Esta semana" titulo="Promociones del día" />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {promos.map((promo) => (
            <div
              key={promo.id}
              className="relative overflow-hidden rounded-sm bg-dj-carbon p-8 text-dj-papel"
            >
              <span
                aria-hidden
                className="absolute inset-x-5 top-5 h-px bg-dj-dorado/30"
              />
              <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-marca text-dj-dorado">
                <Rombo className="bg-dj-dorado" />
                Oferta
              </p>
              <h3 className="mt-4 font-display text-2xl font-bold">{promo.nombre}</h3>
              {promo.descripcion && (
                <p className="mt-3 leading-relaxed text-dj-papel/70">{promo.descripcion}</p>
              )}
            </div>
          ))}
        </div>
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
    <section id="galeria" className="bg-dj-crema/60 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <Encabezado volanta="El local" titulo="Galería" />
        <div className="mt-14 grid grid-cols-2 gap-4 md:grid-cols-3">
          {fotos.map((f, i) => (
            <figure
              key={f.id}
              style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              className="group relative aspect-square animate-[cardIn_.5s_ease-out_both] overflow-hidden rounded-sm bg-dj-arena"
            >
              <img
                src={f.imagenUrl}
                alt={f.titulo ?? "Foto de Don Julio"}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {f.titulo && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-dj-tinta/80 to-transparent p-4 text-sm font-medium text-dj-papel opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  {f.titulo}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
        {contenido["galeria.nota"] && (
          <p className="mt-8 text-center text-sm text-dj-humo">{contenido["galeria.nota"]}</p>
        )}
      </div>
      <style>{`@keyframes cardIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}`}</style>
    </section>
  );
}

export function Testimonios({ items }: { items: Testimonio[] }) {
  if (items.length === 0) return null;
  return (
    <section className="bg-dj-papel py-20">
      <div className="mx-auto max-w-6xl px-4">
        <Encabezado volanta="Los clientes" titulo="Lo que dicen de nosotros" />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {items.map((t) => (
            <blockquote
              key={t.id}
              className="flex flex-col rounded-sm border border-dj-arena bg-white p-7"
            >
              <Monograma tinta="#E3D5B8" acento="#D8C7A4" className="mb-5 h-7 w-7" />
              <p className="flex-1 font-display text-lg leading-relaxed text-dj-grafito">
                “{t.texto}”
              </p>
              <footer className="mt-6 flex items-center justify-between border-t border-dj-arena pt-4">
                <cite className="text-xs font-semibold uppercase tracking-[0.18em] not-italic text-dj-carbon">
                  {t.autor}
                </cite>
                <span className="text-dj-dorado" aria-label={`${t.rating} de 5`}>
                  {"★".repeat(t.rating)}
                </span>
              </footer>
            </blockquote>
          ))}
        </div>
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
    <section id="ubicacion" className="bg-dj-crema/60 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <Encabezado volanta="Cómo llegar" titulo="Dónde estamos" />
        {contacto?.direccion && (
          <p className="mt-6 text-center font-display text-xl text-dj-grafito">
            {contacto.direccion}
          </p>
        )}

        <div className="mt-10">
          {tieneCoords ? (
            <div className="overflow-hidden rounded-sm border border-dj-arena shadow-sm">
              <Mapa
                lat={contacto!.lat!}
                lng={contacto!.lng!}
                zoom={contacto!.mapZoom ?? 16}
                className="h-[380px] w-full md:h-[460px]"
              />
            </div>
          ) : (
            <div className="grid h-48 place-items-center rounded-sm border border-dashed border-dj-arena bg-dj-papel text-center text-dj-humo">
              <p className="px-6 text-sm">
                Estamos cargando la ubicación exacta del local.
                <br />
                Mientras tanto, escribinos y te indicamos cómo llegar.
              </p>
            </div>
          )}
        </div>

        {url && (
          <div className="mt-8 flex justify-center">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-dj-carbon px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.14em] text-dj-papel transition-colors hover:bg-dj-terracota"
            >
              Abrir indicaciones en Google Maps
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

/** Fila de contacto: etiqueta chica arriba, dato grande abajo. */
function Dato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-dj-papel/15 py-3.5">
      <dt className="text-[10px] font-semibold uppercase tracking-marca text-dj-dorado">
        {label}
      </dt>
      <dd className="mt-1.5 text-dj-papel/90">{children}</dd>
    </div>
  );
}

export function Contacto({
  contacto,
  horarios,
}: {
  contacto: Contacto | null;
  horarios: Horario[];
}) {
  const hoy = new Date().getDay();
  return (
    <section id="contacto" className="bg-dj-carbon py-20 text-dj-papel">
      <div className="mx-auto max-w-6xl px-4">
        <Encabezado volanta="Pasá a saludar" titulo="Visitanos" oscuro />

        <div className="mt-14 grid gap-12 md:grid-cols-2">
          <dl>
            {contacto?.direccion && (
              <Dato label="Dirección">
                <button
                  onClick={() => scrollToSection("ubicacion")}
                  className="text-left underline decoration-dj-dorado/50 underline-offset-4 transition-colors hover:text-dj-dorado"
                >
                  {contacto.direccion}
                </button>
              </Dato>
            )}
            {contacto?.telefono && (
              <Dato label="Teléfono">
                <a href={`tel:${contacto.telefono.replace(/\s/g, "")}`} className="hover:text-dj-dorado">
                  {contacto.telefono}
                </a>
              </Dato>
            )}
            {contacto?.whatsapp && (
              <Dato label="WhatsApp">
                <a
                  href={`https://wa.me/${contacto.whatsapp.replace(/[^\d]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-dj-dorado"
                >
                  {contacto.whatsapp}
                </a>
              </Dato>
            )}
            {contacto?.email && (
              <Dato label="Email">
                <a href={`mailto:${contacto.email}`} className="hover:text-dj-dorado">
                  {contacto.email}
                </a>
              </Dato>
            )}
            {contacto?.instagram && <Dato label="Instagram">{contacto.instagram}</Dato>}
            {contacto?.facebook && <Dato label="Facebook">{contacto.facebook}</Dato>}
          </dl>

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-marca text-dj-dorado">
              Horarios
            </h3>
            <table className="mt-4 w-full">
              <tbody>
                {horarios.map((h) => {
                  const esHoy = h.diaSemana === hoy;
                  return (
                    <tr
                      key={h.diaSemana}
                      className={`border-t border-dj-papel/15 ${esHoy ? "text-dj-papel" : "text-dj-papel/65"}`}
                    >
                      <td className="py-3">
                        <span className="flex items-center gap-2">
                          {esHoy && <Rombo className="bg-dj-terracota" />}
                          <span className={esHoy ? "font-semibold" : ""}>{DIAS[h.diaSemana]}</span>
                        </span>
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        {h.cerrado ? "Cerrado" : `${h.apertura} – ${h.cierre}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="bg-dj-tinta py-12 text-center text-dj-papel/60">
      <LogoPrincipal
        tinta="#F5F0E6"
        acento="#C9A56B"
        conAnio={false}
        className="mx-auto h-24 opacity-90"
      />
      <p className="mt-8 text-xs uppercase tracking-[0.18em]">
        © {new Date().getFullYear()} · Maldonado, Uruguay
      </p>
      <p className="mt-2 text-xs text-dj-papel/40">
        Hecho con harina, paciencia y buen código.
      </p>
    </footer>
  );
}
