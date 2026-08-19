import { useCallback, useEffect, useRef, useState } from "react";
import { CashMovementType, PaymentMethod, resumirCaja } from "@donjulio/shared";
import type { ResumenCaja } from "@donjulio/shared";
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
  /** Arqueo en vivo calculado por la API (misma cuenta que el cierre). */
  resumen?: ResumenCaja;
}
interface Arqueo {
  expected: number;
  difference: number;
  conciliacion: Record<string, number>;
  resumen?: ResumenCaja;
  tolerance: number;
  cuadra: boolean;
  justificacion: string | null;
}

/** Cada cuánto se vuelve a pedir la caja para ver los cobros de la PWA. */
const REFRESCO_MS = 5000;

const TIPOS = Object.values(CashMovementType);
const METODOS = Object.values(PaymentMethod);

/** Etiquetas en español para los conceptos de caja. */
const TIPO_LABEL: Record<string, string> = {
  SALE: "Venta",
  IN: "Ingreso de efectivo",
  OUT: "Egreso de efectivo",
  WITHDRAWAL: "Retiro de caja",
  EXPENSE: "Gasto menor",
};
/** Ayuda contextual por concepto. */
const TIPO_HELP: Record<string, string> = {
  SALE: "Cobro de una venta. Elegí el medio de pago.",
  IN: "Entra plata a la caja que no es una venta (ej: aporte, cambio).",
  OUT: "Sale plata de la caja (ej: pago a proveedor en el momento).",
  WITHDRAWAL: "Retiro de efectivo de la caja (ej: llevar al banco).",
  EXPENSE: "Gasto chico pagado de la caja (ej: bolsas, delivery).",
};
/** Etiquetas en español para los medios de pago. */
const METODO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  MERCADO_PAGO_QR: "Mercado Pago (QR)",
  MERCADO_PAGO_CHECKOUT: "Mercado Pago (Checkout)",
  TRANSFERENCIA: "Transferencia",
  ABITAB: "Abitab",
  REDPAGOS: "Redpagos",
};
const metodoLabel = (m: string | null) => (m ? METODO_LABEL[m] ?? m.replace(/_/g, " ") : "");
const tipoLabel = (t: string) => TIPO_LABEL[t] ?? t;
/** Billetes uruguayos frecuentes para el cálculo de vuelto. */
const BILLETES = [200, 500, 1000, 2000];

