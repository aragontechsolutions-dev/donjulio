import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { puede } from "@donjulio/shared";
import { api } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { useAuth } from "../../lib/auth";

interface UsuarioRef { id: string; nombre: string; role: string }
interface Turno {
  id: string; inicio: string; fin: string | null; horas: number | null;
  minutosTarde: number | null; minutosAntes: number | null;
  horarioInicio: string | null; horarioFin: string | null;
  fotoEntradaUrl: string | null; fotoSalidaUrl: string | null;
  usuario: UsuarioRef;
}
interface Kiosco {
  token: string; deviceId: string | null; deviceNombre: string | null;
  deviceUltimoUso: string | null; vinculacionHasta: string | null; toleranciaMin: number;
  pedirFoto: boolean;
}
interface Horario { id: string; usuarioId: string; diaSemana: number; horaInicio: string; horaFin: string }
interface UsuarioLista { id: string; localId?: string; nombre: string; numeroEmpleado?: number }
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
interface TurnoAbierto { id: string; inicio: string; usuario?: UsuarioRef }

/** Miniatura de la foto del fichaje; se abre en grande al tocarla. */
function Foto({ url, alt }: { url: string | null; alt: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Ver la foto del fichaje">
      <img
        src={url}
        alt={alt}
        loading="lazy"
        className="h-8 w-8 rounded-full border border-crust-200 object-cover"
      />
    </a>
  );
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-UY", { weekday: "short", day: "2-digit", month: "2-digit" });
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }) : "—");
/** Duración legible desde el inicio hasta `ahora`. */
const desdeHace = (iso: string, ahora: number) => {
  const min = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
};

