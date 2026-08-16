import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { coincide } from "./texto";

export interface OpcionInsumo {
  id: string;
  nombre: string;
  unidad: string;
  stockActual?: string;
}

interface Props {
  opciones: OpcionInsumo[];
  /** Id del insumo elegido, o "" si todavía no se eligió ninguno. */
  valorId: string;
  onSelect: (id: string) => void;
  /** Ids ya usados en otras filas: se muestran en gris y no se pueden elegir. */
  excluidos?: Set<string>;
  placeholder?: string;
}

const MAX_RESULTADOS = 50;

/**
 * Buscador de insumos por nombre, con teclado.
 *
 * Filtra en el navegador sobre la lista ya cargada (no consulta al servidor en
 * cada tecla) e ignora acentos, igual que la búsqueda del listado.
 *
 * El desplegable va en un portal con posición fija: dentro del modal hay
 * contenedores con overflow que si no lo recortarían.
 */
export default function BuscadorInsumo({
  opciones,
  valorId,
  onSelect,
  excluidos,
  placeholder = "Buscar insumo…",
}: Props) {
  const elegido = opciones.find((o) => o.id === valorId) ?? null;
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const caja = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const lista = useRef<HTMLUListElement | null>(null);

  const filtradas = (texto.trim() ? opciones.filter((o) => coincide(o.nombre, texto)) : opciones)
    .slice(0, MAX_RESULTADOS);

  // Posición del desplegable, recalculada al abrir y al scrollear o redimensionar.
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

  // Cierra al clickear afuera.
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

  // Mantiene la opción resaltada a la vista al moverse con las flechas.
  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-i="${resaltado}"]`)?.scrollIntoView({ block: "nearest" });
  }, [resaltado]);

  const cerrar = () => {
    setAbierto(false);
    setTexto("");
  };

  const elegir = (o: OpcionInsumo) => {
    if (excluidos?.has(o.id) && o.id !== valorId) return;
    onSelect(o.id);
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
      const paso = e.key === "ArrowDown" ? 1 : -1;
      setResaltado((i) => (filtradas.length === 0 ? 0 : (i + paso + filtradas.length) % filtradas.length));
      return;
    }
    if (e.key === "Enter") {
      if (!abierto) return;
      e.preventDefault();
      const o = filtradas[resaltado];
      if (o) elegir(o);
      return;
    }
    if (e.key === "Escape" && abierto) {
      // Sólo cierra el desplegable; que no se cierre también el modal.
      e.stopPropagation();
      cerrar();
    }
  };

  return (
    <div ref={caja} className="relative">
      <input
        ref={input}
        role="combobox"
        aria-expanded={abierto}
        aria-controls="buscador-insumo-lista"
        aria-autocomplete="list"
        value={abierto ? texto : (elegido?.nombre ?? "")}
        placeholder={elegido ? elegido.nombre : placeholder}
        onChange={(e) => {
          setTexto(e.target.value);
          setResaltado(0);
          setAbierto(true);
        }}
        onFocus={() => {
          setAbierto(true);
          setResaltado(0);
        }}
        onKeyDown={teclado}
        onBlur={() => abierto && cerrar()}
        className={`w-full rounded-lg border px-3 py-2 pr-7 ${
          elegido && !abierto ? "border-crust-200 font-medium text-crust-800" : "border-crust-200"
        }`}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-crust-400">
        {abierto ? "⌕" : "▾"}
      </span>

      {abierto && pos &&
        createPortal(
          <ul
            id="buscador-insumo-lista"
            ref={lista}
            role="listbox"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-[120] max-h-64 overflow-y-auto rounded-lg border border-crust-200 bg-white py-1 shadow-xl"
          >
            {filtradas.length === 0 && (
              <li className="px-3 py-3 text-sm text-crust-400">Ningún insumo coincide.</li>
            )}
            {filtradas.map((o, i) => {
              const bloqueado = !!excluidos?.has(o.id) && o.id !== valorId;
              return (
                <li key={o.id} data-i={i} role="option" aria-selected={o.id === valorId}>
                  <button
                    type="button"
                    disabled={bloqueado}
                    onMouseEnter={() => setResaltado(i)}
                    // Sin esto el botón roba el foco, dispara el onBlur del
                    // input y el desplegable se cierra antes del click.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => elegir(o)}
                    className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm ${
                      bloqueado
                        ? "cursor-not-allowed text-crust-300"
                        : i === resaltado
                          ? "bg-dj-crema text-crust-900"
                          : "text-crust-700"
                    }`}
                  >
                    <span className="truncate">
                      {o.nombre}
                      {bloqueado && <span className="ml-2 text-xs">· ya está en el remito</span>}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-crust-400">
                      {o.stockActual != null ? `${Number(o.stockActual)} ` : ""}
                      {o.unidad}
                    </span>
                  </button>
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
