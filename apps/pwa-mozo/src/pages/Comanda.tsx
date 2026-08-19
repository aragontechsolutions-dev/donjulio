import { useEffect, useMemo, useState } from "react";
import { PaymentMethod, agruparIguales, lineaConCantidad } from "@donjulio/shared";
import { api } from "../lib/api";
import { cacheGet, cacheSet, outboxAdd, uuid } from "../lib/db";
import { flushOutbox } from "../lib/sync";
import { showToast } from "../lib/toast";
import { formatUYU } from "../lib/format";
import type { MesaSel } from "../App";
import { Monograma } from "../lib/Logo";

interface Modifier { id: string; nombre: string; priceDelta: string }
interface Grupo { group: { id: string; nombre: string; minSelect: number; maxSelect: number; modifiers: Modifier[] } }
interface Prod { id: string; nombre: string; precio: string; descripcion: string | null; imagenUrl: string | null; destacado: boolean; modifierGroups: Grupo[] }
interface Cat { id: string; nombre: string; productos: Prod[] }
interface Silla { id: string; numero: number; nombre: string | null }
interface CuentaItem {
  id: string;
  cantidad: number;
  subtotal: string;
  sillaId: string | null;
  pagado: boolean;
  status: string;
  producto: { nombre: string };
  modificadores: { nombre: string }[];
}
interface Cuenta {
  id: string;
  numero: number;
  total: string;
  items: CuentaItem[];
  mesa: { id: string; sillas: Silla[] } | null;
}
interface MesaFull { id: string; sillas: Silla[] }

interface CartLine {
  key: string;
  producto: Prod;
  modificadorIds: string[];
  modLabels: string[];
  precio: number;
  sillaId: string | null;
}

const ITEM_ESTADO: Record<string, { label: string; cls: string }> = {
  PENDIENTE: { label: "En espera", cls: "bg-crust-100 text-crust-600" },
  EN_PREPARACION: { label: "En cocina", cls: "bg-amber-100 text-amber-700" },
  LISTO: { label: "Listo", cls: "bg-green-100 text-green-700" },
  ENTREGADO: { label: "Entregado", cls: "bg-crust-100 text-crust-400" },
  CANCELADO: { label: "Cancelado", cls: "bg-red-100 text-red-600" },
};

