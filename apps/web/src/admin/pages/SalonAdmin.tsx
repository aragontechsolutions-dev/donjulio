import { useEffect, useRef, useState } from "react";
import { PaymentMethod } from "@donjulio/shared";
import { api } from "../../lib/api";
import { formatUYU } from "../../lib/format";

interface Zona { id: string; nombre: string }
interface Mesa {
  id: string;
  numero: number;
  capacidad: number;
  status: string;
  posX: number;
  posY: number;
  forma: string;
  zona: { id: string; nombre: string } | null;
  pedidoAbierto: { id: string; numero: number; total: number; itemsCount: number; mozo: string | null } | null;
}
interface Modifier { id: string; nombre: string; priceDelta: string }
interface ModGroup { group: { id: string; nombre: string; minSelect: number; maxSelect: number; modifiers: Modifier[] } }
interface PosProducto { id: string; nombre: string; precio: string; modifierGroups: ModGroup[] }
interface PosCategoria { id: string; nombre: string; productos: PosProducto[] }
interface CuentaItem { id: string; cantidad: number; precioUnitario: string; subtotal: string; producto: { nombre: string }; modificadores: { nombre: string }[] }
interface Cuenta { id: string; numero: number; total: string; items: CuentaItem[]; mozo: { nombre: string } | null }

const STATUS_BG: Record<string, string> = {
  LIBRE: "bg-green-100 border-green-400 text-green-800",
  OCUPADA: "bg-crust-200 border-crust-500 text-crust-800",
  RESERVADA: "bg-amber-100 border-amber-400 text-amber-800",
  PENDIENTE_PAGO: "bg-red-100 border-red-400 text-red-800",
};
const TILE = 76;