export default function TurnosAdmin() {
  const { user } = useAuth();
  // El enlace y el QR del tablet de fichaje son sólo del admin.
  const esAdmin = (user?.role ?? "").toUpperCase() === "ADMIN";
  const puedeVerHistorial = puede(user?.role, "turnos.verHistorial");
  const [enTurno, setEnTurno] = useState<TurnoAbierto[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [dias, setDias] = useState(14);
  const [kiosco, setKiosco] = useState<Kiosco | null>(null);
  const [qr, setQr] = useState("");
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);

  const loadKiosco = () => api.get<Kiosco>("/admin/turnos/kiosco").then(setKiosco).catch(() => {});
  const loadHorarios = () => {
    api.get<Horario[]>("/admin/horarios").then(setHorarios).catch(() => {});
    api.get<UsuarioLista[]>("/admin/usuarios").then(setUsuarios).catch(() => {});
  };
  const load = () => {
    api.get<TurnoAbierto[]>("/admin/turnos/en-turno").then(setEnTurno).catch(() => {});
    // El historial es de admin y caja. Un mozo lo pedía igual y se comía un
    // 403 cada 5 segundos, porque esto corre en un intervalo.
    if (puedeVerHistorial) {
      api.get<Turno[]>(`/admin/turnos?dias=${dias}`).then(setTurnos).catch(() => {});
    }
  };
  // Tiempo real: refresca entradas y salidas cada 5s (sin recargar la página).
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [dias]);
  useEffect(() => { if (esAdmin) { loadKiosco(); loadHorarios(); } }, [esAdmin]);

  // Reloj para que "desde hace X" avance solo mientras la pantalla está abierta.
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const kioscoUrl = kiosco ? `${window.location.origin}/fichaje/${kiosco.token}` : "";
  useEffect(() => {
    if (kioscoUrl) QRCode.toDataURL(kioscoUrl, { width: 200, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [kioscoUrl]);

  const vincular = async () => {
    try {
      await api.post("/admin/turnos/kiosco/vincular", { minutos: 10 });
      showToast("info", "Abrí el enlace en el tablet dentro de los próximos 10 minutos para vincularlo.");
      loadKiosco();
    } catch { /* toast */ }
  };
  const quitarDispositivo = async () => {
    if (!confirm("¿Quitar el tablet autorizado? Nadie podrá fichar hasta vincular otro.")) return;
    try { await api.del("/admin/turnos/kiosco/dispositivo"); loadKiosco(); } catch { /* toast */ }
  };
  const setTolerancia = async (minutos: number) => {
    setKiosco((k) => (k ? { ...k, toleranciaMin: minutos } : k));
    await api.patch("/admin/turnos/kiosco/tolerancia", { minutos }).catch(() => {});
  };
  const setPedirFoto = async (pedirFoto: boolean) => {
    setKiosco((k) => (k ? { ...k, pedirFoto } : k));
    try {
      await api.patch("/admin/turnos/kiosco/foto", { pedirFoto });
    } catch {
      loadKiosco(); // no se pudo guardar: vuelve al valor real
    }
  };
  const setHorario = async (usuarioId: string, diaSemana: number, horaInicio?: string, horaFin?: string) => {
    try {
      await api.put("/admin/horarios", { usuarioId, diaSemana, horaInicio, horaFin });
      loadHorarios();
    } catch { /* toast */ }
  };

  const rotarKiosco = async () => {
    if (!confirm("¿Generar un enlace nuevo? El tablet actual dejará de funcionar hasta que lo vuelvas a abrir.")) return;
    try { await api.post("/admin/turnos/kiosco/rotar"); loadKiosco(); } catch { /* toast */ }
  };

  // Horas por persona en el período consultado.
  const resumen = Object.values(
    turnos.reduce((acc: Record<string, { nombre: string; horas: number; turnos: number }>, t) => {
      const k = t.usuario.id;
      acc[k] ??= { nombre: t.usuario.nombre, horas: 0, turnos: 0 };
      acc[k].horas += t.horas ?? 0;
      acc[k].turnos += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b.horas - a.horas);

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-bold text-crust-800">Turnos</h1>
      <p className="mb-4 text-sm text-crust-500">Fichaje de entrada y salida del personal.</p>

      {/* Tablet de fichaje (sólo admin) */}
      {esAdmin && (
      <div className="mb-6 flex flex-wrap items-center gap-5 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
        {qr && <img src={qr} alt="QR del tablet de fichaje" className="h-28 w-28 rounded-lg" />}
        <div className="min-w-[240px] flex-1">
          <h3 className="font-semibold text-crust-800">Tablet de fichaje</h3>
          <p className="mb-2 text-sm text-crust-500">
            Abrí este enlace en el tablet del local. El personal ficha con su <b>número de empleado</b> y
            su <b>PIN</b>, sin necesidad de tener cuenta ni de iniciar sesión.
          </p>
          <p className="break-all rounded-lg bg-crust-50 px-2 py-1 text-xs text-crust-500">{kioscoUrl}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => { navigator.clipboard?.writeText(kioscoUrl); showToast("success", "Enlace copiado ✓"); }} className="rounded-lg bg-crust-100 px-3 py-1.5 text-xs font-semibold text-crust-700 hover:bg-crust-200">Copiar enlace</button>
            <a href={kioscoUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-crust-100 px-3 py-1.5 text-xs font-semibold text-crust-700 hover:bg-crust-200">Abrir</a>
            <button onClick={rotarKiosco} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">Regenerar</button>
          </div>
          <p className="mt-2 text-xs text-crust-400">
            El número y el PIN de cada persona se gestionan en <b>Usuarios</b>.
          </p>

          {/* Dispositivo autorizado */}
          <div className="mt-3 rounded-xl border border-crust-100 bg-crust-50 p-3">
            <p className="text-sm font-semibold text-crust-700">Tablet autorizado</p>
            {kiosco?.deviceId ? (
              <>
                <p className="text-sm text-green-700">
                  ✓ Vinculado{kiosco.deviceUltimoUso ? ` · último uso ${hora(kiosco.deviceUltimoUso)}` : ""}
                </p>
                <p className="truncate text-xs text-crust-400">{kiosco.deviceNombre}</p>
                <button onClick={quitarDispositivo} className="mt-2 rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50">
                  Quitar dispositivo
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-amber-700">
                  Ningún tablet autorizado — nadie puede fichar todavía.
                </p>
                <button onClick={vincular} className="mt-2 rounded-lg bg-dj-terracota px-3 py-1 text-xs font-semibold text-white hover:bg-dj-cobre">
                  Autorizar un tablet
                </button>
                {kiosco?.vinculacionHasta && new Date(kiosco.vinculacionHasta) > new Date() && (
                  <p className="mt-1 text-xs text-crust-500">
                    Ventana abierta: abrí el enlace en el tablet antes de las {hora(kiosco.vinculacionHasta)}.
                  </p>
                )}
              </>
            )}
            <p className="mt-2 text-xs text-crust-400">
              Sólo el dispositivo vinculado puede fichar. (Los navegadores no permiten leer la MAC,
              así que se identifica al tablet con un código propio guardado en él.)
            </p>
          </div>

          {/* Tolerancia */}
          <label className="mt-3 flex items-center gap-2 text-sm text-crust-600">
            Tolerancia de horario
            <input
              type="number" min={0} max={120}
              value={kiosco?.toleranciaMin ?? 10}
              onChange={(e) => setTolerancia(Number(e.target.value))}
              className="w-20 rounded-lg border border-crust-200 px-2 py-1"
            />
            <span className="text-xs text-crust-400">min de gracia antes de contar tarde / salida temprana</span>
          </label>

          {/* Foto al marcar */}
          <label className="mt-3 flex items-start gap-2 text-sm text-crust-600">
            <input
              type="checkbox"
              checked={kiosco?.pedirFoto ?? true}
              onChange={(e) => setPedirFoto(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Pedir foto al marcar
              <span className="block text-xs text-crust-400">
                El tablet saca una foto con la cámara frontal al fichar. Necesita HTTPS y permiso de
                cámara. Desactivalo si el tablet no tiene cámara.
              </span>
            </span>
          </label>
        </div>
      </div>
      )}

      {/* Horarios previstos */}
      {esAdmin && usuarios.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
          <div className="border-b border-crust-100 px-5 py-3">
            <h3 className="font-semibold text-crust-800">Horarios de trabajo</h3>
            <p className="text-sm text-crust-500">
              Horario semanal previsto de cada persona. Al fichar se compara con estas horas para
              detectar llegadas tarde y salidas antes de tiempo. Dejá un día vacío si no trabaja.
            </p>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-crust-50 text-left text-crust-600">
                <tr>
                  <th className="px-4 py-2">Persona</th>
                  {DIAS.map((d) => <th key={d} className="px-2 py-2 text-center">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {usuarios.filter((u) => u.localId).map((u) => (
                  <tr key={u.localId} className="border-t border-crust-50">
                    <td className="whitespace-nowrap px-4 py-2 font-medium text-crust-800">
                      {u.nombre} <span className="text-xs text-crust-400">#{u.numeroEmpleado}</span>
                    </td>
                    {DIAS.map((_, dia) => {
                      const h = horarios.find((x) => x.usuarioId === u.localId && x.diaSemana === dia);
                      return (
                        <td key={dia} className="px-1 py-2 text-center">
                          <div className="flex flex-col gap-1">
                            <input
                              type="time" defaultValue={h?.horaInicio ?? ""}
                              onBlur={(e) => {
                                const fin = (e.target.parentElement?.querySelector("[data-fin]") as HTMLInputElement)?.value;
                                setHorario(u.localId!, dia, e.target.value || undefined, fin || undefined);
                              }}
                              className="w-24 rounded border border-crust-200 px-1 py-0.5 text-xs"
                            />
                            <input
                              type="time" data-fin defaultValue={h?.horaFin ?? ""}
                              onBlur={(e) => {
                                const ini = (e.target.parentElement?.querySelector("input:not([data-fin])") as HTMLInputElement)?.value;
                                setHorario(u.localId!, dia, ini || undefined, e.target.value || undefined);
                              }}
                              className="w-24 rounded border border-crust-200 px-1 py-0.5 text-xs"
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* En turno ahora */}
        <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-crust-700">Trabajando ahora ({enTurno.length})</h3>
          <ul className="space-y-2 text-sm">
            {enTurno.map((t) => (
              <li key={t.id} className="flex items-center justify-between border-b border-crust-50 pb-2">
                <span className="flex items-center gap-2 text-crust-800">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-green-500" aria-hidden />
                  {t.usuario?.nombre}
                  <span className="text-xs text-crust-400">{t.usuario?.role}</span>
                </span>
                <span className="text-right text-xs text-crust-500">
                  desde {hora(t.inicio)}
                  <span className="block text-crust-400">{desdeHace(t.inicio, ahora)}</span>
                </span>
              </li>
            ))}
            {enTurno.length === 0 && <li className="text-crust-400">Nadie fichado en este momento.</li>}
          </ul>
        </div>

        {/* Historial: sólo para quien puede consultarlo. */}
        {puedeVerHistorial && (
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-crust-700">Historial</h3>
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="rounded-lg border border-crust-200 px-2 py-1 text-sm">
              <option value={7}>Últimos 7 días</option>
              <option value={14}>Últimos 14 días</option>
              <option value={30}>Últimos 30 días</option>
            </select>
          </div>

          {resumen.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {resumen.map((r) => (
                <span key={r.nombre} className="rounded-full bg-crust-100 px-3 py-1 text-xs font-medium text-crust-700">
                  {r.nombre}: <b>{r.horas.toFixed(1)} h</b> ({r.turnos})
                </span>
              ))}
            </div>
          )}

          <div className="tabla-marco overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
            <table className="tabla-cards w-full text-sm">
              <thead className="bg-crust-50 text-left text-crust-600">
                <tr>
                  <th className="px-4 py-3">Persona</th>
                  <th className="px-4 py-3">Día</th>
                  <th className="px-4 py-3">Entrada</th>
                  <th className="px-4 py-3">Salida</th>
                  <th className="px-4 py-3">Cumplimiento</th>
                  <th className="px-4 py-3 text-right">Horas</th>
                </tr>
              </thead>
              <tbody>
                {turnos.map((t) => (
                  <tr key={t.id} className="border-t border-crust-50">
                    <td data-principal className="px-4 py-2 font-medium text-crust-800">{t.usuario.nombre}</td>
                    <td data-etiqueta="Día" className="px-4 py-2 text-crust-500">{fecha(t.inicio)}</td>
                    <td data-etiqueta="Entrada" className="px-4 py-2 text-crust-600">
                      <span className="flex items-center gap-2">
                        <Foto url={t.fotoEntradaUrl} alt={`Entrada de ${t.usuario.nombre}`} />
                        {hora(t.inicio)}
                      </span>
                    </td>
                    <td data-etiqueta="Salida" className="px-4 py-2 text-crust-600">
                      <span className="flex items-center gap-2">
                        <Foto url={t.fotoSalidaUrl} alt={`Salida de ${t.usuario.nombre}`} />
                        {t.fin ? hora(t.fin) : <span className="text-green-600">en curso</span>}
                      </span>
                    </td>
                    <td data-etiqueta="Cumplimiento" className="px-4 py-2 text-xs">
                      {t.horarioInicio ? (
                        <span className="flex flex-wrap items-center gap-1">
                          <span className="text-crust-400">{t.horarioInicio}–{t.horarioFin}</span>
                          {!!t.minutosTarde && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">+{t.minutosTarde}′ tarde</span>}
                          {!!t.minutosAntes && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">−{t.minutosAntes}′ antes</span>}
                          {!t.minutosTarde && !t.minutosAntes && t.fin && <span className="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-700">en horario</span>}
                        </span>
                      ) : (
                        <span className="text-crust-300">sin horario</span>
                      )}
                    </td>
                    <td data-etiqueta="Horas" className="px-4 py-2 text-right font-semibold text-crust-700">{t.horas != null ? `${t.horas} h` : "—"}</td>
                  </tr>
                ))}
                {turnos.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-crust-400">Sin turnos en el período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
