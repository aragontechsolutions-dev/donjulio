import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { showToast } from "../lib/toast";
import { formatUYU } from "../lib/format";

const BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "http://localhost:3000/api";

interface Modifier { id: string; nombre: string; priceDelta: string }
interface Grupo { group: { id: string; nombre: string; minSelect: number; maxSelect: number; modifiers: Modifier[] } }
interface Prod { id: string; nombre: string; precio: string; modifierGroups: Grupo[] }
interface Cat { id: string; nombre: string; productos: Prod[] }
interface Silla { id: string; numero: number; nombre: string | null }
interface CuentaItem {
  id: string; cantidad: number; subtotal: string; sillaId: string | null; pagado: boolean; status: string;
  producto: { nombre: string }; modificadores: { nombre: string }[];
}
interface Estado {
  mesa: { id: string; numero: number; sillas: Silla[] };
  cuenta: { id: string; numero: number; total: string; items: CuentaItem[] } | null;
}
interface CartLine { key: string; producto: Prod; modificadorIds: string[]; modLabels: string[]; precio: number; sillaId: string | null }

const ESTADO: Record<string, { label: string; cls: string }> = {
  PENDIENTE: { label: "En espera", cls: "bg-crust-100 text-crust-600" },
  EN_PREPARACION: { label: "En cocina", cls: "bg-amber-100 text-amber-700" },
  LISTO: { label: "Listo", cls: "bg-green-100 text-green-700" },
  ENTREGADO: { label: "Entregado", cls: "bg-crust-100 text-crust-400" },
  CANCELADO: { label: "Cancelado", cls: "bg-red-100 text-red-600" },
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as Promise<T>;
}

