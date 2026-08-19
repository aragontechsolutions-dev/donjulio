import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { agruparIguales, lineaConCantidad } from "@donjulio/shared";
import { LogoHorizontal, Monograma, Sello } from "../lib/Logo";
import { showToast } from "../lib/toast";
import { formatUYU } from "../lib/format";
import ProductoCard from "../lib/ProductoCard";

const BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "http://localhost:3000/api";

interface Modifier { id: string; nombre: string; priceDelta: string }
interface Grupo { group: { id: string; nombre: string; minSelect: number; maxSelect: number; modifiers: Modifier[] } }
interface Prod { id: string; nombre: string; precio: string; descripcion: string | null; imagenUrl: string | null; destacado: boolean; modifierGroups: Grupo[] }
interface Cat { id: string; nombre: string; productos: Prod[] }
interface Silla { id: string; numero: number; nombre: string | null }
interface CuentaItem {
  id: string; cantidad: number; subtotal: string; sillaId: string | null; pagado: boolean; status: string;
  producto: { nombre: string }; modificadores: { nombre: string }[];
}
interface Estado {
  mesa: { id: string; numero: number; status: string; pideCuentaAt: string | null; sillas: Silla[] };
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
  const [comensalId, setComensalId] = useState<string>("");
  const [comensalNombre, setComensalNombre] = useState<string>("");
  const [nombreInput, setNombreInput] = useState<string>("");
  const [identificando, setIdentificando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [pidiendoCuenta, setPidiendoCuenta] = useState(false);
  const [despedida, setDespedida] = useState(false);
  // ¿Llegamos a confirmar contra el servidor que esta identidad es válida?
  // Sirve para no despedir a alguien que nunca llegó a pedir en esta visita.
  const identidadViva = useRef(false);

  const STORE_KEY = `auto:${token}:comensal`;

  const loadEstado = () => apiGet<Estado>(`/autoservicio/${token}`).then(setEstado).catch(() => setNotFound(true));

  useEffect(() => {
    loadEstado();
    apiGet<Cat[]>(`/autoservicio/${token}/menu`).then(setMenu).catch(() => setNotFound(true));
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { try { const v = JSON.parse(raw); setComensalId(v.id); setComensalNombre(v.nombre); } catch { /* ignore */ } }
    const t = setInterval(loadEstado, 8000);
    return () => clearInterval(t);
  }, [token]);

  /** Limpia el tablet. Con `conDespedida`, muestra el agradecimiento primero. */
  const resetCliente = (conDespedida = false) => {
    identidadViva.current = false;
    setComensalId("");
    setComensalNombre("");
    setNombreInput("");
    setCart([]);
    setProdSel(null);
    setConfirmando(false);
    localStorage.removeItem(STORE_KEY);
    if (conDespedida) {
      setDespedida(true);
      setTimeout(() => setDespedida(false), 6000);
    }
  };

  // La confirmación se cierra con Escape y también si el carrito quedó vacío.
  useEffect(() => {
    if (!confirmando) return;
    if (cart.length === 0) { setConfirmando(false); return; }
    const alTeclear = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirmando(false); };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [confirmando, cart.length]);

  const pedirCuenta = async () => {
    setPidiendoCuenta(true);
    try {
      const r = await fetch(`${BASE}/autoservicio/${token}/pedir-cuenta`, { method: "POST" });
      if (!r.ok) throw new Error();
      showToast("success", "¡Listo! El mozo ya viene a cobrar 🧾");
      loadEstado();
    } catch {
      showToast("error", "No se pudo avisar. Llamá al mozo, por favor.");
    } finally {
      setPidiendoCuenta(false);
    }
  };

  // Reconcilia el comensal guardado con el estado de la mesa. Si la mesa se
  // cerró (se pagó todo → sillas sin nombre) o el comensal ya no existe, deja
  // el tablet como nuevo para el próximo grupo.
  useEffect(() => {
    if (!estado || !comensalId) return;
    const igual = (a?: string | null, b?: string | null) =>
      (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

    const porId = estado.mesa.sillas.find((s) => s.id === comensalId);
    if (porId && igual(porId.nombre, comensalNombre)) {
      identidadViva.current = true; // confirmada contra el servidor
      return;
    }
    // La silla puede haber cambiado de id (la mesa se rearmó): se busca por nombre.
    const porNombre = estado.mesa.sillas.find((s) => igual(s.nombre, comensalNombre));
    if (porNombre) {
      identidadViva.current = true;
      setComensalId(porNombre.id);
      localStorage.setItem(STORE_KEY, JSON.stringify({ id: porNombre.id, nombre: porNombre.nombre }));
      return;
    }

    // Ya no hay silla con ese nombre. Hay dos motivos muy distintos:
    //
    //  · Estábamos pidiendo y la mesa se cerró (se cobró todo y se limpiaron
    //    los nombres) → corresponde despedir y dejar el tablet listo.
    //  · Acabamos de abrir el QR con una identidad vieja guardada en el
    //    teléfono, de una visita anterior. Ahí despedir no tiene sentido:
    //    la persona recién llega y lo único que ve es "gracias por tu visita"
    //    tapándole el formulario durante seis segundos.
    resetCliente(identidadViva.current);
  }, [estado]); // eslint-disable-line react-hooks/exhaustive-deps

  const identificar = async (nombre: string) => {
    const n = nombre.trim();
    if (!n) return;
    setIdentificando(true);
    try {
      const r = await fetch(`${BASE}/autoservicio/${token}/comensal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: n }),
      });
      if (!r.ok) throw new Error();
      const s = (await r.json()) as Silla;
      setComensalId(s.id);
      setComensalNombre(s.nombre ?? n);
      localStorage.setItem(STORE_KEY, JSON.stringify({ id: s.id, nombre: s.nombre ?? n }));
      setNombreInput("");
      loadEstado();
    } catch {
      showToast("error", "No se pudo registrar tu nombre. Reintentá.");
    } finally {
      setIdentificando(false);
    }
  };
  const cambiarComensal = () => { setComensalId(""); setComensalNombre(""); localStorage.removeItem(STORE_KEY); };

  const sillas = estado?.mesa.sillas ?? [];
  const cartTotal = useMemo(() => cart.reduce((a, l) => a + l.precio, 0), [cart]);
  // Dos veces el mismo producto (con los mismos agregados y para el mismo
  // comensal) es una sola línea con cantidad, no dos renglones repetidos.
  const lineasCarrito = useMemo(
    () =>
      agruparIguales(
        cart,
        (l) => `${l.producto.id}|${[...l.modificadorIds].sort().join(",")}|${l.sillaId ?? ""}`,
      ),
    [cart],
  );
  const sumarUno = (l: CartLine) => setCart((c) => [...c, { ...l, key: uid() }]);
  const quitarUno = (keys: string[]) => {
    const ultima = keys[keys.length - 1];
    setCart((c) => c.filter((x) => x.key !== ultima));
  };
  const sillaLabel = (s: Silla) => (s.nombre?.trim() ? `${s.nombre} (silla ${s.numero})` : `Silla ${s.numero}`);
  const labelById = (id: string | null) => {
    if (!id) return "Mesa";
    const s = sillas.find((x) => x.id === id);
    return s ? sillaLabel(s) : "Mesa";
  };

  const elegir = (p: Prod) => {
    if (!comensalId) { showToast("info", "Primero ingresá tu nombre para pedir."); return; }
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
    setCart((c) => [...c, { key: uid(), producto: p, modificadorIds: ids, modLabels: labels, precio: Number(p.precio) + extra, sillaId: comensalId || null }]);

  const enviar = async () => {
    if (cart.length === 0) return;
    setConfirmando(false);
    setEnviando(true);
    try {
      // Lo repetido viaja como una sola línea con cantidad: así la cocina ve
      // "2 × Medialunas de manteca" y no dos renglones sueltos.
      const items = lineasCarrito.map((g) => ({
        productoId: g.primera.producto.id,
        cantidad: g.cantidad,
        modificadorIds: g.primera.modificadorIds,
        ...(g.primera.sillaId ? { sillaId: g.primera.sillaId } : {}),
      }));
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

  // Junta los ítems iguales del mismo comensal en una línea con cantidad. No
  // se juntan si están en estados distintos: uno puede estar listo y el otro
  // todavía en cocina, y eso se tiene que ver.
  const juntarItems = (items: CuentaItem[]) =>
    agruparIguales(
      items,
      (it) =>
        `${it.producto.nombre}|${it.modificadores.map((m) => m.nombre).sort().join(",")}|${it.status}|${it.pagado}`,
      (it) => it.cantidad,
    ).map((g) => ({
      id: g.primera.id,
      cantidad: g.cantidad,
      subtotal: g.lineas.reduce((a, it) => a + Number(it.subtotal), 0),
      status: g.primera.status,
      pagado: g.primera.pagado,
      nombre: g.primera.producto.nombre,
      modificadores: g.primera.modificadores.map((m) => m.nombre),
    }));

  const grupos = useMemo(() => {
    if (!estado?.cuenta) return [];
    const gs = sillas.map((s) => ({ titulo: sillaLabel(s), items: estado.cuenta!.items.filter((it) => it.sillaId === s.id) }));
    const sin = estado.cuenta.items.filter((it) => !it.sillaId);
    if (sin.length) gs.push({ titulo: "Sin asignar", items: sin });
    return gs.filter((g) => g.items.length > 0).map((g) => ({ titulo: g.titulo, items: juntarItems(g.items) }));
  }, [estado, sillas]);

  if (notFound) {
    return (
      <div className="grid min-h-screen place-items-center bg-dj-papel p-6 text-center">
        <div>
          <Monograma tinta="#E3D5B8" acento="#E3D5B8" className="mx-auto h-16 w-16" />
          <h1 className="mt-6 font-display text-2xl font-bold text-dj-carbon">Mesa no encontrada</h1>
          <p className="mt-2 text-dj-humo">El código QR no es válido o expiró. Pedí uno nuevo al personal.</p>
        </div>
      </div>
    );
  }

  if (despedida) {
    return (
      <div className="grid min-h-screen place-items-center bg-dj-carbon p-6 text-center">
        <div className="animate-[fadeIn_.4s_ease-out]">
          <Sello tinta="#F5F0E6" acento="#C9A56B" className="mx-auto h-28 w-28" />
          <h1 className="mt-8 font-display text-4xl font-bold text-dj-papel">
            ¡Gracias por tu visita!
          </h1>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-marca text-dj-dorado">
            Te esperamos pronto
          </p>
          <button
            onClick={() => setDespedida(false)}
            className="mt-10 rounded-full border border-dj-papel/30 px-7 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-dj-papel transition-colors hover:bg-dj-papel hover:text-dj-carbon"
          >
            Comenzar nuevo pedido
          </button>
        </div>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dj-papel pb-40">
      <header className="sticky top-0 z-20 bg-dj-carbon px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <LogoHorizontal tinta="#F5F0E6" acento="#C9A56B" className="h-9 w-auto" />
          <p className="shrink-0 text-right text-[10px] font-semibold uppercase leading-tight tracking-[0.16em] text-dj-dorado">
            Mesa {estado?.mesa.numero ?? "…"}
            <span className="block text-dj-papel/50">Autoservicio</span>
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl p-4">
        {/* Identificación por nombre */}
        {comensalId ? (
          <div className="mb-4 flex items-center justify-between rounded-2xl border border-crust-100 bg-white px-4 py-3">
            <span className="text-sm text-crust-700">Pedís como <b className="text-crust-900">{comensalNombre}</b></span>
            <button onClick={cambiarComensal} className="rounded-lg px-2 py-1 text-xs font-semibold text-crust-500 hover:bg-crust-100">Cambiar</button>
          </div>
        ) : (
          <div className="mb-4 rounded-2xl border border-crust-100 bg-white p-4">
            <p className="mb-1 font-display text-xl font-semibold text-dj-carbon">¡Hola!</p>
            <p className="mb-3 text-sm text-crust-500">Ingresá tu nombre para pedir (así podés dividir la cuenta después).</p>
            <form onSubmit={(e) => { e.preventDefault(); identificar(nombreInput); }} className="flex flex-col gap-2 sm:flex-row">
              <input
                value={nombreInput}
                onChange={(e) => setNombreInput(e.target.value)}
                placeholder="Tu nombre"
                className="w-full min-w-0 flex-1 rounded-xl border border-crust-200 px-3 py-2.5"
                autoFocus
              />
              <button type="submit" disabled={identificando || !nombreInput.trim()} className="w-full shrink-0 rounded-xl bg-dj-terracota px-5 py-2.5 font-semibold text-white active:bg-dj-cobre disabled:opacity-50 sm:w-auto">
                {identificando ? "Entrando…" : "Entrar"}
              </button>
            </form>
            {sillas.filter((s) => s.nombre?.trim()).length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs text-crust-400">¿Ya pediste antes? Tocá tu nombre:</p>
                <div className="flex flex-wrap gap-2">
                  {sillas.filter((s) => s.nombre?.trim()).map((s) => (
                    <button key={s.id} onClick={() => identificar(s.nombre!)} className="rounded-full border border-crust-200 px-3 py-1.5 text-sm text-crust-700 active:bg-crust-100">
                      {s.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                          <span className="flex-1">{lineaConCantidad(it.cantidad, it.nombre)}{it.modificadores.length ? ` (${it.modificadores.join(", ")})` : ""}</span>
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
            {estado?.mesa.pideCuentaAt ? (
              <p className="mt-3 rounded-xl bg-green-100 px-3 py-2.5 text-center text-sm font-medium text-green-800">
                🧾 Ya avisamos al mozo. Enseguida pasa a cobrar.
              </p>
            ) : (
              <button
                onClick={pedirCuenta}
                disabled={pidiendoCuenta}
                className="mt-3 w-full rounded-xl bg-dj-terracota py-3 font-semibold text-white active:bg-crust-800 disabled:opacity-50"
              >
                {pidiendoCuenta ? "Avisando…" : "Pedir la cuenta"}
              </button>
            )}
          </div>
        )}

        {/* Menú */}
        <div className="space-y-4">
          {menu.map((cat) => (
            <div key={cat.id}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-crust-400">{cat.nombre}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {cat.productos.map((p) => (
                  <ProductoCard
                    key={p.id}
                    nombre={p.nombre}
                    precio={p.precio}
                    descripcion={p.descripcion}
                    imagenUrl={p.imagenUrl}
                    destacado={p.destacado}
                    onClick={() => elegir(p)}
                  />
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
            <p className="mb-3 text-xs text-crust-500">Para: <b>{comensalNombre || "vos"}</b></p>
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

      {/* Confirmación antes de mandar a cocina */}
      {confirmando && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-dj-carbon/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-confirmar"
          onClick={() => setConfirmando(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-dj-papel p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <Sello tinta="#2B2724" acento="#C9A56B" className="mx-auto h-14 w-14" />
              <h3 id="titulo-confirmar" className="mt-3 font-display text-2xl font-bold text-dj-carbon">
                ¿Confirmás tu pedido?
              </h3>
              <p className="mt-1 text-sm text-crust-500">
                Esto va derecho a la cocina. Después no se puede cambiar solo: habría que avisarle al mozo.
              </p>
            </div>

            <ul className="my-5 divide-y divide-crust-100 border-y border-crust-100">
              {lineasCarrito.map((g) => (
                <li key={g.clave} className="flex items-baseline justify-between gap-3 py-2.5">
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

            <p className="flex items-baseline justify-between font-display text-xl font-bold text-dj-carbon">
              <span>Total</span>
              <span className="tabular-nums">{formatUYU(cartTotal)}</span>
            </p>
            <p className="mt-1 text-xs text-crust-500">Pedís como {comensalNombre || "invitado/a"}.</p>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
              <button
                onClick={() => setConfirmando(false)}
                className="flex-1 rounded-xl border border-crust-200 py-3.5 font-semibold text-crust-700 transition-colors hover:bg-crust-100"
              >
                Seguir mirando
              </button>
              <button
                onClick={enviar}
                disabled={enviando}
                autoFocus
                className="flex-1 rounded-xl bg-dj-terracota py-3.5 font-semibold text-white transition-colors hover:bg-dj-cobre disabled:opacity-50"
              >
                {enviando ? "Enviando…" : "Sí, enviar a cocina"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Carrito */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-crust-100 bg-white p-3 shadow-lg">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 max-h-28 overflow-auto text-sm">
              {lineasCarrito.map((g) => (
                <div key={g.clave} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="min-w-0 flex-1 truncate text-crust-700">
                    {lineaConCantidad(g.cantidad, g.primera.producto.nombre)}
                    {g.primera.modLabels.length ? ` (${g.primera.modLabels.join(", ")})` : ""}
                    <span className="ml-1 text-xs text-crust-400">· {labelById(g.primera.sillaId)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="tabular-nums">{formatUYU(g.primera.precio * g.cantidad)}</span>
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
            <button onClick={() => setConfirmando(true)} disabled={enviando} className="w-full rounded-xl bg-dj-terracota py-3.5 text-lg font-semibold text-white active:bg-dj-cobre disabled:opacity-50">
              {enviando ? "Enviando…" : `Enviar pedido · ${formatUYU(cartTotal)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
