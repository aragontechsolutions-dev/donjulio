import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "http://localhost:3000/api";

interface Resultado {
  accion: "entrada" | "salida";
  nombre: string;
  hora: string;
  horas: number | null;
  minutosTarde?: number | null;
  minutosAntes?: number | null;
}

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "borrar", "0", "ok"];

/**
 * Identificador estable de este dispositivo. Los navegadores no exponen la MAC,
 * así que se genera un id propio y se guarda en el tablet; el admin autoriza
 * ese id desde el panel y sólo ese dispositivo puede fichar.
 */
const DEVICE_KEY = "donjulio_device_id";
function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export default function Fichaje() {
  const { token = "" } = useParams();
  const [paso, setPaso] = useState<"numero" | "pin">("numero");
  const [numero, setNumero] = useState("");
  const [pin, setPin] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<Resultado | null>(null);
  const [reloj, setReloj] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const reiniciar = () => {
    setPaso("numero");
    setNumero("");
    setPin("");
    setError(null);
  };

  // Tras confirmar, vuelve solo al inicio para el siguiente compañero.
  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => { setOk(null); reiniciar(); }, 5000);
    return () => clearTimeout(t);
  }, [ok]);

  const enviar = async (numeroFinal: string, pinFinal: string) => {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch(`${BASE}/fichaje/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroEmpleado: Number(numeroFinal),
          pin: pinFinal,
          deviceId: deviceId(),
          deviceNombre: navigator.userAgent.slice(0, 80),
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.message ?? "No se pudo registrar el fichaje.");
      setOk(body as Resultado);
    } catch (e) {
      setError((e as Error).message);
      setPin("");
    } finally {
      setEnviando(false);
    }
  };

  const tecla = (t: string) => {
    setError(null);
    const valor = paso === "numero" ? numero : pin;
    const set = paso === "numero" ? setNumero : setPin;

    if (t === "borrar") { set(valor.slice(0, -1)); return; }
    if (t === "ok") {
      if (paso === "numero") { if (numero) setPaso("pin"); return; }
      if (pin.length >= 4) enviar(numero, pin);
      return;
    }
    const max = paso === "numero" ? 5 : 6;
    if (valor.length >= max) return;
    const nuevo = valor + t;
    set(nuevo);
    // Con 4 dígitos de PIN se envía solo (los relojes de fichaje funcionan así).
    if (paso === "pin" && nuevo.length === 4) enviar(numero, nuevo);
  };

  // Pantalla de confirmación
  if (ok) {
    const entrada = ok.accion === "entrada";
    return (
      <div className={`grid min-h-screen place-items-center p-6 text-center ${entrada ? "bg-green-600" : "bg-crust-800"}`}>
        <div className="text-white">
          <p className="text-7xl">{entrada ? "👋" : "🏠"}</p>
          <h1 className="mt-4 font-display text-4xl font-bold">¡Hola, {ok.nombre}!</h1>
          <p className="mt-2 text-2xl">
            {entrada ? "Entrada registrada" : "Salida registrada"} ·{" "}
            {new Date(ok.hora).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {ok.horas != null && <p className="mt-1 text-lg opacity-90">Trabajaste {ok.horas} h. ¡Buen descanso!</p>}
          {!!ok.minutosTarde && (
            <p className="mt-3 inline-block rounded-xl bg-white/20 px-4 py-2 text-lg">
              Llegaste {ok.minutosTarde} min tarde
            </p>
          )}
          {!!ok.minutosAntes && (
            <p className="mt-3 inline-block rounded-xl bg-white/20 px-4 py-2 text-lg">
              Saliste {ok.minutosAntes} min antes del horario
            </p>
          )}
          <button onClick={() => { setOk(null); reiniciar(); }} className="mt-8 rounded-xl bg-white/20 px-6 py-3 font-semibold">
            Listo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-crust-50 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 text-center">
          <p className="font-display text-2xl font-bold text-crust-800">🥖 Don Julio</p>
          <p className="text-sm text-crust-500">
            {reloj.toLocaleDateString("es-UY", { weekday: "long", day: "2-digit", month: "long" })} ·{" "}
            <b>{reloj.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}</b>
          </p>
        </div>

        <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          <p className="mb-1 text-center text-sm font-medium text-crust-600">
            {paso === "numero" ? "Ingresá tu número de empleado" : "Ahora tu PIN"}
          </p>

          {/* Display */}
          <div className="mb-3 flex h-16 items-center justify-center rounded-xl bg-crust-50 text-3xl font-bold tracking-widest text-crust-800">
            {paso === "numero" ? numero || <span className="text-crust-300">—</span> : "•".repeat(pin.length) || <span className="text-crust-300">— — — —</span>}
          </div>

          {error && <p className="mb-3 rounded-lg bg-red-100 px-3 py-2 text-center text-sm font-medium text-red-700">{error}</p>}
          {enviando && <p className="mb-3 text-center text-sm text-crust-500">Verificando…</p>}

          {/* Teclado */}
          <div className="grid grid-cols-3 gap-2">
            {TECLAS.map((t) => (
              <button
                key={t}
                onClick={() => tecla(t)}
                disabled={enviando}
                className={`h-16 rounded-xl text-2xl font-semibold active:scale-95 disabled:opacity-50 ${
                  t === "ok"
                    ? "bg-green-600 text-white"
                    : t === "borrar"
                      ? "bg-crust-200 text-crust-700 text-base"
                      : "bg-crust-100 text-crust-800"
                }`}
              >
                {t === "borrar" ? "←" : t === "ok" ? "✓" : t}
              </button>
            ))}
          </div>

          {paso === "pin" && (
            <button onClick={reiniciar} className="mt-3 w-full py-2 text-sm text-crust-500">
              ← Cambiar número
            </button>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-crust-400">
          Marcá tu entrada al llegar y tu salida al irte.
        </p>
      </div>
    </div>
  );
}
