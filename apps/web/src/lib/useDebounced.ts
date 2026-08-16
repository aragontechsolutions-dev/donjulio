import { useEffect, useState } from "react";

/**
 * Devuelve `valor` con un retardo, para no pegarle a la API en cada tecla.
 * 300 ms es el punto donde la búsqueda se siente instantánea pero una palabra
 * escrita de corrido genera una sola consulta.
 */
export function useDebounced<T>(valor: T, ms = 300): T {
  const [diferido, setDiferido] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDiferido(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return diferido;
}