export default function Autoservicio() {
  const { token = "" } = useParams();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [menu, setMenu] = useState<Cat[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [prodSel, setProdSel] = useState<Prod | null>(null);
  const [mods, setMods] = useState<Record<string, string[]>>({});
  const [comensal, setComensal] = useState<string>("");
  const [enviando, setEnviando] = useState(false);

  const loadEstado = () => apiGet<Estado>(`/autoservicio/${token}`).then(setEstado).catch(() => setNotFound(true));

  useEffect(() => {
    loadEstado();
    apiGet<Cat[]>(`/autoservicio/${token}/menu`).then(setMenu).catch(() => setNotFound(true));
    const t = setInterval(loadEstado, 8000);
    return () => clearInterval(t);
  }, [token]);

  const sillas = estado?.mesa.sillas ?? [];
  const cartTotal = useMemo(() => cart.reduce((a, l) => a + l.precio, 0), [cart]);
  const sillaLabel = (s: Silla) => (s.nombre?.trim() ? `${s.nombre} (silla ${s.numero})` : `Silla ${s.numero}`);
  const labelById = (id: string | null) => {
    if (!id) return "Mesa";
    const s = sillas.find((x) => x.id === id);
    return s ? sillaLabel(s) : "Mesa";
  };

  const elegir = (p: Prod) => {
    if (p.modifierGroups.length === 0) addToCart(p, [], []);
    else { setProdSel(p); setMods({}); }
  };
  const toggleMod = (gid: string, mid: string, single: boolean) =>
    setMods((prev) => {
      const cur = prev[gid] ?? [];
      if (single) return { ...prev, [gid]: [mid] };
      return { ...prev, [gid]: cur.includes(mid) ? cur.filter((x) => x !== mid) : [...cur, mid] };
    });
  const confirmarMods = () => {
    if (!prodSel) return;
    const ids = Object.values(mods).flat();
    const labels: string[] = [];
    let extra = 0;
    for (const { group } of prodSel.modifierGroups)
      for (const m of group.modifiers)
        if (ids.includes(m.id)) { labels.push(m.nombre); extra += Number(m.priceDelta); }
    addToCart(prodSel, ids, labels, extra);
    setProdSel(null);
    setMods({});
  };
  const addToCart = (p: Prod, ids: string[], labels: string[], extra = 0) =>
    setCart((c) => [...c, { key: uid(), producto: p, modificadorIds: ids, modLabels: labels, precio: Number(p.precio) + extra, sillaId: comensal || null }]);

  const enviar = async () => {
    if (cart.length === 0) return;
    setEnviando(true);
    try {
      const items = cart.map((l) => ({ productoId: l.producto.id, cantidad: 1, modificadorIds: l.modificadorIds, ...(l.sillaId ? { sillaId: l.sillaId } : {}) }));
      const r = await fetch(`${BASE}/autoservicio/${token}/comanda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, clientTxnId: uid() }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setCart([]);
      showToast("success", "¡Pedido enviado a cocina! 🧑‍🍳");
      loadEstado();
    } catch {
      showToast("error", "No se pudo enviar el pedido. Reintentá o avisá al mozo.");
    } finally {
      setEnviando(false);
    }
  };

  const grupos = useMemo(() => {
    if (!estado?.cuenta) return [];
    const gs = sillas.map((s) => ({ titulo: sillaLabel(s), items: estado.cuenta!.items.filter((it) => it.sillaId === s.id) }));
    const sin = estado.cuenta.items.filter((it) => !it.sillaId);
    if (sin.length) gs.push({ titulo: "Sin asignar", items: sin });
    return gs.filter((g) => g.items.length > 0);
  }, [estado, sillas]);

  if (notFound) {
    return (
      <div className="grid min-h-screen place-items-center bg-crust-50 p-6 text-center">
        <div>
          <p className="text-5xl">🔍</p>
          <h1 className="mt-3 font-display text-xl font-bold text-crust-800">Mesa no encontrada</h1>
          <p className="mt-1 text-crust-500">El código QR no es válido o expiró. Pedí uno nuevo al personal.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-crust-50 pb-40">
      <header className="sticky top-0 z-20 border-b border-crust-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🥖</span>
          <div>
            <h1 className="font-display text-lg font-bold text-crust-800">Don Julio</h1>
            <p className="text-xs text-crust-500">Autoservicio · Mesa {estado?.mesa.numero ?? "…"}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl p-4">
        {/* Comensal */}
        {sillas.length > 0 && (
          <div className="mb-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-crust-400">¿Para quién es?</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button onClick={() => setComensal("")} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${comensal === "" ? "border-crust-600 bg-crust-600 text-white" : "border-crust-200 text-crust-700"}`}>Mesa</button>
              {sillas.map((s) => (
                <button key={s.id} onClick={() => setComensal(s.id)} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${comensal === s.id ? "border-crust-600 bg-crust-600 text-white" : "border-crust-200 text-crust-700"}`}>
                  {s.nombre?.trim() || `Silla ${s.numero}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cuenta actual */}
        {grupos.length > 0 && (
          <div className="mb-4 rounded-2xl border border-crust-100 bg-white p-4">
            <p className="mb-2 text-sm font-semibold text-crust-700">Tu pedido</p>
            <div className="space-y-3">
              {grupos.map((g, i) => (
                <div key={i}>
                  <p className="text-xs font-semibold uppercase text-crust-400">{g.titulo}</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {g.items.map((it) => {
                      const est = ESTADO[it.status] ?? ESTADO.PENDIENTE;
                      return (
                        <li key={it.id} className={`flex items-center justify-between gap-2 ${it.pagado ? "text-crust-300 line-through" : "text-crust-700"}`}>
                          <span className="flex-1">{it.cantidad}× {it.producto.nombre}{it.modificadores.length ? ` (${it.modificadores.map((m) => m.nombre).join(", ")})` : ""}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${est.cls}`}>{est.label}</span>
                          <span className="w-16 text-right">{formatUYU(it.subtotal)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            {estado?.cuenta && (
              <p className="mt-2 flex justify-between border-t border-crust-100 pt-2 font-bold text-crust-900">
                <span>Total</span><span>{formatUYU(estado.cuenta.total)}</span>
              </p>
            )}
            <p className="mt-2 text-center text-xs text-crust-400">Para pagar, avisá al mozo. 🙂</p>
          </div>
        )}

        {/* Menú */}
        <div className="space-y-4">
          {menu.map((cat) => (
            <div key={cat.id}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-crust-400">{cat.nombre}</p>
              <div className="grid grid-cols-2 gap-2">
                {cat.productos.map((p) => (
                  <button key={p.id} onClick={() => elegir(p)} className="rounded-xl border border-crust-200 bg-white p-3 text-left active:bg-crust-50">
                    <span className="block font-medium text-crust-800">{p.nombre}</span>
                    <span className="text-sm text-crust-500">{formatUYU(p.precio)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modificadores */}
      {prodSel && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setProdSel(null)}>
          <div className="w-full rounded-t-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 font-display text-lg font-bold text-crust-800">{prodSel.nombre}</h3>
            <p className="mb-3 text-xs text-crust-500">Para: <b>{labelById(comensal || null)}</b></p>
            {prodSel.modifierGroups.map(({ group }) => (
              <div key={group.id} className="mb-3">
                <p className="mb-1 text-sm font-medium text-crust-600">{group.nombre}</p>
                <div className="flex flex-wrap gap-2">
                  {group.modifiers.map((m) => {
                    const single = group.maxSelect <= 1;
                    const on = (mods[group.id] ?? []).includes(m.id);
                    return (
                      <button key={m.id} onClick={() => toggleMod(group.id, m.id, single)} className={`rounded-full border px-4 py-2 text-sm ${on ? "border-crust-600 bg-crust-600 text-white" : "border-crust-200 text-crust-700"}`}>
                        {m.nombre}{Number(m.priceDelta) > 0 ? ` +${formatUYU(m.priceDelta)}` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button onClick={confirmarMods} className="mt-2 w-full rounded-xl bg-crust-600 py-3 font-semibold text-white active:bg-crust-700">Agregar</button>
          </div>
        </div>
      )}

      {/* Carrito */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-crust-100 bg-white p-3 shadow-lg">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 max-h-28 overflow-auto text-sm">
              {cart.map((l) => (
                <div key={l.key} className="flex items-center justify-between py-0.5">
                  <span className="text-crust-700">{l.producto.nombre}{l.modLabels.length ? ` (${l.modLabels.join(", ")})` : ""}<span className="ml-1 text-xs text-crust-400">· {labelById(l.sillaId)}</span></span>
                  <span className="flex items-center gap-2">{formatUYU(l.precio)}<button onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))} className="text-red-500">✕</button></span>
                </div>
              ))}
            </div>
            <button onClick={enviar} disabled={enviando} className="w-full rounded-xl bg-crust-600 py-3.5 text-lg font-semibold text-white active:bg-crust-700 disabled:opacity-50">
              {enviando ? "Enviando…" : `Enviar a cocina · ${formatUYU(cartTotal)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
