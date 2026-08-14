import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { PaymentMethod } from "@donjulio/shared";
import { api } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { formatUYU } from "../../lib/format";
import Modal from "../../lib/Modal";

interface Zona { id: string; nombre: string }
interface Silla { id: string; numero: number; nombre: string | null; posX: number; posY: number }
interface Mesa {
  id: string;
  numero: number;
  capacidad: number;
  status: string;
  posX: number;
  posY: number;
  forma: string;
  qrToken: string;
  zona: { id: string; nombre: string } | null;
  sillas: Silla[];
  pedidoAbierto: { id: string; numero: number; total: number; itemsCount: number; mozo: string | null } | null;
}
interface Modifier { id: string; nombre: string; priceDelta: string }
interface ModGroup { group: { id: string; nombre: string; minSelect: number; maxSelect: number; modifiers: Modifier[] } }
interface PosProducto { id: string; nombre: string; precio: string; modifierGroups: ModGroup[] }
interface PosCategoria { id: string; nombre: string; productos: PosProducto[] }
interface CuentaItem {
  id: string;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  sillaId: string | null;
  pagado: boolean;
  producto: { nombre: string };
  modificadores: { nombre: string }[];
}
interface Cuenta {
  id: string;
  numero: number;
  total: string;
  items: CuentaItem[];
  mozo: { nombre: string } | null;
  mesa: { id: string; numero: number; sillas: Silla[] } | null;
}

// Colores del ícono de mesa según estado (relleno / borde / texto).
const STATUS_COLOR: Record<string, { fill: string; stroke: string; text: string }> = {
  LIBRE: { fill: "#dcfce7", stroke: "#4ade80", text: "#166534" },
  OCUPADA: { fill: "#e7e5e4", stroke: "#a8a29e", text: "#44403c" },
  RESERVADA: { fill: "#fef3c7", stroke: "#fbbf24", text: "#92400e" },
  PENDIENTE_PAGO: { fill: "#fee2e2", stroke: "#f87171", text: "#991b1b" },
};
const statusColor = (s: string) =>
  STATUS_COLOR[s] ?? { fill: "#ffffff", stroke: "#d6d3d1", text: "#44403c" };
const TILE = 76;
const CHAIR = 24;

