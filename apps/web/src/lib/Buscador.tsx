import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { coincide } from "./texto";

export interface OpcionBuscador {
  id: string;
  nombre: string;
  /** Dato secundario a la derecha: unidad, stock, precio… */
  detalle?: string;
  /** Encabezado bajo el que se agrupa (ej: "Insumos", "Sub-recetas"). */
  grupo?: string;
  /** No se puede elegir; se muestra en gris. */
  bloqueado?: boolean;
  /** Por qué está bloqueada, junto al nombre. */
  motivo?: string;
}

interface Props {
  opciones: OpcionBuscador[];
  /** Id elegido, o "" si no hay ninguno. */
  valorId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  /** Texto de la opción que limpia la selección. Si falta, no se ofrece. */
  opcionVacia?: string;
  /** Qué decir cuando no hay coincidencias. */
  sinResultados?: string;
  autoFocus?: boolean;
  className?: string;
}

const MAX_RESULTADOS = 50;
let secuencia = 0;

/**
 * Buscador con teclado sobre una lista ya cargada: filtra en el navegador (no
 * consulta al servidor en cada tecla) e ignora acentos, igual que las
 * búsquedas del backend.
 *
 * El desplegable va en un portal con posición fija porque dentro de modales y
 * tablas hay contenedores con overflow que si no lo recortarían.
 */
export default function Buscador({
  opciones,
  valorId,
  onSelect,
  placeholder = "Buscar…",
  opcionVacia,
  sinResultados = "Sin coincidencias.",
  autoFocus,
  className = "",
}: Props) {
  const elegido = opciones.find((o) => o.id === valorId) ?? null;
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [listaId] = useState(() => `buscador-lista-${++secuencia}`);

  const caja = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const lista = useRef<HTMLUListElement | null>(null);

  const filtradas = (texto.trim() ? opciones.filter((o) => coincide(o.nombre, texto)) : opciones)
    .slice(0, MAX_RESULTADOS);
  // La opción de "sin selección" participa de la navegación con flechas.
  const navegables: (OpcionBuscador | null)[] = opcionVacia ? [null, ...filtradas] : filtradas;

  useLayoutEffect(() => {
    if (!abierto) return;
    const ubicar = () => {
      const r = caja.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    ubicar();
    window.addEventListener("scroll", ubicar, true);
    window.addEventListener("resize", ubicar);
    return () => {
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("resize", ubicar);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!caja.current?.contains(t) && !lista.current?.contains(t)) cerrar();
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  useEffect(() => {
    lista.current
      ?.querySelector<HTMLElement>(`[data-i="${resaltado}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [resaltado]);

  const cerrar = () => {
    setAbierto(false);
    setTexto("");
  };

  const elegir = (o: OpcionBuscador | null) => {
    if (o?.bloqueado && o.id !== valorId) return;
    onSelect(o?.id ?? "");
    cerrar();
    input.current?.blur();
  };

  const teclado = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!abierto) {
        setAbierto(true);
        setResaltado(0);
        return;
      }
      // Se topa en los extremos en vez de dar la vuelta: con un solo
      // resultado, envolver hacía que ArrowDown cayera en la opción vacía.
      const paso = e.key === "ArrowDown" ? 1 : -1;
      setResaltado((i) => Math.min(Math.max(i + paso, 0), Math.max(navegables.length - 1, 0)));
      return;
    }
    if (e.key === "Enter") {
      if (!abierto) return;
      e.preventDefault();
      if (resaltado < navegables.length) elegir(navegables[resaltado]);
      return;
    }
    if (e.key === "Escape" && abierto) {
      // Sólo cierra el desplegable; que no se cierre también el modal.
      e.stopPropagation();
      cerrar();
    }
  };

  /** Encabezado de grupo si esta opción abre uno nuevo. */
  const grupoDe = (o: OpcionBuscador, i: number) =>
    o.grupo && o.grupo !== filtradas[i - 1]?.grupo ? o.grupo : null;

  return (
    <div ref={caja} className={`relative ${className}`}>
      <input
        ref={input}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={listaId}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        value={abierto ? texto : (elegido?.nombre ?? "")}
        placeholder={elegido ? elegido.nombre : placeholder}
        onChange={(e) => {
          setTexto(e.target.value);
          setResaltado(opcionVacia ? 1 : 0);
          setAbierto(true);
        }}
        onFocus={() => {
          setAbierto(true);
          setResaltado(opcionVacia ? 1 : 0);
        }}
        onKeyDown={teclado}
        onBlur={() => abierto && cerrar()}
        className={`w-full rounded-lg border border-crust-200 px-3 py-2 pr-7 ${
          elegido && !abierto ? "font-medium text-crust-800" : ""
        }`}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-crust-400">
        {abierto ? "⌕" : "▾"}
      </span>

      {abierto && pos &&
        createPortal(
          <ul
            id={listaId}
            ref={lista}
            role="listbox"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-[120] max-h-64 overflow-y-auto rounded-lg border border-crust-200 bg-white py-1 shadow-xl"
          >
            {opcionVacia && (
              <li data-i={0} role="option" aria-selected={valorId === ""}>
                <button
                  type="button"
                  onMouseEnter={() => setResaltado(0)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(null)}
                  className={`w-full px-3 py-2 text-left text-sm italic ${
                    resaltado === 0 ? "bg-dj-crema text-crust-900" : "text-crust-500"
                  }`}
                >
                  {opcionVacia}
                </button>
              </li>
            )}

            {filtradas.length === 0 && (
              <li className="px-3 py-3 text-sm text-crust-400">{sinResultados}</li>
            )}

            {filtradas.map((o, i) => {
              const idx = opcionVacia ? i + 1 : i;
              const encabezado = grupoDe(o, i);
              const bloqueado = !!o.bloqueado && o.id !== valorId;
              return (
                <li key={o.id}>
                  {encabezado && (
                    <p className="border-t border-crust-100 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-crust-400 first:border-0">
                      {encabezado}
                    </p>
                  )}
                  <div data-i={idx} role="option" aria-selected={o.id === valorId}>
                    <button
                      type="button"
                      disabled={bloqueado}
                      onMouseEnter={() => setResaltado(idx)}
                      // Sin esto el botón roba el foco, dispara el onBlur del
                      // input y el desplegable se cierra antes del click.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => elegir(o)}
                      className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm ${
                        bloqueado
                          ? "cursor-not-allowed text-crust-300"
                          : idx === resaltado
                            ? "bg-dj-crema text-crust-900"
                            : "text-crust-700"
                      }`}
                    >
                      <span className="truncate">
                        {o.nombre}
                        {bloqueado && o.motivo && <span className="ml-2 text-xs">· {o.motivo}</span>}
                      </span>
                      {o.detalle && (
                        <span className="shrink-0 text-xs tabular-nums text-crust-400">{o.detalle}</span>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}

            {opciones.length > filtradas.length && texto.trim() === "" && (
              <li className="border-t border-crust-100 px-3 py-2 text-xs text-crust-400">
                Mostrando {filtradas.length} de {opciones.length}. Escribí para filtrar.
              </li>
            )}
          </ul>,
          document.body,
        )}
    </div>
  );
}
