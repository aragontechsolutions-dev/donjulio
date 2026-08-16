import { useEffect, useState } from "react";
import { ReservaStatus } from "@donjulio/shared";
import { api } from "../../lib/api";
import { showToast } from "../../lib/toast";

interface MesaRef { id: string; numero: number; capacidad: number }
interface Reserva {
  id: string;
  nombre: string;
  telefono: string | null;
  personas: number;
  fechaHora: string;
  status: string;
  notas: string | null;
  mesa: MesaRef | null;
}

const ESTADOS = Object.values(ReservaStatus);
const LABEL: Record<string, string> = {
  PENDIENTE: "Pendiente",
  CONFIRMADA: "Confirmada",
  SENTADA: "Sentada",
  CANCELADA: "Cancelada",
  NO_SHOW: "No vino",
};
const CHIP: Record<string, string> = {
  PENDIENTE: "bg-amber-100 text-amber-700",
  CONFIRMADA: "bg-sky-100 text-sky-700",
  SENTADA: "bg-green-100 text-green-700",
  CANCELADA: "bg-crust-100 text-crust-500",
  NO_SHOW: "bg-red-100 text-red-600",
};

const hoyISO = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD local
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });

export default function ReservasAdmin() {
  const [fecha, setFecha] = useState(hoyISO());
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [mesas, setMesas] = useState<MesaRef[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nombre: "", telefono: "", personas: "2", hora: "20:00", mesaId: "", notas: "" });

  const load = () => {
    api.get<Reserva[]>(`/admin/reservas?fecha=${fecha}`).then(setReservas).catch(() => {});
  };
  useEffect(load, [fecha]);
  useEffect(() => {
    api.get<MesaRef[]>("/admin/salon/mesas").then(setMesas).catch(() => {});
  }, []);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) { showToast("error", "Ingresá el nombre de quien reserva."); return; }
    setSaving(true);
    try {
      await api.post("/admin/reservas", {
        nombre: form.nombre.trim(),
        fechaHora: new Date(`${fecha}T${form.hora}:00`).toISOString(),
        personas: Number(form.personas) || 2,
        ...(form.telefono.trim() ? { telefono: form.telefono.trim() } : {}),
        ...(form.mesaId ? { mesaId: form.mesaId } : {}),
        ...(form.notas.trim() ? { notas: form.notas.trim() } : {}),
      });
      setShowForm(false);
      setForm({ nombre: "", telefono: "", personas: "2", hora: "20:00", mesaId: "", notas: "" });
      load();
    } catch { /* toast del api */ } finally { setSaving(false); }
  };

  const cambiar = async (r: Reserva, data: Record<string, unknown>) => {
    try { await api.patch(`/admin/reservas/${r.id}`, data); load(); } catch { /* toast */ }
  };
  const eliminar = async (r: Reserva) => {
    if (!confirm(`¿Eliminar la reserva de ${r.nombre}?`)) return;
    try { await api.del(`/admin/reservas/${r.id}`); load(); } catch { /* toast */ }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-crust-800">Reservas</h1>
          <p className="text-sm text-crust-500">Reservas de mesa por día.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="rounded-lg border border-crust-200 px-3 py-2 text-sm" />
          <button onClick={() => setShowForm(!showForm)} className="rounded-lg bg-dj-terracota px-4 py-2 text-sm font-semibold text-white hover:bg-dj-cobre">
            {showForm ? "Cancelar" : "+ Nueva reserva"}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={crear} className="mb-6 grid gap-4 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crust-700">Nombre</span>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required placeholder="A nombre de…" className="w-full rounded-lg border border-crust-200 px-3 py-2" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crust-700">Teléfono</span>
            <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="099 123 456" className="w-full rounded-lg border border-crust-200 px-3 py-2" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crust-700">Personas</span>
            <input type="number" min="1" value={form.personas} onChange={(e) => setForm({ ...form, personas: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crust-700">Hora ({fecha})</span>
            <input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} required className="w-full rounded-lg border border-crust-200 px-3 py-2" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crust-700">Mesa <span className="font-normal text-crust-400">(opcional)</span></span>
            <select value={form.mesaId} onChange={(e) => setForm({ ...form, mesaId: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2">
              <option value="">— sin asignar —</option>
              {mesas.map((m) => <option key={m.id} value={m.id}>Mesa {m.numero} ({m.capacidad} p.)</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crust-700">Notas</span>
            <input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Ej: cumpleaños, silla para bebé" className="w-full rounded-lg border border-crust-200 px-3 py-2" />
          </label>
          <div className="sm:col-span-3">
            <button disabled={saving} className="rounded-lg bg-dj-terracota px-5 py-2.5 font-semibold text-white hover:bg-dj-cobre disabled:opacity-60">
              {saving ? "Guardando…" : "Registrar reserva"}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-crust-50 text-left text-crust-600">
            <tr>
              <th className="px-4 py-3">Hora</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3 text-center">Personas</th>
              <th className="px-4 py-3">Mesa</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {reservas.map((r) => (
              <tr key={r.id} className="border-t border-crust-50">
                <td className="px-4 py-3 font-semibold text-crust-800">{hora(r.fechaHora)}</td>
                <td className="px-4 py-3">
                  <span className="font-medium text-crust-800">{r.nombre}</span>
                  {r.telefono && <span className="ml-2 text-xs text-crust-400">{r.telefono}</span>}
                  {r.notas && <p className="text-xs italic text-amber-700">“{r.notas}”</p>}
                </td>
                <td className="px-4 py-3 text-center text-crust-600">👥 {r.personas}</td>
                <td className="px-4 py-3">
                  <select
                    value={r.mesa?.id ?? ""}
                    onChange={(e) => cambiar(r, { mesaId: e.target.value || null })}
                    className="rounded-lg border border-crust-200 px-2 py-1 text-sm"
                  >
                    <option value="">— sin asignar —</option>
                    {mesas.map((m) => <option key={m.id} value={m.id}>Mesa {m.numero}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={r.status}
                    onChange={(e) => cambiar(r, { status: e.target.value })}
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${CHIP[r.status]}`}
                  >
                    {ESTADOS.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => eliminar(r)} className="rounded-lg px-2 py-1 text-sm text-red-500 hover:bg-red-50">✕</button>
                </td>
              </tr>
            ))}
            {reservas.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-crust-400">No hay reservas para esta fecha.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-crust-400">
        Al marcar una reserva como <b>Sentada</b>, la mesa asignada pasa a ocupada. Si se cancela o
        el cliente no viene, la mesa se libera.
      </p>
    </div>
  );
}