/** Ícono de mesa (vista superior), redonda o cuadrada, tintado por estado. */
function TableIcon({ forma, fill, stroke, size }: { forma: string; fill: string; stroke: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="absolute inset-0" aria-hidden>
      {forma === "CIRCULAR" ? (
        <>
          <circle cx="24" cy="24" r="18" fill={fill} stroke={stroke} strokeWidth="2.5" />
          <circle cx="24" cy="24" r="10" fill="none" stroke={stroke} strokeOpacity="0.45" strokeWidth="1.5" />
        </>
      ) : (
        <>
          <rect x="6" y="6" width="36" height="36" rx="8" fill={fill} stroke={stroke} strokeWidth="2.5" />
          <rect x="14" y="14" width="20" height="20" rx="4" fill="none" stroke={stroke} strokeOpacity="0.45" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

/** Ícono de silla (vista superior): respaldo + asiento. */
function ChairIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0" aria-hidden>
      <rect x="4" y="3.5" width="16" height="4" rx="2" fill={color} />
      <rect x="5" y="8" width="14" height="12" rx="3" fill={color} />
    </svg>
  );
}
const METODOS: { m: PaymentMethod; label: string; cls: string }[] = [
  { m: PaymentMethod.EFECTIVO, label: "Efectivo", cls: "bg-green-600 hover:bg-green-700" },
  { m: PaymentMethod.MERCADO_PAGO_QR, label: "QR / MP", cls: "bg-sky-600 hover:bg-sky-700" },
  { m: PaymentMethod.DEBITO, label: "Débito", cls: "bg-crust-600 hover:bg-crust-700" },
  { m: PaymentMethod.CREDITO, label: "Crédito", cls: "bg-crust-600 hover:bg-crust-700" },
];

/** Iniciales para mostrar sobre la silla cuando tiene cliente asignado. */
const inicial = (nombre: string | null) => (nombre ? nombre.trim().charAt(0).toUpperCase() : "");

/** QR del autoservicio de una mesa (se genera en el cliente, sin dependencias externas). */
function QrMesa({ url }: { url: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(url, { width: 240, margin: 1 }).then(setSrc).catch(() => setSrc(""));
  }, [url]);
  return src ? <img src={src} alt="QR de la mesa" className="mx-auto h-40 w-40 rounded-lg" /> : <div className="h-40" />;
}

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
  const [comensalSel, setComensalSel] = useState<string>(""); // sillaId o "" = sin asignar
  const [splitMode, setSplitMode] = useState<"todo" | "comensal" | "iguales">("todo");
  const [sillasCobro, setSillasCobro] = useState<string[]>([]); // sillas seleccionadas para cobro parcial

  // --- estado editar ---
  const [editSel, setEditSel] = useState<Mesa | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ kind: "mesa" | "silla"; id: string; mesaId?: string; offX: number; offY: number; moved: boolean } | null>(null);
  const [zonaModal, setZonaModal] = useState(false);
  const [zonaNombre, setZonaNombre] = useState("");
  const [savingZona, setSavingZona] = useState(false);

  const loadMesas = () =>
    api.get<Mesa[]>("/admin/salon/mesas").then(setMesas).catch(() => {});

  useEffect(() => {
    loadMesas();
    api.get<Zona[]>("/admin/salon/zonas").then(setZonas).catch(() => {});
    api.get<PosCategoria[]>("/admin/salon/menu").then(setMenu).catch(() => {});
  }, []);

  // Mesa "viva" seleccionada en editar (para reflejar sillas al instante).
  const editMesa = useMemo(() => mesas.find((m) => m.id === editSel?.id) ?? null, [mesas, editSel]);

  // ---------------- EDITAR: drag & drop (mesas y sillas) ----------------
  useEffect(() => {
    if (mode !== "editar") return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      const canvas = canvasRef.current;
      if (!d || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      d.moved = true;
      if (d.kind === "mesa") {
        let x = e.clientX - rect.left - d.offX;
        let y = e.clientY - rect.top - d.offY;
        x = Math.max(0, Math.min(x, rect.width - TILE));
        y = Math.max(0, Math.min(y, rect.height - TILE));
        setMesas((prev) => prev.map((m) => (m.id === d.id ? { ...m, posX: x, posY: y } : m)));
      } else {
        // Silla: offset relativo al centro de su mesa.
        setMesas((prev) =>
          prev.map((m) => {
            if (m.id !== d.mesaId) return m;
            const cx = m.posX + TILE / 2;
            const cy = m.posY + TILE / 2;
            const ox = e.clientX - rect.left - cx;
            const oy = e.clientY - rect.top - cy;
            return { ...m, sillas: m.sillas.map((s) => (s.id === d.id ? { ...s, posX: ox, posY: oy } : s)) };
          }),
        );
      }
    };
    const onUp = async () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || !d.moved) return;
      if (d.kind === "mesa") {
        const m = mesas.find((x) => x.id === d.id);
        if (m) await api.patch(`/admin/salon/mesas/${m.id}`, { posX: Math.round(m.posX), posY: Math.round(m.posY) }).catch(() => {});
      } else {
        const m = mesas.find((x) => x.id === d.mesaId);
        const s = m?.sillas.find((x) => x.id === d.id);
        if (s) await api.patch(`/admin/salon/sillas/${s.id}`, { posX: Math.round(s.posX), posY: Math.round(s.posY) }).catch(() => {});
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [mode, mesas]);

  const startDragMesa = (e: React.PointerEvent, m: Mesa) => {
    if (mode !== "editar") return;
    const rect = canvasRef.current!.getBoundingClientRect();
    dragRef.current = { kind: "mesa", id: m.id, offX: e.clientX - rect.left - m.posX, offY: e.clientY - rect.top - m.posY, moved: false };
    setEditSel(m);
  };
  const startDragSilla = (e: React.PointerEvent, m: Mesa, s: Silla) => {
    if (mode !== "editar") return;
    e.stopPropagation();
    dragRef.current = { kind: "silla", id: s.id, mesaId: m.id, offX: 0, offY: 0, moved: false };
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

  // Sillas
  const agregarSilla = async () => {
    if (!editMesa) return;
    if (editMesa.sillas.length >= editMesa.capacidad) {
      showToast("error", `La mesa ${editMesa.numero} admite ${editMesa.capacidad} sillas. Subí la capacidad primero.`);
      return;
    }
    try {
      await api.post(`/admin/salon/mesas/${editMesa.id}/sillas`, {});
      await loadMesas();
    } catch {
      /* toast del api */
    }
  };
  const renombrarSilla = async (s: Silla, nombre: string) => {
    // Optimista en UI; persiste al salir del input (onBlur).
    setMesas((prev) => prev.map((m) => ({ ...m, sillas: m.sillas.map((x) => (x.id === s.id ? { ...x, nombre } : x)) })));
  };
  const guardarNombreSilla = async (s: Silla) => {
    await api.patch(`/admin/salon/sillas/${s.id}`, { nombre: s.nombre || null }).catch(() => {});
  };
  const eliminarSilla = async (s: Silla) => {
    try {
      await api.del(`/admin/salon/sillas/${s.id}`);
      await loadMesas();
    } catch {
      /* toast del api */
    }
  };

  const regenerarToken = async () => {
    if (!editMesa) return;
    if (!confirm("¿Generar un QR nuevo? Los códigos/enlaces anteriores dejarán de funcionar.")) return;
    try {
      await api.post(`/admin/salon/mesas/${editMesa.id}/rotar-token`);
      await loadMesas();
    } catch {
      /* toast del api */
    }
  };

  const abrirNuevaZona = () => {
    setZonaNombre("");
    setZonaModal(true);
  };
  const crearZona = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zonaNombre.trim()) return;
    setSavingZona(true);
    try {
      await api.post("/admin/salon/zonas", { nombre: zonaNombre.trim() });
      setZonaModal(false);
      api.get<Zona[]>("/admin/salon/zonas").then(setZonas).catch(() => {});
    } catch {
      /* toast del api */
    } finally {
      setSavingZona(false);
    }
  };

  // ---------------- OPERAR: comanda ----------------
  const refreshCuenta = async (mesaId: string) => {
    const c = await api.get<Cuenta>(`/admin/salon/mesas/${mesaId}/cuenta`);
    setCuenta(c);
  };

  // Tiempo real en modo operar: refresca el mapa y la cuenta abierta cada 5s.
  useEffect(() => {
    if (mode !== "operar") return;
    const t = setInterval(() => {
      loadMesas();
      if (mesaSel) refreshCuenta(mesaSel.id).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [mode, mesaSel]);
  const abrirCuenta = async (m: Mesa) => {
    setError(null);
    try {
      if (!m.pedidoAbierto) {
        await api.post(`/admin/salon/mesas/${m.id}/abrir`);
        await loadMesas();
      }
      await refreshCuenta(m.id);
      setMesaSel(m);
      setProdSel(null);
      setComensalSel("");
      setSplitMode("todo");
      setSillasCobro([]);
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
    if (!cuenta || !prodSel || !mesaSel) return;
    await api.post(`/admin/salon/pedidos/${cuenta.id}/items`, {
      items: [{ productoId: prodSel.id, cantidad: 1, modificadorIds: Object.values(mods).flat(), ...(comensalSel ? { sillaId: comensalSel } : {}) }],
    });
    setProdSel(null);
    setMods({});
    await refreshCuenta(mesaSel.id);
    loadMesas();
  };

  const finalizarCobro = async (res: { cerrado?: boolean }) => {
    if (!mesaSel) return;
    if (res.cerrado) {
      setCuenta(null);
      setMesaSel(null);
    } else {
      await refreshCuenta(mesaSel.id);
      setSillasCobro([]);
    }
    loadMesas();
  };
  const cobrarTodo = async (metodoPago: PaymentMethod) => {
    if (!cuenta) return;
    try {
      const res = await api.post<{ cerrado?: boolean }>(`/admin/salon/pedidos/${cuenta.id}/cobrar`, { metodoPago });
      await finalizarCobro(res);
    } catch {
      /* toast del api */
    }
  };
  const cobrarComensales = async (metodoPago: PaymentMethod) => {
    if (!cuenta || sillasCobro.length === 0) return;
    try {
      const res = await api.post<{ cerrado?: boolean }>(`/admin/salon/pedidos/${cuenta.id}/cobrar-parcial`, {
        metodoPago,
        sillaIds: sillasCobro,
      });
      await finalizarCobro(res);
    } catch {
      /* toast del api */
    }
  };

  // Agrupa los ítems de la cuenta por comensal (silla) + "sin asignar".
  const gruposCuenta = useMemo(() => {
    if (!cuenta) return [];
    const sillas = cuenta.mesa?.sillas ?? [];
    const grupos = sillas.map((s) => ({
      sillaId: s.id as string | null,
      titulo: s.nombre?.trim() ? `${s.nombre} (silla ${s.numero})` : `Silla ${s.numero}`,
      items: cuenta.items.filter((it) => it.sillaId === s.id),
    }));
    const sinAsignar = cuenta.items.filter((it) => !it.sillaId);
    if (sinAsignar.length) grupos.push({ sillaId: null, titulo: "Sin asignar", items: sinAsignar });
    return grupos.filter((g) => g.items.length > 0);
  }, [cuenta]);

  const pendienteDe = (items: CuentaItem[]) =>
    items.filter((it) => !it.pagado).reduce((a, it) => a + Number(it.subtotal), 0);
  const totalPendiente = cuenta ? pendienteDe(cuenta.items) : 0;
  const nComensalesConItems = gruposCuenta.filter((g) => g.sillaId && pendienteDe(g.items) > 0).length || 1;

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
          <button onClick={abrirNuevaZona} className="rounded-lg border border-crust-200 px-4 py-2 text-sm text-crust-700 hover:bg-crust-100">+ Nueva zona</button>
          <span className="self-center text-sm text-crust-500">Arrastrá mesas y sillas para ubicarlas. Tocá una mesa para editarla.</span>
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
              <div key={m.id}>
                {/* Sillas de la mesa */}
                {m.sillas.map((s) => {
                  const left = m.posX + TILE / 2 + s.posX - CHAIR / 2;
                  const top = m.posY + TILE / 2 + s.posY - CHAIR / 2;
                  const ocupada = !!s.nombre?.trim();
                  return (
                    <div
                      key={s.id}
                      onPointerDown={(e) => startDragSilla(e, m, s)}
                      title={s.nombre?.trim() ? `${s.nombre} (silla ${s.numero})` : `Silla ${s.numero}`}
                      style={{ left, top, width: CHAIR, height: CHAIR, position: "absolute" }}
                      className={`relative z-10 grid place-items-center ${mode === "editar" ? "cursor-move touch-none" : "pointer-events-none"}`}
                    >
                      <ChairIcon color={ocupada ? "#78716c" : "#d6d3d1"} size={CHAIR} />
                      <span className={`relative mt-1 text-[8px] font-bold leading-none ${ocupada ? "text-white" : "text-crust-600"}`}>
                        {ocupada ? inicial(s.nombre) : s.numero}
                      </span>
                    </div>
                  );
                })}
                {/* Mesa */}
                <button
                  onPointerDown={(e) => startDragMesa(e, m)}
                  onClick={() => { if (mode === "operar") abrirCuenta(m); else setEditSel(m); }}
                  style={{ left: m.posX, top: m.posY, width: TILE, height: TILE, position: "absolute" }}
                  className={`relative flex flex-col items-center justify-center ${m.forma === "CIRCULAR" ? "rounded-full" : "rounded-xl"} ${mode === "editar" ? "cursor-move touch-none" : "cursor-pointer"} ${editSel?.id === m.id ? "ring-2 ring-crust-600 ring-offset-1" : ""}`}
                >
                  <TableIcon forma={m.forma} fill={statusColor(m.status).fill} stroke={statusColor(m.status).stroke} size={TILE} />
                  <div className="relative z-10 flex flex-col items-center justify-center leading-none" style={{ color: statusColor(m.status).text }}>
                    <span className="text-lg font-bold">{m.numero}</span>
                    <span className="text-[9px] font-semibold">👥{m.sillas.length}/{m.capacidad}</span>
                    {m.pedidoAbierto && <span className="text-[9px] font-semibold">{formatUYU(m.pedidoAbierto.total)}</span>}
                  </div>
                </button>
              </div>
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
            editMesa ? (
              <div className="space-y-3">
                <h3 className="font-display text-lg font-semibold text-crust-800">Mesa {editMesa.numero}</h3>
                <label className="block text-sm text-crust-600">Número
                  <input type="number" value={editSel?.numero ?? editMesa.numero} onChange={(e) => setEditSel({ ...(editSel ?? editMesa), numero: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-crust-200 px-3 py-2" />
                </label>
                <label className="block text-sm text-crust-600">Capacidad (máx. sillas)
                  <input type="number" min={editMesa.sillas.length} value={editSel?.capacidad ?? editMesa.capacidad} onChange={(e) => setEditSel({ ...(editSel ?? editMesa), capacidad: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-crust-200 px-3 py-2" />
                  <span className="mt-1 block text-xs text-crust-400">Tiene {editMesa.sillas.length} sillas. No podés bajar de ese número sin eliminarlas.</span>
                </label>
                <label className="block text-sm text-crust-600">Forma
                  <select value={editSel?.forma ?? editMesa.forma} onChange={(e) => setEditSel({ ...(editSel ?? editMesa), forma: e.target.value })} className="mt-1 w-full rounded-lg border border-crust-200 px-3 py-2">
                    <option value="CUADRADA">Cuadrada</option>
                    <option value="CIRCULAR">Circular</option>
                  </select>
                </label>
                <label className="block text-sm text-crust-600">Zona
                  <select value={(editSel ?? editMesa).zona?.id ?? ""} onChange={(e) => setEditSel({ ...(editSel ?? editMesa), zona: e.target.value ? { id: e.target.value, nombre: zonas.find((z) => z.id === e.target.value)?.nombre ?? "" } : null })} className="mt-1 w-full rounded-lg border border-crust-200 px-3 py-2">
                    <option value="">— sin zona —</option>
                    {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
                  </select>
                </label>
                <div className="flex gap-2 pt-1">
                  <button onClick={guardarMesa} className="flex-1 rounded-lg bg-crust-600 py-2 font-semibold text-white hover:bg-crust-700">Guardar</button>
                  <button onClick={eliminarMesa} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50">Eliminar</button>
                </div>

                {/* Sillas / comensales */}
                <div className="border-t border-crust-100 pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-crust-700">Sillas ({editMesa.sillas.length}/{editMesa.capacidad})</h4>
                    <button onClick={agregarSilla} disabled={editMesa.sillas.length >= editMesa.capacidad} className="rounded-lg bg-crust-100 px-2 py-1 text-xs font-semibold text-crust-700 hover:bg-crust-200 disabled:opacity-50">+ Silla</button>
                  </div>
                  <ul className="space-y-2">
                    {editMesa.sillas.map((s) => (
                      <li key={s.id} className="flex items-center gap-2">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-crust-100 text-xs font-bold text-crust-600">{s.numero}</span>
                        <input
                          value={s.nombre ?? ""}
                          onChange={(e) => renombrarSilla(s, e.target.value)}
                          onBlur={() => guardarNombreSilla(s)}
                          placeholder="Nombre del cliente (opcional)"
                          className="flex-1 rounded-lg border border-crust-200 px-2 py-1 text-sm"
                        />
                        <button onClick={() => eliminarSilla(s)} className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50" title="Eliminar silla">✕</button>
                      </li>
                    ))}
                    {editMesa.sillas.length === 0 && <li className="text-xs text-crust-400">Sin sillas. Agregá con “+ Silla”.</li>}
                  </ul>
                </div>

                {/* Autoservicio: QR / link por mesa */}
                <div className="border-t border-crust-100 pt-3">
                  <h4 className="mb-2 text-sm font-semibold text-crust-700">Autoservicio (QR)</h4>
                  {(() => {
                    const url = `${window.location.origin}/mesa/${editMesa.qrToken}`;
                    return (
                      <div className="space-y-2">
                        <div className="rounded-xl border border-crust-100 bg-crust-50 p-3">
                          <QrMesa url={url} />
                        </div>
                        <p className="break-all rounded-lg bg-crust-50 px-2 py-1 text-xs text-crust-500">{url}</p>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => { navigator.clipboard?.writeText(url); showToast("success", "Link copiado ✓"); }} className="rounded-lg bg-crust-100 px-3 py-1.5 text-xs font-semibold text-crust-700 hover:bg-crust-200">Copiar link</button>
                          <a href={url} target="_blank" rel="noreferrer" className="rounded-lg bg-crust-100 px-3 py-1.5 text-xs font-semibold text-crust-700 hover:bg-crust-200">Abrir</a>
                          <button onClick={regenerarToken} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">Regenerar</button>
                        </div>
                        <p className="text-xs text-crust-400">Imprimí el QR y ponelo en la mesa, o abrí el link en el tablet fijo. El cliente pide desde ahí; no puede cobrar.</p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <p className="text-crust-400">Tocá una mesa para editar su número, capacidad, forma, zona y sillas; o arrastrá mesas/sillas para moverlas.</p>
            )
          ) : !cuenta ? (
            <p className="text-crust-400">Elegí una mesa para abrir o ver su cuenta.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-crust-800">Mesa {mesaSel?.numero} · #{cuenta.numero}</h3>
                <span className="text-sm text-crust-500">{cuenta.mozo?.nombre}</span>
              </div>

              {/* Cuenta agrupada por comensal */}
              <div className="mb-3 max-h-52 space-y-3 overflow-auto text-sm">
                {gruposCuenta.map((g) => (
                  <div key={g.sillaId ?? "sin"}>
                    <div className="flex items-center justify-between text-xs font-semibold uppercase text-crust-400">
                      <span>{g.titulo}</span>
                      <span>{formatUYU(pendienteDe(g.items))}</span>
                    </div>
                    <ul>
                      {g.items.map((it) => (
                        <li key={it.id} className={`flex justify-between border-b border-crust-50 py-1 ${it.pagado ? "text-crust-300 line-through" : "text-crust-700"}`}>
                          <span>{it.cantidad}× {it.producto.nombre}{it.modificadores.length ? ` (${it.modificadores.map((m) => m.nombre).join(", ")})` : ""}</span>
                          <span className="font-medium">{formatUYU(it.subtotal)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {cuenta.items.length === 0 && <p className="text-crust-400">Sin ítems aún.</p>}
              </div>
              <p className="mb-4 flex justify-between border-t border-crust-100 pt-2 font-bold text-crust-900"><span>Total pendiente</span><span>{formatUYU(totalPendiente)}</span></p>

              {/* Selector de comensal + alta de productos */}
              {!prodSel ? (
                <>
                  {(cuenta.mesa?.sillas.length ?? 0) > 0 && (
                    <label className="mb-2 block text-sm">
                      <span className="mb-1 block font-medium text-crust-700">Cargar a…</span>
                      <select value={comensalSel} onChange={(e) => setComensalSel(e.target.value)} className="w-full rounded-lg border border-crust-200 px-3 py-2">
                        <option value="">Sin asignar (mesa)</option>
                        {cuenta.mesa?.sillas.map((s) => (
                          <option key={s.id} value={s.id}>{s.nombre?.trim() ? `${s.nombre} (silla ${s.numero})` : `Silla ${s.numero}`}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="mb-4 max-h-48 overflow-auto rounded-lg border border-crust-100 p-2">
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
                </>
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
                  <p className="mb-2 text-xs text-crust-500">Comensal: <b>{comensalSel ? (cuenta.mesa?.sillas.find((s) => s.id === comensalSel)?.nombre?.trim() || `Silla ${cuenta.mesa?.sillas.find((s) => s.id === comensalSel)?.numero}`) : "Sin asignar"}</b></p>
                  <div className="mt-2 flex gap-2">
                    <button onClick={agregar} className="flex-1 rounded-lg bg-crust-600 py-1.5 text-sm font-semibold text-white hover:bg-crust-700">Agregar</button>
                    <button onClick={() => setProdSel(null)} className="rounded-lg border border-crust-200 px-3 py-1.5 text-sm">Cancelar</button>
                  </div>
                </div>
              )}

              {/* Cobro / división de cuenta */}
              {totalPendiente > 0 && (
                <div className="border-t border-crust-100 pt-3">
                  <div className="mb-2 flex rounded-full bg-crust-100 p-1 text-xs font-semibold">
                    {([["todo", "Todo"], ["comensal", "Por comensal"], ["iguales", "Partes iguales"]] as const).map(([k, label]) => (
                      <button key={k} onClick={() => { setSplitMode(k); setSillasCobro([]); }} className={`flex-1 rounded-full px-2 py-1 ${splitMode === k ? "bg-crust-600 text-white" : "text-crust-700"}`}>{label}</button>
                    ))}
                  </div>

                  {splitMode === "iguales" && (
                    <p className="mb-2 rounded-lg bg-crust-50 px-3 py-2 text-sm text-crust-700">
                      {nComensalesConItems} comensales · <b>{formatUYU(totalPendiente / nComensalesConItems)}</b> cada uno.
                      <span className="mt-1 block text-xs text-crust-400">Cobralo con los botones (registra el total).</span>
                    </p>
                  )}

                  {splitMode === "comensal" && (
                    <div className="mb-2 space-y-1">
                      <p className="text-xs font-medium text-crust-600">Elegí a quién cobrar:</p>
                      {gruposCuenta.filter((g) => g.sillaId && pendienteDe(g.items) > 0).map((g) => (
                        <label key={g.sillaId} className="flex items-center justify-between rounded-lg border border-crust-100 px-2 py-1 text-sm">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={sillasCobro.includes(g.sillaId!)} onChange={(e) => setSillasCobro((prev) => e.target.checked ? [...prev, g.sillaId!] : prev.filter((x) => x !== g.sillaId))} />
                            {g.titulo}
                          </span>
                          <span className="font-medium text-crust-700">{formatUYU(pendienteDe(g.items))}</span>
                        </label>
                      ))}
                      {gruposCuenta.filter((g) => g.sillaId && pendienteDe(g.items) > 0).length === 0 && (
                        <p className="text-xs text-crust-400">No hay consumos asignados a comensales. Asigná ítems a las sillas al cargarlos.</p>
                      )}
                      {sillasCobro.length > 0 && (
                        <p className="pt-1 text-right text-sm font-semibold text-crust-800">
                          Seleccionado: {formatUYU(gruposCuenta.filter((g) => g.sillaId && sillasCobro.includes(g.sillaId)).reduce((a, g) => a + pendienteDe(g.items), 0))}
                        </p>
                      )}
                    </div>
                  )}

                  <p className="mb-2 text-sm font-semibold text-crust-700">
                    {splitMode === "comensal" ? "Cobrar comensales con:" : "Cobrar con:"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {METODOS.map(({ m, label, cls }) => (
                      <button
                        key={m}
                        onClick={() => (splitMode === "comensal" ? cobrarComensales(m) : cobrarTodo(m))}
                        disabled={splitMode === "comensal" && sillasCobro.length === 0}
                        className={`rounded-lg py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {zonaModal && (
        <Modal
          title="Nueva zona"
          subtitle="Agrupá mesas por sector (salón, vereda, terraza…)"
          onClose={() => setZonaModal(false)}
        >
          <form onSubmit={crearZona} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Nombre de la zona</span>
              <input
                autoFocus required
                value={zonaNombre}
                onChange={(e) => setZonaNombre(e.target.value)}
                className="w-full rounded-lg border border-crust-200 px-3 py-2"
                placeholder="Ej: Terraza"
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={savingZona} className="flex-1 rounded-lg bg-crust-600 py-2 font-semibold text-white hover:bg-crust-700 disabled:opacity-60">
                {savingZona ? "Guardando…" : "Crear zona"}
              </button>
              <button type="button" onClick={() => setZonaModal(false)} className="rounded-lg border border-crust-200 px-4 py-2 text-crust-700 hover:bg-crust-100">Cancelar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
