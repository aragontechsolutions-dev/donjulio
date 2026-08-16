import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { showToast } from "./toast";

const EVENTOS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"] as const;
/** Segundos de aviso antes de cerrar la sesión. */
const AVISO_S = 60;

/**
 * Cierra la sesión tras N minutos de inactividad, según la política del rol
 * configurada en el panel. Con 0 minutos no cierra nunca.
 * Devuelve los segundos restantes cuando está por vencer (para avisar en la UI).
 */
export function useIdleLogout(onLogout: () => void, enabled = true) {
  const [minutos, setMinutos] = useState(0);
  const [restante, setRestante] = useState<number | null>(null);
  const ultimaActividad = useRef(Date.now());
  const salioRef = useRef(false);

  // Política del rol (se consulta una vez por sesión).
  useEffect(() => {
    if (!enabled) return;
    api
      .get<{ minutos: number }>("/admin/config/sesion/mia")
      .then((r) => setMinutos(r.minutos ?? 0))
      .catch(() => setMinutos(0));
  }, [enabled]);

  useEffect(() => {
    if (!enabled || minutos <= 0) {
      setRestante(null);
      return;
    }
    const limiteMs = minutos * 60_000;
    const marcar = () => {
      ultimaActividad.current = Date.now();
      setRestante(null);
    };
    EVENTOS.forEach((e) => window.addEventListener(e, marcar, { passive: true }));

    const tick = setInterval(() => {
      const inactivoMs = Date.now() - ultimaActividad.current;
      const faltanS = Math.ceil((limiteMs - inactivoMs) / 1000);
      if (faltanS <= 0) {
        if (salioRef.current) return;
        salioRef.current = true;
        showToast("info", "Sesión cerrada por inactividad.");
        onLogout();
      } else {
        setRestante(faltanS <= AVISO_S ? faltanS : null);
      }
    }, 1000);

    return () => {
      EVENTOS.forEach((e) => window.removeEventListener(e, marcar));
      clearInterval(tick);
    };
  }, [enabled, minutos, onLogout]);

  return { minutos, restante };
}
