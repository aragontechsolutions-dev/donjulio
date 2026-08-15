import { useEffect, useState } from "react";
import { api } from "../../lib/api";

interface UsuarioRef { id: string; nombre: string; role: string }
interface Turno { id: string; inicio: string; fin: string | null; horas: number | null; usuario: UsuarioRef }
interface TurnoAbierto { id: string; inicio: string; usuario?: UsuarioRef }

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-UY", { weekday: "short", day: "2-digit", month: "2-digit" });
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }) : "—");
/** Duración legible desde el inicio hasta ahora. */
const desdeHace = (iso: string) => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} h ${min % 60} min` : `${min} min`;
};

export default function TurnosAdmin() {
  const [mio, setMio] = useState<TurnoAbierto | null>(null);
  const [enTurno, setEnTurno] = useState<TurnoAbierto[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [dias, setDias] = useState(14);

  const load = () => {
    api.get<TurnoAbierto | null>("/admin/turnos/actual").then(setMio).catch(() => {});
    api.get<TurnoAbierto[]>("/admin/turnos/en-turno").then(setEnTurno).catch(() => {});
    api.get<Turno[]>(`/admin/turnos?dias=${dias}`).then(setTurnos).catch(() => {});
  };
  useEffect(load, [dias]);

  const fichar = async (accion: "entrada" | "salida") => {
    try { await api.post(`/admin/turnos/${accion}`); load(); } catch { /* toast del api */ }
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

      {/* Mi turno */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
        <div>
          <p className="text-sm text-crust-500">Mi turno</p>
          {mio ? (
            <p className="font-semibold text-green-700">
              En turno desde las {hora(mio.inicio)} · {desdeHace(mio.inicio)}
            </p>
          ) : (
            <p className="font-semibold text-crust-600">No estás fichado</p>
          )}
        </div>
        {mio ? (
          <button onClick={() => fichar("salida")} className="rounded-lg bg-crust-800 px-5 py-2.5 font-semibold text-white hover:bg-crust-900">
            Fichar salida
          </button>
        ) : (
          <button onClick={() => fichar("entrada")} className="rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white hover:bg-green-700">
            Fichar entrada
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* En turno ahora */}
        <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-crust-700">Trabajando ahora ({enTurno.length})</h3>
          <ul className="space-y-2 text-sm">
            {enTurno.map((t) => (
              <li key={t.id} className="flex items-center justify-between border-b border-crust-50 pb-2">
                <span className="text-crust-800">
                  {t.usuario?.nombre}
                  <span className="ml-2 text-xs text-crust-400">{t.usuario?.role}</span>
                </span>
                <span className="text-xs text-crust-500">desde {hora(t.inicio)}</span>
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
