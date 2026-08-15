import { useEffect, useState } from "react";
import { PaymentMethod } from "@donjulio/shared";
import { api } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { formatUYU } from "../../lib/format";
import Modal from "../../lib/Modal";

interface Deposito { id: string; monto: string; metodo: string; createdAt: string }
interface Encargo {
  id: string;
  descripcion: string;
  porciones: number | null;
  pickupAt: string;
  precioTotal: string;
  senia: string;
  saldo: string;
  status: string;
  notas: string | null;
  cliente: { nombre: string; telefono: string | null } | null;
  depositos: Deposito[];
}

const ESTADOS = ["RESERVADO", "EN_PRODUCCION", "LISTO", "ENTREGADO", "CANCELADO"] as const;
const ESTADO_LABEL: Record<string, string> = {
  RESERVADO: "Reservado",
  EN_PRODUCCION: "En producción",
  LISTO: "Listo para retirar",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};
const ESTADO_CHIP: Record<string, string> = {
  RESERVADO: "bg-amber-100 text-amber-700",
  EN_PRODUCCION: "bg-sky-100 text-sky-700",
  LISTO: "bg-green-100 text-green-700",
  ENTREGADO: "bg-crust-100 text-crust-500",
  CANCELADO: "bg-red-100 text-red-600",
};
const METODOS: { m: PaymentMethod; label: string }[] = [
  { m: PaymentMethod.EFECTIVO, label: "Efectivo" },
  { m: PaymentMethod.MERCADO_PAGO_QR, label: "QR / MP" },
  { m: PaymentMethod.DEBITO, label: "Débito" },
  { m: PaymentMethod.CREDITO, label: "Crédito" },
  { m: PaymentMethod.TRANSFERENCIA, label: "Transferencia" },
];

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
/** Valor por defecto para el input datetime-local: mañana a las 10:00. */
const defaultPickup = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function EncargosAdmin() {
  const [encargos, setEncargos] = useState<Encargo[]>([]);
  const [filtro, setFiltro] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [pagoDe, setPagoDe] = useState<Encargo | null>(null);
  const [pago, setPago] = useState({ monto: "", metodo: PaymentMethod.EFECTIVO as string });
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    descripcion: "", porciones: "", pickupAt: defaultPickup(), precioTotal: "",
    senia: "", metodoSenia: PaymentMethod.EFECTIVO as string,
    clienteNombre: "", clienteTel: "", notas: "",
  });

  const load = () => {
    const qs = filtro ? `?status=${filtro}` : "";
    api.get<Encargo[]>(`/admin/encargos${qs}`).then(setEncargos).catch(() => {});
  };
  useEffect(load, [filtro]);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    const precio = Number(form.precioTotal);
    const senia = Number(form.senia || 0);
    if (!(precio > 0)) { showToast("error", "Ingresá el precio total."); return; }
    if (senia > precio) { showToast("error", "La seña no puede superar el precio total."); return; }
    setSaving(true);
    try {
      await api.post("/admin/encargos", {
        descripcion: form.descripcion,
        pickupAt: new Date(form.pickupAt).toISOString(),
        precioTotal: precio,
        ...(form.porciones ? { porciones: Number(form.porciones) } : {}),
        ...(form.notas.trim() ? { notas: form.notas.trim() } : {}),
        ...(form.clienteNombre.trim()
          ? { cliente: { nombre: form.clienteNombre.trim(), telefono: form.clienteTel.trim() || undefined } }
          : {}),
        ...(senia > 0 ? { senia, metodoSenia: form.metodoSenia } : {}),
      });
      setShowForm(false);
      setForm({ descripcion: "", porciones: "", pickupAt: defaultPickup(), precioTotal: "", senia: "", metodoSenia: PaymentMethod.EFECTIVO, clienteNombre: "", clienteTel: "", notas: "" });
      load();
    } catch { /* toast del api */ } finally { setSaving(false); }
  };

  const cambiarEstado = async (o: Encargo, status: string) => {
    await api.patch(`/admin/encargos/${o.id}`, { status }).catch(() => {});
    load();
  };

  const registrarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pagoDe) return;
    const monto = Number(pago.monto);
    if (!(monto > 0)) { showToast("error", "Ingresá un monto mayor a 0."); return; }
    setSaving(true);
    try {
      await api.post(`/admin/encargos/${pagoDe.id}/deposito`, { monto, metodo: pago.metodo });
      setPagoDe(null);
      load();
    } catch { /* toast del api */ } finally { setSaving(false); }
  };

  const abrirPago = (o: Encargo) => {
    setPago({ monto: String(Number(o.saldo)), metodo: PaymentMethod.EFECTIVO });
    setPagoDe(o);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-crust-800">Encargos</h1>
          <p className="text-sm text-crust-500">Tortas y pedidos especiales con seña y retiro programado.</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="rounded-lg bg-crust-600 px-4 py-2 text-sm font-semibold text-white hover:bg-crust-700">
          {showForm ? "Cancelar" : "+ Nuevo encargo"}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setFiltro("")} className={`rounded-full px-3 py-1.5 text-sm font-medium ${filtro === "" ? "bg-crust-600 text-white" : "bg-crust-100 text-crust-700"}`}>Todos</button>
        {ESTADOS.map((s) => (
          <button key={s} onClick={() => setFiltro(s)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${filtro === s ? "bg-crust-600 text-white" : "bg-crust-100 text-crust-700"}`}>
            {ESTADO_LABEL[s]}
          </button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={crear} className="mb-6 space-y-4 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-crust-700">¿Qué se encarga?</span>
              <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} required placeholder="Ej: Torta de chocolate con dulce de leche, decorada con frutillas" className="w-full rounded-lg border border-crust-200 px-3 py-2" />
              <span className="mt-1 block text-xs text-crust-400">Sabor, relleno, decoración, texto de la torta…</span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Porciones <span className="font-normal text-crust-400">(opcional)</span></span>
              <input type="number" min="1" value={form.porciones} onChange={(e) => setForm({ ...form, porciones: e.target.value })} placeholder="Ej: 20" className="w-full rounded-lg border border-crust-200 px-3 py-2" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Fecha y hora de retiro</span>
              <input type="datetime-local" value={form.pickupAt} onChange={(e) => setForm({ ...form, pickupAt: e.target.value })} required className="w-full rounded-lg border border-crust-200 px-3 py-2" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Precio total</span>
              <input type="number" step="0.01" min="0" value={form.precioTotal} onChange={(e) => setForm({ ...form, precioTotal: e.target.value })} required placeholder="Ej: 1800" className="w-full rounded-lg border border-crust-200 px-3 py-2" />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Seña que deja ahora</span>
                <input type="number" step="0.01" min="0" value={form.senia} onChange={(e) => setForm({ ...form, senia: e.target.value })} placeholder="0" className="w-full rounded-lg border border-crust-200 px-3 py-2" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">Medio</span>
                <select value={form.metodoSenia} onChange={(e) => setForm({ ...form, metodoSenia: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2">
                  {METODOS.map((m) => <option key={m.m} value={m.m}>{m.label}</option>)}
                </select>
              </label>
              {Number(form.precioTotal) > 0 && (
                <p className="col-span-2 text-xs text-crust-500">
                  Saldo a pagar al retirar: <b>{formatUYU(Math.max(0, Number(form.precioTotal) - Number(form.senia || 0)))}</b>
                </p>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Cliente <span className="font-normal text-crust-400">(opcional)</span></span>
              <input value={form.clienteNombre} onChange={(e) => setForm({ ...form, clienteNombre: e.target.value })} placeholder="Nombre" className="w-full rounded-lg border border-crust-200 px-3 py-2" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Teléfono <span className="font-normal text-crust-400">(opcional)</span></span>
              <input value={form.clienteTel} onChange={(e) => setForm({ ...form, clienteTel: e.target.value })} placeholder="099 123 456" className="w-full rounded-lg border border-crust-200 px-3 py-2" />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-crust-700">Notas internas <span className="font-normal text-crust-400">(opcional)</span></span>
              <textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Ej: sin nueces (alergia), entregar en caja alta" className="w-full rounded-lg border border-crust-200 px-3 py-2 text-sm" />
            </label>
          </div>
          <button disabled={saving} className="rounded-lg bg-crust-600 px-5 py-2.5 font-semibold text-white hover:bg-crust-700 disabled:opacity-60">
            {saving ? "Guardando…" : "Registrar encargo"}
          </button>
          <p className="text-xs text-crust-400">Si cobrás seña, se registra en la caja abierta del turno.</p>
        </form>
      )}

      <div className="space-y-3">
        {encargos.map((o) => {
          const vencido = new Date(o.pickupAt) < new Date() && !["ENTREGADO", "CANCELADO"].includes(o.status);
          return (
            <div key={o.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${vencido ? "border-red-200" : "border-crust-100"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO_CHIP[o.status]}`}>{ESTADO_LABEL[o.status]}</span>
                    <span className={`text-sm font-medium ${vencido ? "text-red-600" : "text-crust-600"}`}>📅 {fechaHora(o.pickupAt)}{vencido ? " · vencido" : ""}</span>
                  </div>
                  <p className="mt-1 font-medium text-crust-900">{o.descripcion}</p>
                  <p className="text-sm text-crust-500">
                    {o.porciones ? `${o.porciones} porciones · ` : ""}
                    {o.cliente ? `${o.cliente.nombre}${o.cliente.telefono ? ` · ${o.cliente.telefono}` : ""}` : "Sin cliente"}
                  </p>
                  {o.notas && <p className="mt-1 text-sm italic text-amber-700">“{o.notas}”</p>}
                </div>

                <div className="text-right text-sm">
                  <p className="text-crust-500">Total <b className="text-crust-800">{formatUYU(o.precioTotal)}</b></p>
                  <p className="text-crust-500">Pagado <b className="text-green-700">{formatUYU(o.senia)}</b></p>
                  <p className={Number(o.saldo) > 0 ? "font-bold text-red-600" : "font-bold text-green-600"}>
                    Saldo {formatUYU(o.saldo)}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-crust-50 pt-3">
                <select value={o.status} onChange={(e) => cambiarEstado(o, e.target.value)} className="rounded-lg border border-crust-200 px-2 py-1 text-sm">
                  {ESTADOS.map((s) => <option key={s} value={s}>{ESTADO_LABEL[s]}</option>)}
                </select>
                {Number(o.saldo) > 0 && o.status !== "CANCELADO" && (
                  <button onClick={() => abrirPago(o)} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700">
                    Registrar pago
                  </button>
                )}
                {o.depositos.length > 0 && (
                  <span className="text-xs text-crust-400">
                    Pagos: {o.depositos.map((d) => `${formatUYU(d.monto)}`).join(" + ")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {encargos.length === 0 && (
          <p className="rounded-2xl border border-crust-100 bg-white p-10 text-center text-crust-400">
            No hay encargos {filtro ? `en estado "${ESTADO_LABEL[filtro]}"` : "registrados"}.
          </p>
        )}
      </div>

      {pagoDe && (
        <Modal title="Registrar pago" subtitle={pagoDe.descripcion.slice(0, 60)} onClose={() => setPagoDe(null)}>
          <form onSubmit={registrarPago} className="space-y-4">
            <div className="flex justify-between rounded-lg bg-crust-50 px-3 py-2 text-sm">
              <span className="text-crust-600">Saldo pendiente</span>
              <span className="font-bold text-crust-900">{formatUYU(pagoDe.saldo)}</span>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Monto que paga</span>
              <input type="number" step="0.01" min="0.01" autoFocus required value={pago.monto} onChange={(e) => setPago({ ...pago, monto: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2" />
              <span className="mt-1 block text-xs text-crust-400">Puede ser un pago parcial. Se registra en la caja del turno.</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Medio de pago</span>
              <select value={pago.metodo} onChange={(e) => setPago({ ...pago, metodo: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2">
                {METODOS.map((m) => <option key={m.m} value={m.m}>{m.label}</option>)}
              </select>
            </label>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-crust-600 py-2 font-semibold text-white hover:bg-crust-700 disabled:opacity-60">
                {saving ? "Guardando…" : "Registrar pago"}
              </button>
              <button type="button" onClick={() => setPagoDe(null)} className="rounded-lg border border-crust-200 px-4 py-2 text-crust-700 hover:bg-crust-100">Cancelar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
