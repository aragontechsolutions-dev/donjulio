import { useEffect, useState } from "react";
import { CashMovementType, PaymentMethod } from "@donjulio/shared";
import { api } from "../../lib/api";
import { formatUYU } from "../../lib/format";

interface Movimiento {
  id: string;
  tipo: string;
  metodoPago: string | null;
  monto: string;
  referencia: string | null;
  createdAt: string;
}
interface Session {
  id: string;
  openingFloat: string;
  etiqueta: string | null;
  openedAt: string;
  movimientos: Movimiento[];
}
interface Arqueo {
  expected: number;
  difference: number;
  conciliacion: Record<string, number>;
}

const TIPOS = Object.values(CashMovementType);
const METODOS = Object.values(PaymentMethod);

export default function CajaAdmin() {
  const [session, setSession] = useState<Session | null>(null);
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);
  const [openFloat, setOpenFloat] = useState(1000);
  const [mov, setMov] = useState({ tipo: "SALE", metodoPago: "EFECTIVO", monto: 0, referencia: "" });
  const [closing, setClosing] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.get<Session | null>("/admin/caja/actual").then(setSession).catch(() => {});
  };
  useEffect(load, []);

  const abrir = async () => {
    setError(null);
    try { await api.post("/admin/caja/abrir", { openingFloat: Number(openFloat) }); setArqueo(null); load(); }
    catch (e) { setError((e as Error).message); }
  };
  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    await api.post(`/admin/caja/${session.id}/movimiento`, {
      tipo: mov.tipo,
      ...(mov.tipo === "SALE" ? { metodoPago: mov.metodoPago } : {}),
      monto: Number(mov.monto),
      referencia: mov.referencia || undefined,
    });
    setMov({ ...mov, monto: 0, referencia: "" });
    load();
  };
  const cerrar = async () => {
    if (!session) return;
    const res = await api.post<Arqueo>(`/admin/caja/${session.id}/cerrar`, { closingCount: Number(closing) });
    setArqueo(res);
    setSession(null);
  };

  if (!session) {
    return (
      <div>
        <h1 className="mb-6 font-display text-2xl font-bold text-crust-800">Caja</h1>
        {arqueo && (
          <div className="mb-6 rounded-2xl border border-crust-100 bg-white p-6 shadow-sm">
            <h3 className="mb-3 font-display text-lg font-semibold text-crust-800">Arqueo de cierre</h3>
            <div className="flex justify-between border-b border-crust-50 py-1"><span>Esperado en efectivo</span><span className="font-semibold">{formatUYU(arqueo.expected)}</span></div>
            <div className="flex justify-between py-1">
              <span>Diferencia</span>
              <span className={`font-bold ${arqueo.difference === 0 ? "text-green-600" : "text-red-600"}`}>{formatUYU(arqueo.difference)} {arqueo.difference === 0 ? "✓ cuadra" : "descuadre"}</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-crust-600">Conciliación por medio de pago</p>
            <ul className="text-sm text-crust-600">
              {Object.entries(arqueo.conciliacion).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k.replace(/_/g, " ")}</span><span>{formatUYU(v)}</span></li>)}
            </ul>
          </div>
        )}
        <div className="max-w-md rounded-2xl border border-crust-100 bg-white p-6 shadow-sm">
          <p className="mb-3 text-crust-600">No hay caja abierta. Abrí un turno con el fondo inicial.</p>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <label className="mb-3 block text-sm font-medium text-crust-700">Fondo inicial</label>
          <input type="number" value={openFloat} onChange={(e) => setOpenFloat(Number(e.target.value))} className="mb-4 w-full rounded-lg border border-crust-200 px-3 py-2" />
          <button onClick={abrir} className="w-full rounded-lg bg-crust-600 py-2.5 font-semibold text-white hover:bg-crust-700">Abrir caja</button>
        </div>
      </div>
    );
  }

  const totalVentas = session.movimientos.filter((m) => m.tipo === "SALE").reduce((a, m) => a + Number(m.monto), 0);

  return (
    <div>
      <h1 className="mb-1 font-display text-2xl font-bold text-crust-800">Caja abierta</h1>
      <p className="mb-6 text-sm text-crust-500">
        {session.etiqueta ? session.etiqueta + " · " : ""}Desde {new Date(session.openedAt).toLocaleString("es-UY")} · Fondo {formatUYU(session.openingFloat)} · Ventas {formatUYU(totalVentas)}
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={agregar} className="space-y-3 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-crust-700">Registrar movimiento</h3>
          <select value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2">
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {mov.tipo === "SALE" && (
            <select value={mov.metodoPago} onChange={(e) => setMov({ ...mov, metodoPago: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2">
              {METODOS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
            </select>
          )}
          <input type="number" step="0.01" placeholder="Monto" value={mov.monto} onChange={(e) => setMov({ ...mov, monto: Number(e.target.value) })} className="w-full rounded-lg border border-crust-200 px-3 py-2" />
          <input placeholder="Referencia (opcional)" value={mov.referencia} onChange={(e) => setMov({ ...mov, referencia: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2" />
          <button className="w-full rounded-lg bg-crust-600 py-2 font-semibold text-white hover:bg-crust-700">Agregar</button>
        </form>

        <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm lg:col-span-1">
          <h3 className="mb-3 font-semibold text-crust-700">Movimientos ({session.movimientos.length})</h3>
          <ul className="max-h-80 space-y-1 overflow-auto text-sm">
            {session.movimientos.map((m) => (
              <li key={m.id} className="flex justify-between border-b border-crust-50 py-1">
                <span className="text-crust-600">{m.tipo}{m.metodoPago ? ` · ${m.metodoPago.replace(/_/g, " ")}` : ""}</span>
                <span className={m.tipo === "SALE" || m.tipo === "IN" ? "text-green-600" : "text-red-600"}>{formatUYU(m.monto)}</span>
              </li>
            ))}
            {session.movimientos.length === 0 && <li className="text-crust-400">Sin movimientos.</li>}
          </ul>
        </div>

        <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-crust-700">Cerrar caja (arqueo)</h3>
          <label className="mb-2 block text-sm text-crust-600">Efectivo contado</label>
          <input type="number" step="0.01" value={closing} onChange={(e) => setClosing(Number(e.target.value))} className="mb-4 w-full rounded-lg border border-crust-200 px-3 py-2" />
          <button onClick={cerrar} className="w-full rounded-lg bg-crust-800 py-2.5 font-semibold text-white hover:bg-crust-900">Cerrar y arquear</button>
        </div>
      </div>
    </div>
  );
}
