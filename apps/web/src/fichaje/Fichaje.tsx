import { useCallback, useEffect, useRef, useState } from "react";
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
  /** Permiso para subir la foto de esta marca (null = kiosco sin foto). */
  fotoToken?: string | null;
}

/** Segundos de cuenta regresiva antes del disparo. */
const CUENTA_ATRAS = 3;
/** Si la cámara no arranca en este tiempo, se sigue sin foto. */
const ESPERA_CAMARA_MS = 6000;
/** Ancho de la captura: alcanza para reconocer a la persona y pesa poco. */
const ANCHO_FOTO = 480;

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
  // Paso de la foto: "foto" mientras se saca, "listo" en la pantalla final.
  const [fase, setFase] = useState<"foto" | "listo">("listo");
  const [cuenta, setCuenta] = useState(CUENTA_ATRAS);
  const [camaraLista, setCamaraLista] = useState(false);
  const [fotoTomada, setFotoTomada] = useState<string | null>(null);
  const [sinFoto, setSinFoto] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /** Apaga la cámara: la luz encendida al pedo asusta a cualquiera. */
  const apagarCamara = useCallback(() => {
    streamRef.current?.getTracks().forEach((p) => p.stop());
    streamRef.current = null;
    setCamaraLista(false);
  }, []);

  const reiniciar = useCallback(() => {
    apagarCamara();
    setPaso("numero");
    setNumero("");
    setPin("");
    setError(null);
    setFase("listo");
    setFotoTomada(null);
    setSinFoto(false);
    setCuenta(CUENTA_ATRAS);
  }, [apagarCamara]);

  // Al desmontar (o recargar el tablet) la cámara no queda prendida.
  useEffect(() => apagarCamara, [apagarCamara]);

  // Tras confirmar, vuelve solo al inicio para el siguiente compañero.
  useEffect(() => {
    if (!ok || fase !== "listo") return;
    const t = setTimeout(() => { setOk(null); reiniciar(); }, 5000);
    return () => clearTimeout(t);
  }, [ok, fase, reiniciar]);

  /** Saca el cuadro actual del video como JPEG. */
  const capturar = useCallback((): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return Promise.resolve(null);
    const escala = ANCHO_FOTO / video.videoWidth;
    const canvas = document.createElement("canvas");
    canvas.width = ANCHO_FOTO;
    canvas.height = Math.round(video.videoHeight * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    // La vista previa va espejada (uno se ve como en un espejo), pero se
    // guarda sin espejar: la foto es para reconocer a la persona.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  }, []);

  const subirFoto = useCallback(
    async (blob: Blob, fotoToken: string) => {
      const fd = new FormData();
      fd.append("fotoToken", fotoToken);
      fd.append("file", blob, "fichaje.jpg");
      const r = await fetch(`${BASE}/fichaje/${token}/foto`, { method: "POST", body: fd });
      if (!r.ok) throw new Error("No se pudo guardar la foto.");
    },
    [token],
  );

  /**
   * Enciende la cámara, cuenta hasta cero, saca la foto y la sube.
   *
   * La marca ya quedó registrada antes de llegar acá: si la cámara está
   * tapada, sin permiso o simplemente no hay, se sigue igual y sólo se avisa
   * que quedó sin foto. Nadie se queda sin fichar por un problema de cámara.
   */
  useEffect(() => {
    if (fase !== "foto" || !ok?.fotoToken) return;
    let vivo = true;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const terminar = (conFoto: boolean) => {
      if (!vivo) return;
      vivo = false;
      apagarCamara();
      setSinFoto(!conFoto);
      setFase("listo");
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 } },
          audio: false,
        });
        if (!vivo) {
          stream.getTracks().forEach((p) => p.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return terminar(false);
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        // Esperar a que haya imagen de verdad: si no, sale un cuadro negro.
        const inicio = Date.now();
        while (vivo && !video.videoWidth && Date.now() - inicio < ESPERA_CAMARA_MS) {
          await new Promise((r) => setTimeout(r, 100));
        }
        if (!vivo) return;
        if (!video.videoWidth) return terminar(false);
        setCamaraLista(true);

        // Cuenta regresiva 3 · 2 · 1.
        for (let n = CUENTA_ATRAS; n > 0; n--) {
          if (!vivo) return;
          setCuenta(n);
          await new Promise((r) => { temporizador = setTimeout(r, 1000); });
        }
        if (!vivo) return;
        setCuenta(0);

        const blob = await capturar();
        if (!vivo) return;
        if (!blob) return terminar(false);
        setFotoTomada(URL.createObjectURL(blob));
        // Se congela la foto un instante para que se vea que salió.
        await new Promise((r) => { temporizador = setTimeout(r, 700); });
        await subirFoto(blob, ok.fotoToken!);
        terminar(true);
      } catch {
        terminar(false);
      }
    })();

    return () => {
      vivo = false;
      if (temporizador) clearTimeout(temporizador);
      apagarCamara();
    };
  }, [fase, ok, apagarCamara, capturar, subirFoto]);

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
      const res = body as Resultado;
      setOk(res);
      // El kiosco pide foto: primero la cámara, después la bienvenida formal.
      setFase(res.fotoToken ? "foto" : "listo");
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

  // Pantalla de la foto: saludo corto, cuenta regresiva y disparo.
  if (ok && fase === "foto") {
    const primerNombre = ok.nombre.trim().split(/\s+/)[0];
    return (
      <div className="grid min-h-screen place-items-center bg-dj-carbon p-4 text-center text-dj-papel">
        <div className="w-full max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-marca text-dj-dorado">
            {ok.accion === "entrada" ? "Entrada registrada" : "Salida registrada"}
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold">
            {ok.accion === "entrada"
              ? `Te damos la bienvenida, ${primerNombre}`
              : `Que descanses, ${primerNombre}`}
          </h1>
          <p className="mt-2 text-dj-papel/60">Mirá a la cámara para la foto del fichaje</p>

          <div className="relative mx-auto mt-6 aspect-[4/3] w-full overflow-hidden rounded-sm border border-dj-papel/15 bg-black">
            {fotoTomada ? (
              <img src={fotoTomada} alt="Foto tomada" className="h-full w-full object-cover" />
            ) : (
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                // Espejada como un espejo de verdad; el archivo se guarda sin espejar.
                className="h-full w-full -scale-x-100 object-cover"
              />
            )}

            {!camaraLista && !fotoTomada && (
              <p className="absolute inset-0 grid place-items-center text-sm text-dj-papel/70">
                Encendiendo la cámara…
              </p>
            )}

            {camaraLista && !fotoTomada && (
              <div className="absolute inset-0 grid place-items-center">
                <span
                  key={cuenta}
                  className="font-display text-[7rem] font-bold leading-none text-dj-papel drop-shadow-[0_2px_12px_rgba(0,0,0,.7)] animate-[latir_1s_ease-out]"
                >
                  {cuenta > 0 ? cuenta : "📸"}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => { apagarCamara(); setSinFoto(true); setFase("listo"); }}
            className="mt-6 rounded-full border border-dj-papel/25 px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-dj-papel/70 hover:bg-dj-papel hover:text-dj-carbon"
          >
            Seguir sin foto
          </button>
        </div>
        <style>{`@keyframes latir{from{opacity:0;transform:scale(1.6)}to{opacity:1;transform:scale(1)}}`}</style>
      </div>
    );
  }

  // Pantalla de confirmación
  if (ok) {
    const entrada = ok.accion === "entrada";
    return (
      <div className="grid min-h-screen place-items-center bg-dj-carbon p-6 text-center text-dj-papel">
        <div>
          {fotoTomada ? (
            <img
              src={fotoTomada}
              alt=""
              className="mx-auto h-28 w-28 rounded-full border-2 border-dj-dorado object-cover"
            />
          ) : (
            <Sello
              tinta="#F5F0E6"
              acento={entrada ? "#C9A56B" : "#C0561D"}
              className="mx-auto h-28 w-28"
            />
          )}
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
          {sinFoto && (
            <p className="mt-6 text-sm text-dj-papel/50">
              Tu marca quedó registrada, pero sin foto (la cámara no respondió).
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
