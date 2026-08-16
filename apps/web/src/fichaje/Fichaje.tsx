import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { LogoHorizontal, Sello } from "../lib/Logo";

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
      <div className="grid min-h-screen place-items-center bg-dj-carbon p-6 text-center text-dj-papel">
        <div>
          <Sello
            tinta="#F5F0E6"
            acento={entrada ? "#C9A56B" : "#C0561D"}
            className="mx-auto h-28 w-28"
          />
          <p className="mt-8 text-[11px] font-semibold uppercase tracking-marca text-dj-dorado">
            {entrada ? "Entrada registrada" : "Salida registrada"}
          </p>
          <h1 className="mt-4 font-display text-5xl font-bold">
            {entrada ? `¡Hola, ${ok.nombre}!` : `Hasta mañana, ${ok.nombre}`}
          </h1>
          <p className="mt-4 font-display text-3xl tabular-nums text-dj-papel/80">
            {new Date(ok.hora).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {ok.horas != null && (
            <p className="mt-2 text-lg text-dj-papel/60">Trabajaste {ok.horas} h. ¡Buen descanso!</p>
          )}
          {!!ok.minutosTarde && (
            <p className="mt-6 inline-block border-l-2 border-dj-terracota bg-dj-papel/10 px-4 py-2 text-lg">
              Llegaste {ok.minutosTarde} min tarde
            </p>
          )}
          {!!ok.minutosAntes && (
            <p className="mt-6 inline-block border-l-2 border-dj-terracota bg-dj-papel/10 px-4 py-2 text-lg">
              Saliste {ok.minutosAntes} min antes del horario
            </p>
          )}
          <div>
            <button
              onClick={() => { setOk(null); reiniciar(); }}
              className="mt-10 rounded-full border border-dj-papel/30 px-8 py-3 text-xs font-semibold uppercase tracking-[0.16em] transition-colors hover:bg-dj-papel hover:text-dj-carbon"
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-dj-carbon p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <LogoHorizontal
            tinta="#F5F0E6"
            acento="#C9A56B"
            className="mx-auto h-11 w-auto"
          />
          <p className="mt-4 text-sm text-dj-papel/60 first-letter:uppercase">
            {reloj.toLocaleDateString("es-UY", { weekday: "long", day: "2-digit", month: "long" })}
          </p>
          <p className="font-display text-3xl tabular-nums text-dj-papel">
            {reloj.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>

        <div className="rounded-sm bg-dj-papel p-5 shadow-2xl">
          <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-marca text-dj-humo">
            {paso === "numero" ? "Tu número de empleado" : "Ahora tu PIN"}
          </p>

          {/* Display */}
          <div className="mb-4 flex h-16 items-center justify-center rounded-sm border border-dj-arena bg-white font-display text-3xl font-bold tracking-widest text-dj-carbon">
            {paso === "numero"
              ? numero || <span className="text-dj-arena">—</span>
              : "•".repeat(pin.length) || <span className="text-dj-arena">— — — —</span>}
          </div>

          {error && (
            <p className="mb-3 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-800">
              {error}
            </p>
          )}
          {enviando && (
            <p className="mb-3 text-center text-sm text-dj-humo">Verificando…</p>
          )}

          {/* Teclado */}
          <div className="grid grid-cols-3 gap-2">
            {TECLAS.map((t) => (
              <button
                key={t}
                onClick={() => tecla(t)}
                disabled={enviando}
                className={`h-16 rounded-sm font-display text-2xl font-semibold transition-colors active:scale-95 disabled:opacity-50 ${
                  t === "ok"
                    ? "bg-dj-terracota text-dj-papel hover:bg-dj-cobre"
                    : t === "borrar"
                      ? "border border-dj-arena bg-dj-crema text-lg text-dj-grafito hover:bg-dj-arena"
                      : "border border-dj-arena bg-white text-dj-carbon hover:bg-dj-crema"
                }`}
              >
                {t === "borrar" ? "←" : t === "ok" ? "✓" : t}
              </button>
            ))}
          </div>

          {paso === "pin" && (
            <button
              onClick={reiniciar}
              className="mt-4 w-full py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dj-humo hover:text-dj-terracota"
            >
              ← Cambiar número
            </button>
          )}
        </div>

        <p className="mt-5 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-dj-papel/40">
          Marcá tu entrada al llegar y tu salida al irte
        </p>
      </div>
    </div>
  );
}
