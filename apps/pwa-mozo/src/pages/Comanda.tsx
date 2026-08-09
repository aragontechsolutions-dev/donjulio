import { useEffect, useMemo, useState } from "react";
import { PaymentMethod } from "@donjulio/shared";
import { api } from "../lib/api";
import { cacheGet, cacheSet, outboxAdd, uuid } from "../lib/db";
import { flushOutbox } from "../lib/sync";
import { formatUYU } from "../lib/format";
import type { MesaSel } from "../App";

interface Modifier { id: string; nombre: string; priceDelta: string }
interface Grupo { group: { id: string; nombre: string; minSelect: number; maxSelect: number; modifiers: Modifier[] } }
interface Prod { id: string; nombre: string; precio: string; modifierGroups: Grupo[] }
interface Cat { id: string; nombre: string; productos: Prod[] }
interface CuentaItem { id: string; cantidad: number; subtotal: string; producto: { nombre: string }; modificadores: { nombre: string }[] }
interface Cuenta { id: string; numero: number; total: string; items: CuentaItem[] }

interface CartLine {
  key: string;
  producto: Prod;
  modificadorIds: string[];
  modLabels: string[];
  precio: number;
}

export default function Comanda({
  mesa,
  onBack,
  onQueued,
  online,
}: {
  mesa: MesaSel;
  onBack: () => void;
  onQueued: () => void;
  online: boolean;
}) {
  const [menu, setMenu] = useState<Cat[]>([]);
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [prodSel, setProdSel] = useState<Prod | null>(null);
  const [mods, setMods] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const loadCuenta = () =>
    api
      .get<Cuenta>(`/admin/salon/mesas/${mesa.id}/cuenta`)
      .then(setCuenta)
      .catch(() => setCuenta(null));

  useEffect(() => {
    api
      .get<Cat[]>("/admin/salon/menu")
      .then((m) => { setMenu(m); cacheSet("menu", m); })
      .catch(async () => { const c = await cacheGet<Cat[]>("menu"); if (c) setMenu(c); });
    loadCuenta();
  }, [mesa.id]);

  const cartTotal = useMemo(() => cart.reduce((a, l) => a + l.precio, 0), [cart]);

  const elegir = (p: Prod) => {
    if (p.modifierGroups.length === 0) {
      addToCart(p, [], []);
    } else {
      setProdSel(p);
      setMods({});
    }
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
      { key: uuid(), producto: p, modificadorIds: ids, modLabels: labels, precio: Number(p.precio) + extra },
    ]);
  };

  const enviar = async () => {
    if (cart.length === 0) return;
    const clientTxnId = uuid();
    const items = cart.map((l) => ({
      productoId: l.producto.id,
      cantidad: 1,
      modificadorIds: l.modificadorIds,
    }));
    // Siempre se encola (outbox) y luego se intenta sincronizar: resiliente a cortes.
    await outboxAdd({ id: clientTxnId, mesaId: mesa.id, mesaNumero: mesa.numero, items, createdAt: Date.now() });
    setCart([]);
    onQueued();
    if (navigator.onLine) {
      const n = await flushOutbox();
      setMsg(n > 0 ? "Comanda enviada a cocina ✓" : "Comanda encolada, se enviará al reconectar");
      onQueued();
      loadCuenta();
    } else {
      setMsg("Sin conexión: comanda guardada, se enviará al reconectar");
    }
    setTimeout(() => setMsg(null), 3000);
  };

  const cobrar = async (metodoPago: PaymentMethod) => {
    if (!cuenta) return;
    await api.post(`/admin/salon/pedidos/${cuenta.id}/cobrar`, { metodoPago });
    onBack();
  };

  return (
    <div className="p-4 pb-40">
      <div className="mb-3 flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg border border-crust-200 px-3 py-2 text-crust-700">← Mesas</button>
        <h1 className="font-display text-xl font-bold text-crust-800">Mesa {mesa.numero}</h1>
      </div>

      {msg && <div className="mb-3 rounded-lg bg-green-100 px-3 py-2 text-sm text-green-800">{msg}</div>}

      {/* Cuenta actual */}
      {cuenta && cuenta.items.length > 0 && (
        <div className="mb-4 rounded-2xl border border-crust-100 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-crust-700">En la cuenta (#{cuenta.numero})</p>
          <ul className="space-y-1 text-sm">
            {cuenta.items.map((it) => (
              <li key={it.id} className="flex justify-between">
                <span className="text-crust-600">{it.cantidad}× {it.producto.nombre}{it.modificadores.length ? ` (${it.modificadores.map((m) => m.nombre).join(", ")})` : ""}</span>
                <span>{formatUYU(it.subtotal)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between border-t border-crust-100 pt-2 font-bold">
            <span>Total</span><span>{formatUYU(cuenta.total)}</span>
          </p>
        </div>
      )}

      {/* Menú */}
      <div className="space-y-4">
        {menu.map((cat) => (
          <div key={cat.id}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-crust-400">{cat.nombre}</p>
            <div className="grid grid-cols-2 gap-2">
              {cat.productos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => elegir(p)}
                  className="rounded-xl border border-crust-200 bg-white p-3 text-left active:bg-crust-50"
                >
                  <span className="block font-medium text-crust-800">{p.nombre}</span>
                  <span className="text-sm text-crust-500">{formatUYU(p.precio)}</span>
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
            <h3 className="mb-3 font-display text-lg font-bold text-crust-800">{prodSel.nombre}</h3>
            {prodSel.modifierGroups.map(({ group }) => (
              <div key={group.id} className="mb-3">
                <p className="mb-1 text-sm font-medium text-crust-600">{group.nombre}</p>
                <div className="flex flex-wrap gap-2">
                  {group.modifiers.map((m) => {
                    const single = group.maxSelect <= 1;
                    const on = (mods[group.id] ?? []).includes(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => toggleMod(group.id, m.id, single)}
                        className={`rounded-full border px-4 py-2 text-sm ${on ? "border-crust-600 bg-crust-600 text-white" : "border-crust-200 text-crust-700"}`}
                      >
                        {m.nombre}{Number(m.priceDelta) > 0 ? ` +${formatUYU(m.priceDelta)}` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button onClick={confirmarMods} className="mt-2 w-full rounded-xl bg-crust-600 py-3 font-semibold text-white active:bg-crust-700">
              Agregar
            </button>
          </div>
        </div>
      )}

      {/* Barra inferior: carrito + cobro */}
      <div className="fixed inset-x-0 bottom-0 border-t border-crust-100 bg-white p-3 shadow-lg">
        {cart.length > 0 ? (
          <div>
            <div className="mb-2 max-h-28 overflow-auto text-sm">
              {cart.map((l) => (
                <div key={l.key} className="flex items-center justify-between py-0.5">
                  <span className="text-crust-700">{l.producto.nombre}{l.modLabels.length ? ` (${l.modLabels.join(", ")})` : ""}</span>
                  <span className="flex items-center gap-2">
                    {formatUYU(l.precio)}
                    <button onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))} className="text-red-500">✕</button>
                  </span>
                </div>
              ))}
            </div>
            <button onClick={enviar} className="w-full rounded-xl bg-crust-600 py-3.5 text-lg font-semibold text-white active:bg-crust-700">
              Enviar a cocina · {formatUYU(cartTotal)}
            </button>
          </div>
        ) : (
          cuenta && cuenta.items.length > 0 && (
            <div>
              <p className="mb-2 text-center text-sm text-crust-500">
                {online ? "Cobrar la mesa:" : "Cobro disponible sólo con conexión"}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  [PaymentMethod.EFECTIVO, "Efectivo"],
                  [PaymentMethod.MERCADO_PAGO_QR, "QR"],
                  [PaymentMethod.DEBITO, "Débito"],
                  [PaymentMethod.CREDITO, "Crédito"],
                ].map(([m, label]) => (
                  <button
                    key={m}
                    disabled={!online}
                    onClick={() => cobrar(m as PaymentMethod)}
                    className="rounded-xl bg-crust-700 py-3 text-sm font-semibold text-white active:bg-crust-800 disabled:opacity-40"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
