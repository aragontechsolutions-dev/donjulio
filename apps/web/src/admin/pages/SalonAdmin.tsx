import { useEffect, useState } from "react";
import { PaymentMethod } from "@donjulio/shared";
import { api } from "../../lib/api";
import { formatUYU } from "../../lib/format";

interface Mesa {
  id: string;
  numero: number;
  capacidad: number;
  status: string;
  zona: { nombre: string } | null;
  pedidoAbierto: { id: string; numero: number; total: number; itemsCount: number; mozo: string | null } | null;
}
interface Modifier { id: string; nombre: string; priceDelta: string }
interface ModGroup { group: { id: string; nombre: string; minSelect: number; maxSelect: number; modifiers: Modifier[] } }
interface PosProducto { id: string; nombre: string; precio: string; modifierGroups: ModGroup[] }
interface PosCategoria { id: string; nombre: string; productos: PosProducto[] }
interface CuentaItem { id: string; cantidad: number; precioUnitario: string; subtotal: string; producto: { nombre: string }; modificadores: { nombre: string }[] }
interface Cuenta { id: string; numero: number; total: string; items: CuentaItem[]; mozo: { nombre: string } | null }

const MESA_COLOR: Record<string, string> = {
  LIBRE: "border-green-300 bg-green-50 hover:bg-green-100",
  OCUPADA: "border-crust-400 bg-crust-100 hover:bg-crust-200",
  RESERVADA: "border-amber-300 bg-amber-50",
  PENDIENTE_PAGO: "border-red-300 bg-red-50",
};

export default function SalonAdmin() {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [menu, setMenu] = useState<PosCategoria[]>([]);
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [mesaSel, setMesaSel] = useState<Mesa | null>(null);
  const [prodSel, setProdSel] = useState<PosProducto | null>(null);
  const [mods, setMods] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  const loadMesas = () => api.get<Mesa[]>("/admin/salon/mesas").then(setMesas).catch(() => {});
  useEffect(() => {
    loadMesas();
    api.get<PosCategoria[]>("/admin/salon/menu").then(setMenu).catch(() => {});
  }, []);

  const abrirCuenta = async (m: Mesa) => {
    setError(null);
    try {
      let pedidoId = m.pedidoAbierto?.id;
      if (!pedidoId) {
        const p = await api.post<{ id: string }>(`/admin/salon/mesas/${m.id}/abrir`);
        pedidoId = p.id;
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

  const toggleMod = (groupId: string, modId: string, single: boolean) => {
    setMods((prev) => {
      const cur = prev[groupId] ?? [];
      if (single) return { ...prev, [groupId]: [modId] };
      return { ...prev, [groupId]: cur.includes(modId) ? cur.filter((x) => x !== modId) : [...cur, modId] };
    });
  };

  const agregar = async () => {
    if (!cuenta || !prodSel) return;
    const modificadorIds = Object.values(mods).flat();
    await api.post(`/admin/salon/pedidos/${cuenta.id}/items`, {
      items: [{ productoId: prodSel.id, cantidad: 1, modificadorIds }],
    });
    setProdSel(null);
    setMods({});
    const c = await api.get<Cuenta>(`/admin/salon/mesas/${mesaSel!.id}/cuenta`);
    setCuenta(c);
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
      <h1 className="mb-6 font-display text-2xl font-bold text-crust-800">Salón / Mesas</h1>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Mapa de mesas */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {mesas.map((m) => (
              <button
                key={m.id}
                onClick={() => abrirCuenta(m)}
                className={`rounded-2xl border-2 p-4 text-left transition-colors ${MESA_COLOR[m.status] ?? "border-crust-200"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-2xl font-bold text-crust-800">{m.numero}</span>
                  <span className="text-xs text-crust-500">👥 {m.capacidad}</span>
                </div>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-crust-500">{m.status}</p>
                {m.pedidoAbierto && (
                  <p className="mt-1 text-sm font-medium text-crust-700">
                    {formatUYU(m.pedidoAbierto.total)} · {m.pedidoAbierto.itemsCount} ít.
                  </p>
                )}
              </button>
            ))}
            {mesas.length === 0 && <p className="text-crust-400">No hay mesas. Corré el seed.</p>}
          </div>
        </div>

        {/* Panel de comanda */}
        <div className="rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          {!cuenta ? (
            <p className="text-crust-400">Elegí una mesa para abrir o ver su cuenta.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-crust-800">
                  Mesa {mesaSel?.numero} · #{cuenta.numero}
                </h3>
                <span className="text-sm text-crust-500">{cuenta.mozo?.nombre}</span>
              </div>

              <ul className="mb-3 max-h-48 space-y-1 overflow-auto text-sm">
                {cuenta.items.map((it) => (
                  <li key={it.id} className="flex justify-between border-b border-crust-50 py-1">
                    <span className="text-crust-700">
                      {it.cantidad}× {it.producto.nombre}
                      {it.modificadores.length > 0 && (
                        <span className="text-crust-400"> ({it.modificadores.map((m) => m.nombre).join(", ")})</span>
                      )}
                    </span>
                    <span className="font-medium">{formatUYU(it.subtotal)}</span>
                  </li>
                ))}
                {cuenta.items.length === 0 && <li className="text-crust-400">Sin ítems aún.</li>}
              </ul>
              <p className="mb-4 flex justify-between border-t border-crust-100 pt-2 font-bold text-crust-900">
                <span>Total</span><span>{formatUYU(cuenta.total)}</span>
              </p>

              {/* Agregar producto */}
              {!prodSel ? (
                <div className="mb-4 max-h-56 overflow-auto rounded-lg border border-crust-100 p-2">
                  {menu.map((cat) => (
                    <div key={cat.id} className="mb-2">
                      <p className="px-1 text-xs font-semibold uppercase text-crust-400">{cat.nombre}</p>
                      {cat.productos.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { setProdSel(p); setMods({}); }}
                          className="flex w-full justify-between rounded px-2 py-1 text-left text-sm hover:bg-crust-50"
                        >
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
                            <input
                              type={single ? "radio" : "checkbox"}
                              name={group.id}
                              checked={checked}
                              onChange={() => toggleMod(group.id, mod.id, single)}
                            />
                            {mod.nombre}
                            {Number(mod.priceDelta) > 0 && <span className="text-crust-400">(+{formatUYU(mod.priceDelta)})</span>}
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

              {/* Cobrar */}
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