export default function SalonAdmin() {
  const [mode, setMode] = useState<"operar" | "editar">("operar");
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [error, setError] = useState<string | null>(null);

  // --- estado operar (comanda) ---
  const [menu, setMenu] = useState<PosCategoria[]>([]);
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [mesaSel, setMesaSel] = useState<Mesa | null>(null);
  const [prodSel, setProdSel] = useState<PosProducto | null>(null);
  const [mods, setMods] = useState<Record<string, string[]>>({});

  // --- estado editar ---
  const [editSel, setEditSel] = useState<Mesa | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; offX: number; offY: number; moved: boolean } | null>(null);

  const loadMesas = () =>
    api.get<Mesa[]>("/admin/salon/mesas").then(setMesas).catch(() => {});

  useEffect(() => {
    loadMesas();
    api.get<Zona[]>("/admin/salon/zonas").then(setZonas).catch(() => {});
    api.get<PosCategoria[]>("/admin/salon/menu").then(setMenu).catch(() => {});
  }, []);

  // ---------------- EDITAR: drag & drop ----------------
  useEffect(() => {
    if (mode !== "editar") return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      const canvas = canvasRef.current;
      if (!d || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      let x = e.clientX - rect.left - d.offX;
      let y = e.clientY - rect.top - d.offY;
      x = Math.max(0, Math.min(x, rect.width - TILE));
      y = Math.max(0, Math.min(y, rect.height - TILE));
      d.moved = true;
      setMesas((prev) => prev.map((m) => (m.id === d.id ? { ...m, posX: x, posY: y } : m)));
    };
    const onUp = async () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || !d.moved) return;
      const m = mesas.find((x) => x.id === d.id);
      if (m) {
        await api.patch(`/admin/salon/mesas/${m.id}`, {
          posX: Math.round(m.posX),
          posY: Math.round(m.posY),
        }).catch(() => {});
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [mode, mesas]);

  const startDrag = (e: React.PointerEvent, m: Mesa) => {
    if (mode !== "editar") return;
    const rect = canvasRef.current!.getBoundingClientRect();
    dragRef.current = {
      id: m.id,
      offX: e.clientX - rect.left - m.posX,
      offY: e.clientY - rect.top - m.posY,
      moved: false,
    };
    setEditSel(m);
  };

  const agregarMesa = async () => {
    setError(null);
    const numero = (mesas.reduce((max, m) => Math.max(max, m.numero), 0) || 0) + 1;
    try {
      await api.post("/admin/salon/mesas", {
        numero,
        capacidad: 4,
        posX: 20 + (mesas.length % 5) * 90,
        posY: 20 + Math.floor(mesas.length / 5) * 90,
        forma: "CUADRADA",
      });
      await loadMesas();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const guardarMesa = async () => {
    if (!editSel) return;
    setError(null);
    try {
      await api.patch(`/admin/salon/mesas/${editSel.id}`, {
        numero: editSel.numero,
        capacidad: editSel.capacidad,
        forma: editSel.forma,
        zonaId: editSel.zona?.id ?? null,
      });
      await loadMesas();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const eliminarMesa = async () => {
    if (!editSel) return;
    if (!confirm(`¿Eliminar la mesa ${editSel.numero}?`)) return;
    setError(null);
    try {
      await api.del(`/admin/salon/mesas/${editSel.id}`);
      setEditSel(null);
      await loadMesas();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const nuevaZona = async () => {
    const nombre = prompt("Nombre de la zona:");
    if (!nombre) return;
    await api.post("/admin/salon/zonas", { nombre });
    api.get<Zona[]>("/admin/salon/zonas").then(setZonas);
  };

  // ---------------- OPERAR: comanda ----------------
  const abrirCuenta = async (m: Mesa) => {
    setError(null);
    try {
      if (!m.pedidoAbierto) {
        await api.post(`/admin/salon/mesas/${m.id}/abrir`);
        await loadMesas();
      }
      const c = await api.get<Cuenta>(`/admin/salon/mesas/${m.id}/cuenta`);
      setCuenta(c);
      setMesaSel(m);
      setProdSel(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const toggleMod = (groupId: string, modId: string, single: boolean) =>
    setMods((prev) => {
      const cur = prev[groupId] ?? [];
      if (single) return { ...prev, [groupId]: [modId] };
      return { ...prev, [groupId]: cur.includes(modId) ? cur.filter((x) => x !== modId) : [...cur, modId] };
    });
  const agregar = async () => {
    if (!cuenta || !prodSel) return;
    await api.post(`/admin/salon/pedidos/${cuenta.id}/items`, {
      items: [{ productoId: prodSel.id, cantidad: 1, modificadorIds: Object.values(mods).flat() }],
    });
    setProdSel(null);
    setMods({});
    setCuenta(await api.get<Cuenta>(`/admin/salon/mesas/${mesaSel!.id}/cuenta`));
    loadMesas();
  };
  const cobrar = async (metodoPago: PaymentMethod) => {
    if (!cuenta) return;
    await api.post(`/admin/salon/pedidos/${cuenta.id}/cobrar`, { metodoPago });
    setCuenta(null);
    setMesaSel(null);
    loadMesas();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-crust-800">Salón / Mesas</h1>
        <div className="flex rounded-full bg-crust-100 p-1">
          {(["operar", "editar"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setCuenta(null); setMesaSel(null); setEditSel(null); }}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${mode === m ? "bg-crust-600 text-white" : "text-crust-700"}`}
            >
              {m === "operar" ? "Operar" : "Editar salón"}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {mode === "editar" && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={agregarMesa} className="rounded-lg bg-crust-600 px-4 py-2 text-sm font-semibold text-white hover:bg-crust-700">+ Agregar mesa</button>
          <button onClick={nuevaZona} className="rounded-lg border border-crust-200 px-4 py-2 text-sm text-crust-700 hover:bg-crust-100">+ Nueva zona</button>
          <span className="self-center text-sm text-crust-500">Arrastrá las mesas para ubicarlas. Tocá una para editarla.</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Lienzo del salón */}
        <div className="lg:col-span-2">
          <div
            ref={canvasRef}
            className="relative h-[520px] w-full overflow-hidden rounded-2xl border border-crust-200 bg-crust-50"
            style={{
              backgroundImage:
                "linear-gradient(#0000000a 1px, transparent 1px), linear-gradient(90deg, #0000000a 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          >
            {mesas.map((m) => (
              <button
                key={m.id}
                onPointerDown={(e) => startDrag(e, m)}
                onClick={() => {
                  if (mode === "operar") abrirCuenta(m);
                  else setEditSel(m);
                }}
                style={{ left: m.posX, top: m.posY, width: TILE, height: TILE, position: "absolute" }}
                className={`flex flex-col items-center justify-center border-2 shadow-sm ${STATUS_BG[m.status] ?? "bg-white border-crust-300"} ${m.forma === "CIRCULAR" ? "rounded-full" : "rounded-xl"} ${mode === "editar" ? "cursor-move touch-none" : "cursor-pointer"} ${editSel?.id === m.id ? "ring-2 ring-crust-600" : ""}`}
              >
                <span className="text-xl font-bold leading-none">{m.numero}</span>
                <span className="text-[10px]">👥{m.capacidad}</span>
                {m.pedidoAbierto && <span className="text-[10px] font-semibold">{formatUYU(m.pedidoAbierto.total)}</span>}
              </button>
            ))}
            {mesas.length === 0 && (
              <p className="absolute inset-0 grid place-items-center text-crust-400">
                {mode === "editar" ? "Agregá tu primera mesa con “+ Agregar mesa”." : "No hay mesas. Pasá a “Editar salón” para crearlas."}
              </p>
            )}
          </div>
        </div>

        {/* Panel lateral */}
        <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          {mode === "editar" ? (
            editSel ? (
              <div className="space-y-3">
                <h3 className="font-display text-lg font-semibold text-crust-800">Mesa {editSel.numero}</h3>
                <label className="block text-sm text-crust-600">Número
                  <input type="number" value={editSel.numero} onChange={(e) => setEditSel({ ...editSel, numero: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-crust-200 px-3 py-2" />
                </label>
                <label className="block text-sm text-crust-600">Sillas (capacidad)
                  <input type="number" min={1} value={editSel.capacidad} onChange={(e) => setEditSel({ ...editSel, capacidad: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-crust-200 px-3 py-2" />
                </label>
                <label className="block text-sm text-crust-600">Forma
                  <select value={editSel.forma} onChange={(e) => setEditSel({ ...editSel, forma: e.target.value })} className="mt-1 w-full rounded-lg border border-crust-200 px-3 py-2">
                    <option value="CUADRADA">Cuadrada</option>
                    <option value="CIRCULAR">Circular</option>
                  </select>
                </label>
                <label className="block text-sm text-crust-600">Zona
                  <select value={editSel.zona?.id ?? ""} onChange={(e) => setEditSel({ ...editSel, zona: e.target.value ? { id: e.target.value, nombre: zonas.find((z) => z.id === e.target.value)?.nombre ?? "" } : null })} className="mt-1 w-full rounded-lg border border-crust-200 px-3 py-2">
                    <option value="">— sin zona —</option>
                    {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
                  </select>
                </label>
                <div className="flex gap-2 pt-2">
                  <button onClick={guardarMesa} className="flex-1 rounded-lg bg-crust-600 py-2 font-semibold text-white hover:bg-crust-700">Guardar</button>
                  <button onClick={eliminarMesa} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50">Eliminar</button>
                </div>
              </div>
            ) : (
              <p className="text-crust-400">Tocá una mesa para editar su número, sillas, forma y zona; o arrastrala para moverla.</p>
            )
          ) : !cuenta ? (
            <p className="text-crust-400">Elegí una mesa para abrir o ver su cuenta.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-crust-800">Mesa {mesaSel?.numero} · #{cuenta.numero}</h3>
                <span className="text-sm text-crust-500">{cuenta.mozo?.nombre}</span>
              </div>
              <ul className="mb-3 max-h-48 space-y-1 overflow-auto text-sm">
                {cuenta.items.map((it) => (
                  <li key={it.id} className="flex justify-between border-b border-crust-50 py-1">
                    <span className="text-crust-700">{it.cantidad}× {it.producto.nombre}{it.modificadores.length ? ` (${it.modificadores.map((m) => m.nombre).join(", ")})` : ""}</span>
                    <span className="font-medium">{formatUYU(it.subtotal)}</span>
                  </li>
                ))}
                {cuenta.items.length === 0 && <li className="text-crust-400">Sin ítems aún.</li>}
              </ul>
              <p className="mb-4 flex justify-between border-t border-crust-100 pt-2 font-bold text-crust-900"><span>Total</span><span>{formatUYU(cuenta.total)}</span></p>
              {!prodSel ? (
                <div className="mb-4 max-h-56 overflow-auto rounded-lg border border-crust-100 p-2">
                  {menu.map((cat) => (
                    <div key={cat.id} className="mb-2">
                      <p className="px-1 text-xs font-semibold uppercase text-crust-400">{cat.nombre}</p>
                      {cat.productos.map((p) => (
                        <button key={p.id} onClick={() => { setProdSel(p); setMods({}); }} className="flex w-full justify-between rounded px-2 py-1 text-left text-sm hover:bg-crust-50">
                          <span>{p.nombre}</span><span className="text-crust-500">{formatUYU(p.precio)}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mb-4 rounded-lg border border-crust-200 bg-crust-50 p-3">
                  <p className="mb-2 font-semibold text-crust-800">{prodSel.nombre}</p>
                  {prodSel.modifierGroups.map(({ group }) => (
                    <div key={group.id} className="mb-2">
                      <p className="text-xs font-medium text-crust-600">{group.nombre}</p>
                      {group.modifiers.map((mod) => {
                        const single = group.maxSelect <= 1;
                        const checked = (mods[group.id] ?? []).includes(mod.id);
                        return (
                          <label key={mod.id} className="flex items-center gap-2 text-sm text-crust-700">
                            <input type={single ? "radio" : "checkbox"} name={group.id} checked={checked} onChange={() => toggleMod(group.id, mod.id, single)} />
                            {mod.nombre}{Number(mod.priceDelta) > 0 && <span className="text-crust-400">(+{formatUYU(mod.priceDelta)})</span>}
                          </label>
                        );
                      })}
                    </div>
                  ))}
                  <div className="mt-2 flex gap-2">
                    <button onClick={agregar} className="flex-1 rounded-lg bg-crust-600 py-1.5 text-sm font-semibold text-white hover:bg-crust-700">Agregar</button>
                    <button onClick={() => setProdSel(null)} className="rounded-lg border border-crust-200 px-3 py-1.5 text-sm">Cancelar</button>
                  </div>
                </div>
              )}
              {cuenta.items.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold text-crust-700">Cobrar con:</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => cobrar(PaymentMethod.EFECTIVO)} className="rounded-lg bg-green-600 py-2 text-sm font-semibold text-white hover:bg-green-700">Efectivo</button>
                    <button onClick={() => cobrar(PaymentMethod.MERCADO_PAGO_QR)} className="rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-700">QR / MP</button>
                    <button onClick={() => cobrar(PaymentMethod.DEBITO)} className="rounded-lg bg-crust-600 py-2 text-sm font-semibold text-white hover:bg-crust-700">Débito</button>
                    <button onClick={() => cobrar(PaymentMethod.CREDITO)} className="rounded-lg bg-crust-600 py-2 text-sm font-semibold text-white hover:bg-crust-700">Crédito</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