export default function CajaAdmin() {
  const [session, setSession] = useState<Session | null>(null);
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);
  const [openFloat, setOpenFloat] = useState(1000);
  const [mov, setMov] = useState({ tipo: "SALE", metodoPago: "EFECTIVO", monto: "", referencia: "", recibido: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [closing, setClosing] = useState("");
  const [justificacion, setJustificacion] = useState("");
  const [tolerance, setTolerance] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null);
  const [syncCaida, setSyncCaida] = useState(false);
  // Ids ya vistos: lo que aparezca después (típicamente un cobro de la PWA) se
  // marca como nuevo para que el cajero lo note sin tener que comparar totales.
  const vistos = useRef<Set<string> | null>(null);
  const [nuevos, setNuevos] = useState<Set<string>>(new Set());
  // Evita que dos refrescos se pisen si la red va lenta.
  const enVuelo = useRef(false);

  const load = useCallback(async () => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    try {
      const s = await api.get<Session | null>("/admin/caja/actual");
      setSession(s);
      setSyncCaida(false);
      setUltimaSync(new Date());
      const ids = new Set((s?.movimientos ?? []).map((m) => m.id));
      if (vistos.current === null) {
        // Primera carga: nada es "nuevo", ya estaba ahí al entrar.
        vistos.current = ids;
      } else {
        const recien = [...ids].filter((id) => !vistos.current!.has(id));
        vistos.current = ids;
        if (recien.length) setNuevos((prev) => new Set([...prev, ...recien]));
      }
    } catch {
      // Un corte de red no debe vaciar la pantalla: se avisa y se reintenta.
      setSyncCaida(true);
    } finally {
      enVuelo.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    api.get<{ tolerance: number }>("/admin/caja/config").then((c) => setTolerance(c.tolerance)).catch(() => {});
  }, [load]);

  // Refresco automático: los cobros que entran por la PWA aparecen solos.
  // Con la pestaña en segundo plano se pausa para no pegarle a la API de gusto.
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined;
    const arrancar = () => {
      if (t) return;
      t = setInterval(load, REFRESCO_MS);
    };
    const parar = () => {
      if (t) clearInterval(t);
      t = undefined;
    };
    const alCambiarVisibilidad = () => {
      if (document.hidden) parar();
      else {
        load();
        arrancar();
      }
    };
    if (!document.hidden) arrancar();
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [load]);

  // El resaltado de "nuevo" se apaga solo a los 15 s.
  useEffect(() => {
    if (nuevos.size === 0) return;
    const t = setTimeout(() => setNuevos(new Set()), 15000);
    return () => clearTimeout(t);
  }, [nuevos]);

  const abrir = async () => {
    setError(null);
    try { await api.post("/admin/caja/abrir", { openingFloat: Number(openFloat) }); setArqueo(null); load(); }
    catch (e) { setError((e as Error).message); }
  };
  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setFormError(null);
    const montoNum = Number(mov.monto);
    // Validaciones comunes a toda operación.
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setFormError("Ingresá un monto mayor a 0.");
      return;
    }
    // Validación específica de venta en efectivo: el recibido no puede ser menor.
    const esVentaEfectivo = mov.tipo === "SALE" && mov.metodoPago === "EFECTIVO";
    if (esVentaEfectivo && mov.recibido !== "") {
      const rec = Number(mov.recibido);
      if (rec < montoNum) {
        setFormError("El efectivo recibido es menor al total a cobrar.");
        return;
      }
    }
    try {
      await api.post(`/admin/caja/${session.id}/movimiento`, {
        tipo: mov.tipo,
        ...(mov.tipo === "SALE" ? { metodoPago: mov.metodoPago } : {}),
        monto: montoNum,
        referencia: mov.referencia || undefined,
      });
      setMov({ ...mov, monto: "", referencia: "", recibido: "" });
      load();
    } catch {
      /* el toast de error lo dispara el api client */
    }
  };
  const cerrar = async () => {
    if (!session) return;
    setError(null);
    try {
      const res = await api.post<Arqueo>(`/admin/caja/${session.id}/cerrar`, {
        closingCount: Number(closing),
        ...(justificacion.trim() ? { justificacion: justificacion.trim() } : {}),
      });
      setArqueo(res);
      setSession(null);
      setClosing("");
      setJustificacion("");
    } catch (e) {
      setError((e as Error).message);
    }
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
              <span className={`font-bold ${arqueo.cuadra ? "text-green-600" : "text-red-600"}`}>
                {arqueo.difference > 0 ? "+" : ""}{formatUYU(arqueo.difference)} {arqueo.difference === 0 ? "✓ cuadra" : arqueo.cuadra ? "(dentro de tolerancia)" : arqueo.difference > 0 ? "sobrante" : "faltante"}
              </span>
            </div>
            {arqueo.justificacion && (
              <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <span className="font-semibold">Motivo:</span> {arqueo.justificacion}
              </div>
            )}
            <p className="mt-4 text-sm font-semibold text-crust-600">Conciliación por medio de pago</p>
            <p className="mb-2 text-xs text-crust-400">
              El efectivo es lo único que estaba en el cajón. El resto ya entró por el POS o Mercado Pago:
              se controla contra el cierre de la terminal, no contra la plata contada.
            </p>
            <ul className="text-sm text-crust-600">
              <li className="flex justify-between border-b border-crust-50 py-1">
                <span>Ventas en efectivo</span>
                <span className="font-medium tabular-nums">{formatUYU(arqueo.conciliacion.EFECTIVO ?? 0)}</span>
              </li>
              {Object.entries(arqueo.conciliacion)
                .filter(([k]) => k !== "EFECTIVO")
                .map(([k, v]) => (
                  <li key={k} className="flex justify-between py-1">
                    <span>{metodoLabel(k)}</span>
                    <span className="tabular-nums">{formatUYU(v)}</span>
                  </li>
                ))}
              {arqueo.resumen && arqueo.resumen.totalNoEfectivo > 0 && (
                <li className="mt-1 flex justify-between border-t border-crust-100 pt-1 font-semibold text-crust-800">
                  <span>Total a conciliar fuera del cajón</span>
                  <span className="tabular-nums">{formatUYU(arqueo.resumen.totalNoEfectivo)}</span>
                </li>
              )}
            </ul>
          </div>
        )}
        <div className="max-w-md rounded-2xl border border-crust-100 bg-white p-6 shadow-sm">
          <p className="mb-3 text-crust-600">No hay caja abierta. Abrí un turno con el fondo inicial.</p>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <label className="mb-3 block text-sm font-medium text-crust-700">Fondo inicial</label>
          <input type="number" value={openFloat} onChange={(e) => setOpenFloat(Number(e.target.value))} className="mb-4 w-full rounded-lg border border-crust-200 px-3 py-2" />
          <button onClick={abrir} className="w-full rounded-lg bg-dj-terracota py-2.5 font-semibold text-white hover:bg-dj-cobre">Abrir caja</button>
        </div>
      </div>
    );
  }

  // Derivados para la calculadora de vuelto.
  const montoNum = Number(mov.monto) || 0;
  const recibidoNum = Number(mov.recibido) || 0;
  const esVentaEfectivo = mov.tipo === "SALE" && mov.metodoPago === "EFECTIVO";
  const vuelto = recibidoNum - montoNum;

  // Arqueo en vivo. Lo calcula la API; si por lo que sea no vino (caché de una
  // versión anterior), se rehace acá con la misma función compartida.
  const resumen = session.resumen ?? resumirCaja(session.movimientos, session.openingFloat);
  const efectivoEsperado = resumen.efectivoEsperado;
  const totalVentas = resumen.totalVentas;
  const closingNum = Number(closing) || 0;
  const descuadre = closing === "" ? 0 : closingNum - efectivoEsperado;
  const fueraDeTolerancia = Math.abs(descuadre) > tolerance;
  const requiereMotivo = closing !== "" && fueraDeTolerancia;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-crust-800">Caja abierta</h1>
        <div className="flex items-center gap-2 text-xs">
          {syncCaida ? (
            <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-700">
              Sin conexión · reintentando
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" aria-hidden />
              En vivo{ultimaSync ? ` · ${ultimaSync.toLocaleTimeString("es-UY")}` : ""}
            </span>
          )}
          <button
            type="button"
            onClick={load}
            className="control-compacto rounded-full border border-crust-200 px-2.5 py-1 font-medium text-crust-600 hover:bg-crust-50"
          >
            Actualizar
          </button>
        </div>
      </div>
      <p className="mb-6 text-sm text-crust-500">
        {session.etiqueta ? session.etiqueta + " · " : ""}Desde {new Date(session.openedAt).toLocaleString("es-UY")} · Fondo {formatUYU(session.openingFloat)} · Ventas {formatUYU(totalVentas)}
      </p>

      {/* Reparto del turno: qué se cuenta y qué se concilia aparte. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-crust-700">En el cajón (efectivo)</h3>
          <p className="mb-3 text-xs text-crust-400">Esto es lo único que se cuenta al cerrar.</p>
          <ul className="space-y-1 text-sm text-crust-600">
            <li className="flex justify-between"><span>Fondo inicial</span><span className="tabular-nums">{formatUYU(resumen.fondoInicial)}</span></li>
            <li className="flex justify-between"><span>+ Ventas en efectivo</span><span className="tabular-nums">{formatUYU(resumen.ventasEfectivo)}</span></li>
            <li className="flex justify-between"><span>+ Otros ingresos</span><span className="tabular-nums">{formatUYU(resumen.ingresos)}</span></li>
            <li className="flex justify-between"><span>− Retiros y gastos</span><span className="tabular-nums">{formatUYU(resumen.egresos)}</span></li>
          </ul>
          <div className="mt-3 flex items-baseline justify-between border-t border-crust-100 pt-2">
            <span className="text-sm font-semibold text-crust-700">Tiene que haber</span>
            <span className="font-display text-xl font-bold text-crust-800 tabular-nums">{formatUYU(efectivoEsperado)}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-crust-700">Fuera del cajón (QR, débito, crédito)</h3>
          <p className="mb-3 text-xs text-crust-400">
            Ya cobrado por la terminal o Mercado Pago. No se cuenta con la plata: se controla contra el
            cierre del POS y el panel de MP.
          </p>
          {resumen.noEfectivo.length === 0 ? (
            <p className="text-sm text-crust-400">Todavía no hay cobros por otros medios.</p>
          ) : (
            <>
              <ul className="space-y-1 text-sm text-crust-600">
                {resumen.noEfectivo.map((v) => (
                  <li key={v.metodo} className="flex justify-between">
                    <span>
                      {v.metodo === "SIN_MEDIO" ? "Sin medio declarado" : metodoLabel(v.metodo)}
                      <span className="ml-1 text-xs text-crust-400">({v.cantidad})</span>
                    </span>
                    <span className="tabular-nums">{formatUYU(v.monto)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-baseline justify-between border-t border-crust-100 pt-2">
                <span className="text-sm font-semibold text-crust-700">Total a conciliar</span>
                <span className="font-display text-xl font-bold text-crust-800 tabular-nums">{formatUYU(resumen.totalNoEfectivo)}</span>
              </div>
            </>
          )}
          {resumen.noEfectivo.some((v) => v.metodo === "SIN_MEDIO") && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Hay ventas sin medio de pago declarado. Revisalas antes de cerrar: no se pueden conciliar
              contra ninguna terminal.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <form onSubmit={agregar} className="space-y-3 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-crust-700">Registrar movimiento</h3>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crust-700">Concepto</span>
            <select value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value, recibido: "" })} className="w-full rounded-lg border border-crust-200 px-3 py-2">
              {TIPOS.map((t) => <option key={t} value={t}>{tipoLabel(t)}</option>)}
            </select>
            <span className="mt-1 block text-xs text-crust-400">{TIPO_HELP[mov.tipo]}</span>
          </label>

          {mov.tipo === "SALE" && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Medio de pago</span>
              <select value={mov.metodoPago} onChange={(e) => setMov({ ...mov, metodoPago: e.target.value, recibido: "" })} className="w-full rounded-lg border border-crust-200 px-3 py-2">
                {METODOS.map((m) => <option key={m} value={m}>{metodoLabel(m)}</option>)}
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crust-700">{mov.tipo === "SALE" ? "Total a cobrar" : "Monto"}</span>
            <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="Ej: 550" value={mov.monto} onChange={(e) => setMov({ ...mov, monto: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2" />
          </label>

          {/* Calculadora de vuelto: sólo para ventas en efectivo. */}
          {esVentaEfectivo && (
            <div className="rounded-lg border border-crust-100 bg-crust-50 p-3">
              <span className="mb-1 block text-sm font-medium text-crust-700">Paga con (efectivo recibido)</span>
              <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="Ej: 1000" value={mov.recibido} onChange={(e) => setMov({ ...mov, recibido: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {BILLETES.map((b) => (
                  <button key={b} type="button" onClick={() => setMov({ ...mov, recibido: String(b) })} className="rounded-md border border-crust-200 bg-white px-2 py-1 text-xs font-medium text-crust-700 hover:bg-crust-100">${b}</button>
                ))}
                <button type="button" onClick={() => setMov({ ...mov, recibido: mov.monto })} className="rounded-md border border-crust-200 bg-white px-2 py-1 text-xs font-medium text-crust-700 hover:bg-crust-100" disabled={!montoNum}>Justo</button>
              </div>
              {mov.recibido !== "" && montoNum > 0 && (
                vuelto >= 0 ? (
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-green-100 px-3 py-2 text-green-800">
                    <span className="text-sm font-medium">Vuelto a entregar</span>
                    <span className="text-lg font-bold">{formatUYU(vuelto)}</span>
                  </div>
                ) : (
                  <p className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-700">Falta {formatUYU(-vuelto)} para cubrir el total.</p>
                )
              )}
            </div>
          )}

          <input placeholder="Referencia (opcional)" value={mov.referencia} onChange={(e) => setMov({ ...mov, referencia: e.target.value })} className="w-full rounded-lg border border-crust-200 px-3 py-2" />
          {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}
          <button disabled={!montoNum || (esVentaEfectivo && mov.recibido !== "" && vuelto < 0)} className="w-full rounded-lg bg-dj-terracota py-2 font-semibold text-white hover:bg-dj-cobre disabled:cursor-not-allowed disabled:opacity-50">
            Agregar movimiento
          </button>
        </form>

        <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm lg:col-span-1">
          <h3 className="mb-1 font-semibold text-crust-700">Movimientos ({session.movimientos.length})</h3>
          <p className="mb-3 text-xs text-crust-400">Se actualiza solo: los cobros del mozo aparecen acá sin recargar.</p>
          <ul className="max-h-80 space-y-1 overflow-auto text-sm">
            {session.movimientos.map((m) => (
              <li
                key={m.id}
                className={`flex items-center justify-between gap-2 border-b border-crust-50 py-1 ${nuevos.has(m.id) ? "-mx-2 rounded-lg bg-amber-50 px-2" : ""}`}
              >
                <span className="min-w-0 text-crust-600">
                  <span className="block truncate">
                    {tipoLabel(m.tipo)}{m.metodoPago ? ` · ${metodoLabel(m.metodoPago)}` : ""}
                    {nuevos.has(m.id) && (
                      <span className="ml-1.5 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900">nuevo</span>
                    )}
                  </span>
                  <span className="block text-xs text-crust-400">
                    {new Date(m.createdAt).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}
                    {m.referencia ? ` · ${m.referencia}` : ""}
                  </span>
                </span>
                <span className={`shrink-0 tabular-nums ${m.tipo === "SALE" || m.tipo === "IN" ? "text-green-600" : "text-red-600"}`}>{formatUYU(m.monto)}</span>
              </li>
            ))}
            {session.movimientos.length === 0 && <li className="text-crust-400">Sin movimientos.</li>}
          </ul>
        </div>

        <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold text-crust-700">Cerrar caja (arqueo)</h3>

          <div className="mb-3 rounded-lg bg-crust-50 px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-crust-600">Efectivo esperado en el cajón</span>
              <span className="font-semibold text-crust-800 tabular-nums">{formatUYU(efectivoEsperado)}</span>
            </div>
            {resumen.totalNoEfectivo > 0 && (
              <div className="mt-1 flex justify-between border-t border-crust-100 pt-1 text-xs text-crust-500">
                <span>No entra al cajón (QR, débito, crédito)</span>
                <span className="tabular-nums">{formatUYU(resumen.totalNoEfectivo)}</span>
              </div>
            )}
          </div>
          <p className="mb-3 text-xs text-crust-400">
            Contá sólo los billetes y monedas. Los {formatUYU(resumen.totalNoEfectivo)} de QR, débito y
            crédito no van en este número: quedan en la conciliación del cierre.
          </p>

          <label className="mb-2 block text-sm font-medium text-crust-700">Efectivo contado</label>
          <input type="number" step="0.01" min="0" inputMode="decimal" placeholder="Contá el cajón" value={closing} onChange={(e) => setClosing(e.target.value)} className="mb-3 w-full rounded-lg border border-crust-200 px-3 py-2" />

          {/* Descuadre en vivo */}
          {closing !== "" && (
            descuadre === 0 ? (
              <p className="mb-3 rounded-lg bg-green-100 px-3 py-2 text-sm font-medium text-green-800">✓ Cuadra exacto.</p>
            ) : !fueraDeTolerancia ? (
              <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                {descuadre > 0 ? "Sobrante" : "Faltante"} de {formatUYU(Math.abs(descuadre))} · dentro de la tolerancia (±{formatUYU(tolerance)}).
              </p>
            ) : (
              <p className="mb-3 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-700">
                {descuadre > 0 ? "Sobrante" : "Faltante"} de {formatUYU(Math.abs(descuadre))} · supera la tolerancia (±{formatUYU(tolerance)}).
              </p>
            )
          )}

          {/* Justificación obligatoria fuera de tolerancia */}
          {requiereMotivo && (
            <label className="mb-3 block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Motivo del descuadre <span className="text-red-500">*</span></span>
              <textarea value={justificacion} onChange={(e) => setJustificacion(e.target.value)} rows={2} placeholder="Ej: vuelto de más en una venta, retiro no registrado…" className="w-full rounded-lg border border-crust-200 px-3 py-2 text-sm" />
            </label>
          )}

          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <button onClick={cerrar} disabled={closing === "" || (requiereMotivo && !justificacion.trim())} className="w-full rounded-lg bg-crust-800 py-2.5 font-semibold text-white hover:bg-crust-900 disabled:cursor-not-allowed disabled:opacity-50">Cerrar y arquear</button>
        </div>
      </div>
    </div>
  );
}
