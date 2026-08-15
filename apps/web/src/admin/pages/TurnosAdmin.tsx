import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "../../lib/api";
import { showToast } from "../../lib/toast";

interface UsuarioRef { id: string; nombre: string; role: string }
interface Turno { id: string; inicio: string; fin: string | null; horas: number | null; usuario: UsuarioRef }
interface TurnoAbierto { id: string; inicio: string; usuario?: UsuarioRef }

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-UY", { weekday: "short", day: "2-digit", month: "2-digit" });
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }) : "—");
/** Duración legible desde el inicio hasta `ahora`. */
const desdeHace = (iso: string, ahora: number) => {
  const min = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
};

export default function TurnosAdmin() {
  const [enTurno, setEnTurno] = useState<TurnoAbierto[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [dias, setDias] = useState(14);
  const [kiosco, setKiosco] = useState<{ token: string } | null>(null);
  const [qr, setQr] = useState("");

  const loadKiosco = () => api.get<{ token: string }>("/admin/turnos/kiosco").then(setKiosco).catch(() => {});
  const load = () => {
    api.get<TurnoAbierto[]>("/admin/turnos/en-turno").then(setEnTurno).catch(() => {});
    api.get<Turno[]>(`/admin/turnos?dias=${dias}`).then(setTurnos).catch(() => {});
  };
  // Tiempo real: refresca entradas y salidas cada 5s (sin recargar la página).
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [dias]);
  useEffect(() => { loadKiosco(); }, []);

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

      {/* Tablet de fichaje */}
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
        </div>
      </div>

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

        {/* Historial */}
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

          <div className="overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-crust-50 text-left text-crust-600">
                <tr>
                  <th className="px-4 py-3">Persona</th>
                  <th className="px-4 py-3">Día</th>
                  <th className="px-4 py-3">Entrada</th>
                  <th className="px-4 py-3">Salida</th>
                  <th className="px-4 py-3 text-right">Horas</th>
                </tr>
              </thead>
              <tbody>
                {turnos.map((t) => (
                  <tr key={t.id} className="border-t border-crust-50">
                    <td className="px-4 py-2 font-medium text-crust-800">{t.usuario.nombre}</td>
                    <td className="px-4 py-2 text-crust-500">{fecha(t.inicio)}</td>
                    <td className="px-4 py-2 text-crust-600">{hora(t.inicio)}</td>
                    <td className="px-4 py-2 text-crust-600">{t.fin ? hora(t.fin) : <span className="text-green-600">en curso</span>}</td>
                    <td className="px-4 py-2 text-right font-semibold text-crust-700">{t.horas != null ? `${t.horas} h` : "—"}</td>
                  </tr>
                ))}
                {turnos.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-crust-400">Sin turnos en el período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
