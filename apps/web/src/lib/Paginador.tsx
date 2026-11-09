import { useEffect, useMemo, useState } from "react";

/** Cuántas filas por página se pueden elegir. La primera es la de entrada. */
export const POR_PAGINA = [10, 20, 50, 100] as const;

/**
 * Pagina una lista que ya está en memoria.
 *
 * Devuelve el tramo visible y los controles. La página vuelve a 1 sola
 * cuando cambia el total —al buscar, por ejemplo—: sin eso se queda en la
 * página 7 de una lista que ahora tiene dos resultados y la pantalla aparece
 * vacía sin explicación.
 */
export function usePaginacion<T>(items: T[], inicial: number = POR_PAGINA[0]) {
  const [porPagina, setPorPagina] = useState<number>(inicial);
  const [pagina, setPagina] = useState(1);

  const total = items.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  useEffect(() => {
    setPagina(1);
  }, [total, porPagina]);

  // Si se borra el último de la página, no quedarse en una página que ya no
  // existe.
  const actual = Math.min(pagina, totalPaginas);
  const visibles = useMemo(
    () => items.slice((actual - 1) * porPagina, actual * porPagina),
    [items, actual, porPagina],
  );

  return {
    visibles,
    total,
    pagina: actual,
    totalPaginas,
    porPagina,
    setPorPagina,
    setPagina,
    /** Desde / hasta, para el «1–10 de 37». */
    desde: total === 0 ? 0 : (actual - 1) * porPagina + 1,
    hasta: Math.min(actual * porPagina, total),
  };
}

interface PaginadorProps {
  pagina: number;
  totalPaginas: number;
  total: number;
  desde: number;
  hasta: number;
  porPagina: number;
  setPagina: (p: number | ((p: number) => number)) => void;
  setPorPagina: (n: number) => void;
  /** Cómo llamar a lo que se está listando: "productos", "insumos". */
  nombre?: string;
}

/** Controles de paginación: cuántos por página y en cuál estoy. */
export default function Paginador({
  pagina,
  totalPaginas,
  total,
  desde,
  hasta,
  porPagina,
  setPagina,
  setPorPagina,
  nombre = "resultados",
}: PaginadorProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-crust-100 px-4 py-3 text-sm">
      <label className="flex items-center gap-2 text-crust-500">
        <span>Mostrar</span>
        <select
          value={porPagina}
          onChange={(e) => setPorPagina(Number(e.target.value))}
          className="rounded-lg border border-crust-200 bg-white px-2 py-1 text-crust-700"
          aria-label={`${nombre} por página`}
        >
          {POR_PAGINA.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="hidden sm:inline">por página</span>
      </label>

      <p className="tabular-nums text-crust-500">
        {total === 0 ? `Sin ${nombre}` : `${desde}–${hasta} de ${total}`}
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => setPagina(1)}
          disabled={pagina <= 1}
          className="rounded-lg px-2.5 py-1.5 text-crust-600 hover:bg-crust-100 disabled:opacity-30"
          title="Primera página"
        >
          «
        </button>
        <button
          onClick={() => setPagina((p: number) => Math.max(1, p - 1))}
          disabled={pagina <= 1}
          className="rounded-lg px-3 py-1.5 text-crust-600 hover:bg-crust-100 disabled:opacity-30"
        >
          Anterior
        </button>
        <span className="px-2 tabular-nums text-crust-600">
          {pagina} / {totalPaginas}
        </span>
        <button
          onClick={() => setPagina((p: number) => Math.min(totalPaginas, p + 1))}
          disabled={pagina >= totalPaginas}
          className="rounded-lg px-3 py-1.5 text-crust-600 hover:bg-crust-100 disabled:opacity-30"
        >
          Siguiente
        </button>
        <button
          onClick={() => setPagina(totalPaginas)}
          disabled={pagina >= totalPaginas}
          className="rounded-lg px-2.5 py-1.5 text-crust-600 hover:bg-crust-100 disabled:opacity-30"
          title="Última página"
        >
          »
        </button>
      </div>
    </div>
  );
}