export default function Comanda({
  mesa,
  onBack,
  onQueued,
  online,
  cajaAbierta,
}: {
  mesa: MesaSel;
  onBack: () => void;
  onQueued: () => void;
  online: boolean;
  cajaAbierta: boolean;
}) {
  const [menu, setMenu] = useState<Cat[]>([]);
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [sillasMesa, setSillasMesa] = useState<Silla[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [prodSel, setProdSel] = useState<Prod | null>(null);
  const [mods, setMods] = useState<Record<string, string[]>>({});
  const [comensalSel, setComensalSel] = useState<string>(""); // sillaId o "" = mesa
  const [split, setSplit] = useState<"todo" | "comensal" | "iguales">("todo");
  const [sillasCobro, setSillasCobro] = useState<string[]>([]);
  const [cashModal, setCashModal] = useState(false); // paso de vuelto (efectivo)
  const [recibido, setRecibido] = useState("");
  const [confirmando, setConfirmando] = useState(false); // repaso antes de cocina

  const loadCuenta = () =>
    api
      .get<Cuenta>(`/admin/salon/mesas/${mesa.id}/cuenta`)
      .then((c) => { setCuenta(c); if (c.mesa?.sillas?.length) setSillasMesa(c.mesa.sillas); })
      .catch(() => setCuenta(null));

  useEffect(() => {
    api
      .get<Cat[]>("/admin/salon/menu")
      .then((m) => { setMenu(m); cacheSet("menu", m); })
      .catch(async () => { const c = await cacheGet<Cat[]>("menu"); if (c) setMenu(c); });
    // Sillas de la mesa (para asignar comensal aun sin cuenta abierta).
    api
      .get<MesaFull[]>("/admin/salon/mesas")
      .then((ms) => {
        const found = ms.find((x) => x.id === mesa.id);
        if (found?.sillas) { setSillasMesa(found.sillas); cacheSet(`sillas-${mesa.id}`, found.sillas); }
      })
      .catch(async () => { const c = await cacheGet<Silla[]>(`sillas-${mesa.id}`); if (c) setSillasMesa(c); });
    loadCuenta();
    // Tiempo real: refresca la cuenta/estados cada 5s mientras se ve la mesa.
    const t = setInterval(() => { if (navigator.onLine) loadCuenta(); }, 5000);
    return () => clearInterval(t);
  }, [mesa.id]);

  // Si se vacía el carrito, el repaso ya no tiene qué mostrar.
  useEffect(() => {
    if (cart.length === 0) setConfirmando(false);
  }, [cart.length]);

  const cartTotal = useMemo(() => cart.reduce((a, l) => a + l.precio, 0), [cart]);
  // Lo mismo pedido dos veces por el mismo comensal es una línea con cantidad.
  const lineasCarrito = useMemo(
    () =>
      agruparIguales(
        cart,
        (l) => `${l.producto.id}|${[...l.modificadorIds].sort().join(",")}|${l.sillaId ?? ""}`,
      ),
    [cart],
  );
  const sumarUno = (l: CartLine) => setCart((c) => [...c, { ...l, key: uuid() }]);
  const quitarUno = (keys: string[]) => {
    const ultima = keys[keys.length - 1];
    setCart((c) => c.filter((x) => x.key !== ultima));
  };
  const sillaLabel = (s: Silla) => (s.nombre?.trim() ? `${s.nombre} (silla ${s.numero})` : `Silla ${s.numero}`);
  const sillaLabelById = (id: string | null) => {
    if (!id) return "Mesa";
    const s = sillasMesa.find((x) => x.id === id);
    return s ? sillaLabel(s) : "Mesa";
  };

  const elegir = (p: Prod) => {
    if (p.modifierGroups.length === 0) addToCart(p, [], []);
    else { setProdSel(p); setMods({}); }
  };

  const toggleMod = (groupId: string, modId: string, single: boolean) =>
    setMods((prev) => {
      const cur = prev[groupId] ?? [];
      if (single) return { ...prev, [groupId]: [modId] };
      return { ...prev, [groupId]: cur.includes(modId) ? cur.filter((x) => x !== modId) : [...cur, modId] };
    });

  const confirmarMods = () => {
    if (!prodSel) return;
    const ids = Object.values(mods).flat();
    const labels: string[] = [];
    let extra = 0;
    for (const { group } of prodSel.modifierGroups) {
      for (const m of group.modifiers) {
        if (ids.includes(m.id)) { labels.push(m.nombre); extra += Number(m.priceDelta); }
      }
    }
    addToCart(prodSel, ids, labels, extra);
    setProdSel(null);
    setMods({});
  };

  const addToCart = (p: Prod, ids: string[], labels: string[], extra = 0) => {
    setCart((c) => [
      ...c,
      { key: uuid(), producto: p, modificadorIds: ids, modLabels: labels, precio: Number(p.precio) + extra, sillaId: comensalSel || null },
    ]);
  };

  const enviar = async () => {
    if (cart.length === 0) return;
    setConfirmando(false);
    const clientTxnId = uuid();
    // Lo repetido viaja junto: la cocina lee "2 × Medialunas de manteca".
    const items = lineasCarrito.map((g) => ({
      productoId: g.primera.producto.id,
      cantidad: g.cantidad,
      modificadorIds: g.primera.modificadorIds,
      ...(g.primera.sillaId ? { sillaId: g.primera.sillaId } : {}),
    }));
    await outboxAdd({ id: clientTxnId, mesaId: mesa.id, mesaNumero: mesa.numero, items, createdAt: Date.now() });
    setCart([]);
    onQueued();
    if (navigator.onLine) {
      const n = await flushOutbox();
      showToast(n > 0 ? "success" : "info", n > 0 ? "Comanda enviada a cocina ✓" : "Comanda encolada, se enviará al reconectar");
      onQueued();
      loadCuenta();
    } else {
      showToast("info", "Sin conexión: comanda guardada, se enviará al reconectar");
    }
  };

  /** Entrega la línea entera: si son 2 medialunas, van las 2. */
  const entregar = async (itemIds: string[]) => {
    try {
      await Promise.all(
        itemIds.map((id) => api.patch(`/admin/kds/items/${id}`, { status: "ENTREGADO" })),
      );
      loadCuenta();
    } catch {
      /* toast del api */
    }
  };

  const cobrarTodo = async (metodoPago: PaymentMethod) => {
    if (!cuenta) return;
    try {
      await api.post(`/admin/salon/pedidos/${cuenta.id}/cobrar`, { metodoPago });
      onBack();
    } catch { /* toast */ }
  };
  const cobrarComensales = async (metodoPago: PaymentMethod) => {
    if (!cuenta || sillasCobro.length === 0) return;
    try {
      const res = await api.post<{ cerrado?: boolean }>(`/admin/salon/pedidos/${cuenta.id}/cobrar-parcial`, { metodoPago, sillaIds: sillasCobro });
      if (res.cerrado) onBack();
      else { setSillasCobro([]); loadCuenta(); }
    } catch { /* toast */ }
  };
  const doCobrar = (m: PaymentMethod) => (split === "comensal" ? cobrarComensales(m) : cobrarTodo(m));
  // Efectivo: primero el paso de vuelto; otros medios cobran directo.
  const iniciarCobro = (m: PaymentMethod) => {
    if (!cajaAbierta) { showToast("error", "La caja no está abierta. Pedile al responsable que la abra."); return; }
    if (split === "comensal" && sillasCobro.length === 0) return;
    if (m === PaymentMethod.EFECTIVO) { setRecibido(""); setCashModal(true); }
    else doCobrar(m);
  };
  const confirmarEfectivo = async () => {
    setCashModal(false);
    await doCobrar(PaymentMethod.EFECTIVO);
  };

  // Junta los ítems iguales de un comensal en una línea con cantidad. No se
  // juntan si están en estados distintos: uno puede estar listo y el otro no.
  const juntarItems = (items: CuentaItem[]) =>
    agruparIguales(
      items,
      (it) =>
        `${it.producto.nombre}|${it.modificadores.map((m) => m.nombre).sort().join(",")}|${it.status}|${it.pagado}`,
      (it) => it.cantidad,
    ).map((g) => ({
      id: g.primera.id,
      // Entregar afecta a todos los ítems de la línea, no sólo al primero.
      ids: g.lineas.map((it) => it.id),
      cantidad: g.cantidad,
      subtotal: g.lineas.reduce((a, it) => a + Number(it.subtotal), 0),
      status: g.primera.status,
      pagado: g.primera.pagado,
      nombre: g.primera.producto.nombre,
      modificadores: g.primera.modificadores.map((m) => m.nombre),
    }));

  // Agrupa la cuenta por comensal.
  const grupos = useMemo(() => {
    if (!cuenta) return [];
    const gs = sillasMesa.map((s) => ({
      sillaId: s.id as string | null,
      titulo: sillaLabel(s),
      items: cuenta.items.filter((it) => it.sillaId === s.id),
    }));
    const sin = cuenta.items.filter((it) => !it.sillaId);
    if (sin.length) gs.push({ sillaId: null, titulo: "Sin asignar", items: sin });
    return gs.filter((g) => g.items.length > 0);
  }, [cuenta, sillasMesa]);

  const pendienteDe = (items: CuentaItem[]) => items.filter((it) => !it.pagado).reduce((a, it) => a + Number(it.subtotal), 0);
  const totalPendiente = cuenta ? pendienteDe(cuenta.items) : 0;
  const gruposCobrables = grupos.filter((g) => g.sillaId && pendienteDe(g.items) > 0);
  const nComensales = gruposCobrables.length || 1;
  const hayCuenta = !!cuenta && cuenta.items.length > 0;
  const BILLETES = [200, 500, 1000, 2000];
  const montoACobrar =
    split === "comensal"
      ? gruposCobrables.filter((g) => sillasCobro.includes(g.sillaId!)).reduce((a, g) => a + pendienteDe(g.items), 0)
      : totalPendiente;
  const vuelto = (Number(recibido) || 0) - montoACobrar;

  return (
    <div className="p-4 pb-44">
      <div className="mb-3 flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg border border-crust-200 px-3 py-2 text-crust-700">← Mesas</button>
        <h1 className="font-display text-xl font-bold text-crust-800">Mesa {mesa.numero}</h1>
      </div>

      {/* Selector de comensal (se aplica a lo que agregues) */}
      {sillasMesa.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-crust-400">Cargar a</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setComensalSel("")}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${comensalSel === "" ? "border-dj-terracota bg-dj-terracota text-white" : "border-crust-200 text-crust-700"}`}
            >
              Mesa
            </button>
            {sillasMesa.map((s) => (
              <button
                key={s.id}
                onClick={() => setComensalSel(s.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${comensalSel === s.id ? "border-dj-terracota bg-dj-terracota text-white" : "border-crust-200 text-crust-700"}`}
              >
                {s.nombre?.trim() || `Silla ${s.numero}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cuenta actual agrupada por comensal */}
      {hayCuenta && (
        <div className="mb-4 rounded-2xl border border-crust-100 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-crust-700">En la cuenta (#{cuenta!.numero})</p>
          <div className="space-y-3">
            {grupos.map((g) => (
              <div key={g.sillaId ?? "sin"}>
                <div className="flex items-center justify-between text-xs font-semibold uppercase text-crust-400">
                  <span>{g.titulo}</span><span>{formatUYU(pendienteDe(g.items))}</span>
                </div>
                <ul className="mt-1 space-y-1 text-sm">
                  {juntarItems(g.items).map((it) => {
                    const est = ITEM_ESTADO[it.status] ?? ITEM_ESTADO.PENDIENTE;
                    return (
                      <li key={it.id} className={`flex items-center justify-between gap-2 ${it.pagado ? "text-crust-300 line-through" : "text-crust-700"}`}>
                        <span className="flex-1">{lineaConCantidad(it.cantidad, it.nombre)}{it.modificadores.length ? ` (${it.modificadores.join(", ")})` : ""}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${est.cls}`}>{est.label}</span>
                        {!it.pagado && it.status === "LISTO" && online && (
                          <button onClick={() => entregar(it.ids)} className="rounded-md bg-green-600 px-2 py-0.5 text-[10px] font-semibold text-white active:bg-green-700">Entregar</button>
                        )}
                        <span className="w-16 text-right">{formatUYU(it.subtotal)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-2 flex justify-between border-t border-crust-100 pt-2 font-bold">
            <span>Total pendiente</span><span>{formatUYU(totalPendiente)}</span>
          </p>
        </div>
      )}

      {/* Menú */}
      <div className="space-y-4">
        {menu.map((cat) => (
          <div key={cat.id}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-crust-400">{cat.nombre}</p>
            <div className="grid grid-cols-2 gap-3">
              {cat.productos.map((p) => (
                <button key={p.id} onClick={() => elegir(p)} className="group flex flex-col overflow-hidden rounded-2xl border border-crust-100 bg-white text-left shadow-sm transition-all active:scale-[.98]">
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-crust-100">
                    {p.imagenUrl ? (
                      <img src={p.imagenUrl} alt={p.nombre} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center">
                        <Monograma tinta="#E3D5B8" acento="#D8C7A4" className="h-12 w-12" />
                      </div>
                    )}
                    {p.destacado && <span className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-crust-700 shadow-sm">★</span>}
                  </div>
                  <div className="flex flex-1 flex-col p-2.5">
                    <span className="text-sm font-semibold leading-tight text-crust-800">{p.nombre}</span>
                    {p.descripcion && <p className="mt-0.5 line-clamp-2 text-xs text-crust-500">{p.descripcion}</p>}
                    <span className="mt-auto pt-1.5 text-sm font-bold text-crust-700">{formatUYU(p.precio)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Selección de modificadores */}
      {prodSel && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setProdSel(null)}>
          <div className="w-full rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 font-display text-lg font-bold text-crust-800">{prodSel.nombre}</h3>
            <p className="mb-3 text-xs text-crust-500">Para: <b>{sillaLabelById(comensalSel || null)}</b></p>
            {prodSel.modifierGroups.map(({ group }) => (
              <div key={group.id} className="mb-3">
                <p className="mb-1 text-sm font-medium text-crust-600">{group.nombre}</p>
                <div className="flex flex-wrap gap-2">
                  {group.modifiers.map((m) => {
                    const single = group.maxSelect <= 1;
                    const on = (mods[group.id] ?? []).includes(m.id);
                    return (
                      <button key={m.id} onClick={() => toggleMod(group.id, m.id, single)} className={`rounded-full border px-4 py-2 text-sm ${on ? "border-dj-terracota bg-dj-terracota text-white" : "border-crust-200 text-crust-700"}`}>
                        {m.nombre}{Number(m.priceDelta) > 0 ? ` +${formatUYU(m.priceDelta)}` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button onClick={confirmarMods} className="mt-2 w-full rounded-xl bg-dj-terracota py-3 font-semibold text-white active:bg-dj-cobre">Agregar</button>
          </div>
        </div>
      )}

      {/* Paso de vuelto (pago en efectivo) */}
      {cashModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setCashModal(false)}>
          <div className="w-full rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-display text-lg font-bold text-crust-800">Pago en efectivo</h3>
            <div className="mb-3 flex justify-between rounded-lg bg-crust-50 px-3 py-2 text-sm">
              <span className="text-crust-600">A cobrar</span>
              <span className="font-bold text-crust-900">{formatUYU(montoACobrar)}</span>
            </div>
            <label className="mb-2 block text-sm font-medium text-crust-700">Paga con</label>
            <input
              type="number" inputMode="decimal" autoFocus placeholder="Ej: 1000"
              value={recibido} onChange={(e) => setRecibido(e.target.value)}
              className="mb-2 w-full rounded-xl border border-crust-200 px-3 py-3 text-lg"
            />
            <div className="mb-3 flex flex-wrap gap-2">
              {BILLETES.map((b) => (
                <button key={b} onClick={() => setRecibido(String(b))} className="rounded-full border border-crust-200 px-3 py-1.5 text-sm text-crust-700 active:bg-crust-100">${b}</button>
              ))}
              <button onClick={() => setRecibido(String(montoACobrar))} className="rounded-full border border-crust-200 px-3 py-1.5 text-sm text-crust-700 active:bg-crust-100">Justo</button>
            </div>
            {recibido !== "" && (
              vuelto >= 0 ? (
                <div className="mb-3 flex items-center justify-between rounded-xl bg-green-100 px-3 py-2 text-green-800">
                  <span className="text-sm font-medium">Vuelto a entregar</span>
                  <span className="text-xl font-bold">{formatUYU(vuelto)}</span>
                </div>
              ) : (
                <p className="mb-3 rounded-xl bg-red-100 px-3 py-2 text-sm font-medium text-red-700">Falta {formatUYU(-vuelto)} para cubrir el total.</p>
              )
            )}
            <div className="flex gap-2">
              <button
                onClick={confirmarEfectivo}
                disabled={recibido !== "" && vuelto < 0}
                className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white active:bg-green-700 disabled:opacity-40"
              >
                Confirmar cobro
              </button>
              <button onClick={() => setCashModal(false)} className="rounded-xl border border-crust-200 px-4 py-3 text-crust-700">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Repaso antes de mandar a cocina */}
      {confirmando && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-crust-900/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-enviar"
          onClick={() => setConfirmando(false)}
        >
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-7" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <Monograma tinta="#B5563C" acento="#C9A56B" className="h-10 w-10 shrink-0" />
              <div>
                <h3 id="titulo-enviar" className="font-display text-xl font-bold text-crust-800">¿Enviar a cocina?</h3>
                <p className="text-xs text-crust-500">Mesa {mesa.numero} · repasá antes de mandar</p>
              </div>
            </div>

            <div className="space-y-3 border-y border-crust-100 py-3">
              {[...new Set(lineasCarrito.map((g) => g.primera.sillaId))].map((sillaId) => (
                <div key={sillaId ?? "mesa"}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-crust-400">{sillaLabelById(sillaId)}</p>
                  <ul className="mt-1 space-y-1.5">
                    {lineasCarrito
                      .filter((g) => g.primera.sillaId === sillaId)
                      .map((g) => (
                        <li key={g.clave} className="flex items-baseline justify-between gap-3">
                          <span className="text-crust-800">
                            <span className="font-medium">{lineaConCantidad(g.cantidad, g.primera.producto.nombre)}</span>
                            {g.primera.modLabels.length > 0 && (
                              <span className="block text-xs text-crust-500">{g.primera.modLabels.join(", ")}</span>
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums text-crust-700">{formatUYU(g.primera.precio * g.cantidad)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>

            <p className="mt-3 flex items-baseline justify-between font-display text-lg font-bold text-crust-900">
              <span>Total</span>
              <span className="tabular-nums">{formatUYU(cartTotal)}</span>
            </p>
            {!online && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Sin conexión: queda guardada y se manda sola al reconectar.
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button onClick={() => setConfirmando(false)} className="rounded-xl border border-crust-200 px-5 py-3.5 font-semibold text-crust-700 active:bg-crust-100">
                Revisar
              </button>
              <button onClick={enviar} className="flex-1 rounded-xl bg-dj-terracota py-3.5 font-semibold text-white active:bg-dj-cobre">
                Sí, enviar a cocina
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra inferior: carrito + cobro */}
      <div className="fixed inset-x-0 bottom-0 border-t border-crust-100 bg-white p-3 shadow-lg">
        {cart.length > 0 ? (
          <div>
            <div className="mb-2 max-h-28 overflow-auto text-sm">
              {lineasCarrito.map((g) => (
                <div key={g.clave} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="min-w-0 flex-1 truncate text-crust-700">
                    {lineaConCantidad(g.cantidad, g.primera.producto.nombre)}
                    {g.primera.modLabels.length ? ` (${g.primera.modLabels.join(", ")})` : ""}
                    <span className="ml-1 text-xs text-crust-400">· {sillaLabelById(g.primera.sillaId)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {formatUYU(g.primera.precio * g.cantidad)}
                    <button
                      onClick={() => quitarUno(g.lineas.map((l) => l.key))}
                      aria-label={`Quitar uno de ${g.primera.producto.nombre}`}
                      className="h-7 w-7 rounded-full border border-crust-200 text-crust-600 active:bg-crust-100"
                    >
                      −
                    </button>
                    <button
                      onClick={() => sumarUno(g.primera)}
                      aria-label={`Agregar otro ${g.primera.producto.nombre}`}
                      className="h-7 w-7 rounded-full border border-crust-200 text-crust-600 active:bg-crust-100"
                    >
                      +
                    </button>
                  </span>
                </div>
              ))}
            </div>
            <button onClick={() => setConfirmando(true)} className="w-full rounded-xl bg-dj-terracota py-3.5 text-lg font-semibold text-white active:bg-dj-cobre">
              Enviar a cocina · {formatUYU(cartTotal)}
            </button>
          </div>
        ) : (
          hayCuenta && totalPendiente > 0 && (
            <div>
              {!cajaAbierta ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-700">
                  La caja no está abierta. Pedile al responsable que la abra para cobrar.
                </p>
              ) : !online ? (
                <p className="mb-1 text-center text-sm text-crust-500">Cobro disponible sólo con conexión</p>
              ) : (
                <div className="mb-2 flex rounded-full bg-crust-100 p-1 text-xs font-semibold">
                  {([["todo", "Todo"], ["comensal", "Por comensal"], ["iguales", "Iguales"]] as const).map(([k, label]) => (
                    <button key={k} onClick={() => { setSplit(k); setSillasCobro([]); }} className={`flex-1 rounded-full px-2 py-1 ${split === k ? "bg-dj-terracota text-white" : "text-crust-700"}`}>{label}</button>
                  ))}
                </div>
              )}

              {online && split === "iguales" && (
                <p className="mb-2 text-center text-sm text-crust-700">{nComensales} comensales · <b>{formatUYU(totalPendiente / nComensales)}</b> c/u</p>
              )}

              {online && split === "comensal" && (
                <div className="mb-2 max-h-28 space-y-1 overflow-auto">
                  {gruposCobrables.map((g) => (
                    <label key={g.sillaId} className="flex items-center justify-between rounded-lg border border-crust-100 px-2 py-1 text-sm">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={sillasCobro.includes(g.sillaId!)} onChange={(e) => setSillasCobro((prev) => e.target.checked ? [...prev, g.sillaId!] : prev.filter((x) => x !== g.sillaId))} />
                        {g.titulo}
                      </span>
                      <span className="font-medium text-crust-700">{formatUYU(pendienteDe(g.items))}</span>
                    </label>
                  ))}
                  {gruposCobrables.length === 0 && <p className="text-xs text-crust-400">No hay consumos asignados a comensales.</p>}
                </div>
              )}

              {cajaAbierta && (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    [PaymentMethod.EFECTIVO, "Efectivo"],
                    [PaymentMethod.MERCADO_PAGO_QR, "QR"],
                    [PaymentMethod.DEBITO, "Débito"],
                    [PaymentMethod.CREDITO, "Crédito"],
                  ].map(([m, label]) => (
                    <button
                      key={m}
                      disabled={!online || (split === "comensal" && sillasCobro.length === 0)}
                      onClick={() => iniciarCobro(m as PaymentMethod)}
                      className="rounded-xl bg-dj-terracota py-3 text-sm font-semibold text-white active:bg-crust-800 disabled:opacity-40"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
