import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatearPeso,
  lineaConCantidad,
  PaymentMethod,
  UnidadVenta,
} from "@donjulio/shared";
import { api } from "../../lib/api";
import { showToast } from "../../lib/toast";
import { formatUYUExacto as formatUYU } from "../../lib/format";

interface Modifier { id: string; nombre: string; priceDelta: string }
interface Grupo { group: { id: string; nombre: string; minSelect: number; maxSelect: number; modifiers: Modifier[] } }
interface ProductoMostrador {
  id: string;
  nombre: string;
  precio: number;
  unidadVenta: string;
  ivaRate: string;
  imagenUrl: string | null;
  /** Unidades (o kilos) producidas sin vender. null = se prepara al momento. */
  stock: number | null;
  sePreparaAlMomento: boolean;
  modifierGroups: Grupo[];
}
interface CategoriaMostrador { id: string; nombre: string; productos: ProductoMostrador[] }

interface LineaCarrito {
  key: string;
  producto: ProductoMostrador;
  /** Unidades, o kilos de la balanza. */
  cantidad: number;
  modificadorIds: string[];
  modLabels: string[];
  /** Precio unitario (o por kilo) con los agregados ya sumados. */
  precio: number;
}

interface Ticket {
  numero: number;
  total: number;
  iva: number;
  neto: number;
  metodoPago: string;
  vuelto: number | null;
  aCocina: boolean;
  items: { nombre: string; cantidad: number; subtotal: number }[];
}

/** Si el local tiene posnet integrado y a cuál se le mandan los cobros. */
interface EstadoTerminal {
  habilitado: boolean;
  proveedor: string | null;
  terminalId: string | null;
}

/** Un cobro mandado a la terminal, mientras se espera al cliente. */
interface CobroTerminal {
  id: string;
  estado: "PENDIENTE" | "ENVIADO" | "APROBADO" | "RECHAZADO" | "CANCELADO" | "EXPIRADO" | "ERROR";
  monto: number;
  metodo: string;
  detalle: string | null;
  pedidoId: string | null;
  creadoEn: string;
  cerrado: boolean;
  ticket?: Ticket | null;
}

/** Qué se le dice a la cajera según cómo terminó el cobro. */
const FIN_COBRO: Record<string, string> = {
  RECHAZADO: "La tarjeta fue rechazada.",
  CANCELADO: "El cobro se canceló.",
  EXPIRADO: "Nadie respondió en la terminal.",
  ERROR: "No se pudo usar la terminal.",
};

/** Medios que se cobran apoyando la tarjeta en el posnet. */
const CON_TARJETA: PaymentMethod[] = [PaymentMethod.DEBITO, PaymentMethod.CREDITO];

const MEDIOS: [PaymentMethod, string][] = [
  [PaymentMethod.EFECTIVO, "Efectivo"],
  [PaymentMethod.DEBITO, "Débito"],
  [PaymentMethod.CREDITO, "Crédito"],
  [PaymentMethod.MERCADO_PAGO_QR, "QR"],
];
/** Billetes uruguayos frecuentes, para el vuelto. */
const BILLETES = [200, 500, 1000, 2000];
/** Pesos de atajo, en kilos: lo que marca la balanza. */
const PESOS_RAPIDOS = [0.25, 0.5, 1, 2];

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
/** Compara sin acentos ni mayúsculas, como busca una persona apurada. */
const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function MostradorAdmin() {
  const [catalogo, setCatalogo] = useState<CategoriaMostrador[]>([]);
  const [cajaAbierta, setCajaAbierta] = useState<boolean | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [catSel, setCatSel] = useState<string>("");
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [pesando, setPesando] = useState<ProductoMostrador | null>(null);
  const [kilos, setKilos] = useState("");
  const [metodo, setMetodo] = useState<PaymentMethod>(PaymentMethod.EFECTIVO);
  const [recibido, setRecibido] = useState("");
  const [cobrando, setCobrando] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [terminal, setTerminal] = useState<EstadoTerminal | null>(null);
  const [cobroTerminal, setCobroTerminal] = useState<CobroTerminal | null>(null);
  const [huerfanos, setHuerfanos] = useState<CobroTerminal[]>([]);
  const [verCarrito, setVerCarrito] = useState(false);
  const buscarRef = useRef<HTMLInputElement | null>(null);

  const cargar = () => {
    api.get<CategoriaMostrador[]>("/admin/mostrador/catalogo").then(setCatalogo).catch(() => {});
    api
      .get<{ abierta: boolean }>("/admin/caja/estado")
      .then((e) => setCajaAbierta(e.abierta))
      .catch(() => setCajaAbierta(null));
    api.get<EstadoTerminal>("/admin/mostrador/terminal").then(setTerminal).catch(() => {});
    // Cobros aprobados sin venta: tendría que ser siempre vacío, y si no lo
    // es hay plata cobrada sin ticket, así que se avisa arriba de todo.
    api
      .get<CobroTerminal[]>("/admin/mostrador/terminal/pendientes")
      .then(setHuerfanos)
      .catch(() => {});
  };
  useEffect(cargar, []);

  // Mientras hay un cobro en la terminal, se pregunta cómo viene. La venta la
  // registra el servidor al aprobarse, así que esto sólo mira.
  useEffect(() => {
    if (!cobroTerminal || cobroTerminal.cerrado) return;
    const t = setInterval(async () => {
      try {
        const c = await api.get<CobroTerminal>(
          `/admin/mostrador/terminal/cobro/${cobroTerminal.id}`,
        );
        setCobroTerminal(c);
        if (c.estado === "APROBADO" && c.ticket) {
          setTicket(c.ticket);
          setCobroTerminal(null);
          limpiar();
          cargar();
        }
      } catch {
        /* un pinchazo de red no corta la espera: se reintenta */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [cobroTerminal]);

  const total = useMemo(
    () => Math.round(carrito.reduce((a, l) => a + l.precio * l.cantidad, 0) * 100) / 100,
    [carrito],
  );
  const vuelto = (Number(recibido) || 0) - total;
  const esEfectivo = metodo === PaymentMethod.EFECTIVO;

  const visibles = useMemo(() => {
    const q = plano(busqueda.trim());
    return catalogo
      .filter((c) => !catSel || c.id === catSel)
      .map((c) => ({ ...c, productos: c.productos.filter((p) => !q || plano(p.nombre).includes(q)) }))
      .filter((c) => c.productos.length > 0);
  }, [catalogo, catSel, busqueda]);

  /** Lo ya cargado en el carrito, para no vender más de lo que hay. */
  const enCarrito = (productoId: string) =>
    carrito.filter((l) => l.producto.id === productoId).reduce((a, l) => a + l.cantidad, 0);

  const sinStock = (p: ProductoMostrador) => p.stock != null && p.stock - enCarrito(p.id) <= 0.0001;

  const agregar = (p: ProductoMostrador, cantidad: number) => {
    if (cantidad <= 0) return;
    if (p.stock != null && enCarrito(p.id) + cantidad > p.stock + 0.0001) {
      showToast("error", `Sólo quedan ${p.unidadVenta === UnidadVenta.KG ? formatearPeso(p.stock) : p.stock} de “${p.nombre}”.`);
      return;
    }
    setCarrito((c) => {
      // Lo mismo otra vez se suma a su línea en vez de abrir una nueva.
      const i = c.findIndex((l) => l.producto.id === p.id && l.modificadorIds.length === 0);
      if (i >= 0) {
        const copia = [...c];
        copia[i] = { ...copia[i], cantidad: Math.round((copia[i].cantidad + cantidad) * 1000) / 1000 };
        return copia;
      }
      return [...c, { key: uid(), producto: p, cantidad, modificadorIds: [], modLabels: [], precio: p.precio }];
    });
  };

  const elegir = (p: ProductoMostrador) => {
    if (sinStock(p)) return;
    if (p.unidadVenta === UnidadVenta.KG) {
      setKilos("");
      setPesando(p);
      return;
    }
    agregar(p, 1);
  };

  const confirmarPeso = () => {
    if (!pesando) return;
    const kg = Number(kilos);
    if (!Number.isFinite(kg) || kg <= 0) return;
    // La balanza no da más de tres decimales (el gramo).
    agregar(pesando, Math.round(kg * 1000) / 1000);
    setPesando(null);
    setKilos("");
    buscarRef.current?.focus();
  };

  const cambiarCantidad = (key: string, delta: number) =>
    setCarrito((c) =>
      c
        .map((l) => (l.key === key ? { ...l, cantidad: Math.round((l.cantidad + delta) * 1000) / 1000 } : l))
        .filter((l) => l.cantidad > 0.0001),
    );
  const quitar = (key: string) => setCarrito((c) => c.filter((l) => l.key !== key));

  const limpiar = () => {
    setCarrito([]);
    setRecibido("");
    setVerCarrito(false);
  };

  /** El carrito como lo espera la API. */
  const itemsParaApi = () =>
    carrito.map((l) => ({
      productoId: l.producto.id,
      cantidad: l.cantidad,
      ...(l.modificadorIds.length ? { modificadorIds: l.modificadorIds } : {}),
    }));

  /** Con posnet integrado, el débito y el crédito van por la terminal. */
  const porTerminal = !!terminal?.habilitado && CON_TARJETA.includes(metodo);

  const cobrar = async () => {
    if (carrito.length === 0 || cobrando) return;
    setCobrando(true);
    try {
      if (porTerminal) {
        // El monto se lo manda el servidor a la terminal y la venta se
        // registra sola al aprobarse: acá sólo se abre la espera.
        const cobro = await api.post<CobroTerminal>(
          "/admin/mostrador/terminal/cobro",
          { items: itemsParaApi(), metodoPago: metodo },
          { sinToast: true },
        );
        setCobroTerminal(cobro);
        return;
      }
      const res = await api.post<Ticket>(
        "/admin/mostrador/venta",
        {
          items: itemsParaApi(),
          metodoPago: metodo,
          ...(esEfectivo && recibido !== "" ? { recibido: Number(recibido) } : {}),
        },
        { sinToast: true },
      );
      setTicket(res);
      limpiar();
      cargar(); // el stock cambió
    } catch {
      /* el toast de error lo dispara el api client */
    } finally {
      setCobrando(false);
    }
  };

  /** Bajar el cobro de la terminal: la cajera o el cliente se arrepintieron. */
  const cancelarCobro = async () => {
    if (!cobroTerminal) return;
    try {
      const c = await api.post<CobroTerminal>(
        `/admin/mostrador/terminal/cobro/${cobroTerminal.id}/cancelar`,
        {},
        { sinToast: true },
      );
      setCobroTerminal(c);
    } catch {
      /* si no se pudo cancelar puede ser que el cliente ya haya pagado */
    }
  };

  /**
   * Seguir sin la terminal: se cobra en el posnet a mano y se registra la
   * venta igual. Es la salida cuando la terminal no responde, para que no
   * quede gente esperando en el mostrador.
   */
  const cobrarAMano = async () => {
    if (!cobroTerminal) return;
    if (!cobroTerminal.cerrado) await cancelarCobro();
    setCobroTerminal(null);
    setCobrando(true);
    try {
      const res = await api.post<Ticket>(
        "/admin/mostrador/venta",
        { items: itemsParaApi(), metodoPago: metodo },
        { sinToast: true },
      );
      setTicket(res);
      limpiar();
      cargar();
    } catch {
      /* el toast lo dispara el api client */
    } finally {
      setCobrando(false);
    }
  };

  // ── Comprobante de la última venta ──
  if (ticket) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-crust-100 bg-white p-6 text-center shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-crust-400">
            Venta #{ticket.numero} · {MEDIOS.find(([m]) => m === ticket.metodoPago)?.[1] ?? ticket.metodoPago}
          </p>
          <p className="mt-2 font-display text-4xl font-bold text-crust-900 tabular-nums">
            {formatUYU(ticket.total)}
          </p>

          {ticket.vuelto != null && (
            <div className="mt-4 rounded-xl bg-green-100 px-4 py-3">
              <p className="text-sm font-medium text-green-800">Vuelto a entregar</p>
              <p className="font-display text-3xl font-bold text-green-900 tabular-nums">
                {formatUYU(ticket.vuelto)}
              </p>
            </div>
          )}

          <ul className="mt-4 divide-y divide-crust-100 border-y border-crust-100 text-left text-sm">
            {ticket.items.map((it, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span className="text-crust-700">{it.nombre}</span>
                <span className="shrink-0 tabular-nums text-crust-600">{formatUYU(it.subtotal)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-crust-400">
            Neto {formatUYU(ticket.neto)} · IVA {formatUYU(ticket.iva)}
          </p>

          {ticket.aCocina && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Hay algo para preparar: ya salió en la pantalla de cocina.
            </p>
          )}

          <button
            onClick={() => { setTicket(null); buscarRef.current?.focus(); }}
            autoFocus
            className="mt-6 w-full rounded-xl bg-dj-terracota py-3.5 text-lg font-semibold text-white hover:bg-dj-cobre"
          >
            Nueva venta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-crust-800">Mostrador</h1>
        {cajaAbierta === false && (
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
            Caja cerrada
          </span>
        )}
      </div>

      {cajaAbierta === false && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          No hay caja abierta, así que no se puede cobrar. Abrila en <b>Caja</b> y volvé.
        </p>
      )}

      {/* Plata cobrada en la terminal que no llegó a quedar como venta. No se
          puede resolver sola: alguien tiene que registrarla o devolverla. */}
      {huerfanos.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">
            {huerfanos.length === 1
              ? "Hay un cobro con tarjeta sin venta registrada."
              : `Hay ${huerfanos.length} cobros con tarjeta sin venta registrada.`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {huerfanos.map((c) => (
              <li key={c.id} className="tabular-nums">
                {formatUYU(c.monto)} · {new Date(c.creadoEn).toLocaleString("es-UY", {
                  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                })}
                {c.detalle ? ` · ${c.detalle}` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">
            Al cliente se le cobró. Registrá la venta a mano o devolvele la plata desde Mercado Pago.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        {/* ── Catálogo ──
            min-w-0: sin esto la columna del grid toma el ancho de su contenido
            (la fila de categorías) y en el teléfono la página se va de lado. */}
        <div className="min-w-0">
          <input
            ref={buscarRef}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto…"
            className="mb-3 w-full rounded-xl border border-crust-200 px-4 py-3"
          />

          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setCatSel("")}
              className={`control-compacto shrink-0 rounded-full border px-3 py-1.5 text-sm ${catSel === "" ? "border-dj-terracota bg-dj-terracota text-white" : "border-crust-200 text-crust-700"}`}
            >
              Todo
            </button>
            {catalogo.map((c) => (
              <button
                key={c.id}
                onClick={() => setCatSel(c.id)}
                className={`control-compacto shrink-0 rounded-full border px-3 py-1.5 text-sm ${catSel === c.id ? "border-dj-terracota bg-dj-terracota text-white" : "border-crust-200 text-crust-700"}`}
              >
                {c.nombre}
              </button>
            ))}
          </div>

          <div className="space-y-4 pb-40 lg:pb-0">
            {visibles.map((c) => (
              <div key={c.id}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-crust-400">{c.nombre}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {c.productos.map((p) => {
                    const agotado = sinStock(p);
                    const porPeso = p.unidadVenta === UnidadVenta.KG;
                    return (
                      <button
                        key={p.id}
                        onClick={() => elegir(p)}
                        disabled={agotado}
                        className={`flex min-h-[5.5rem] flex-col justify-between rounded-xl border p-3 text-left transition-colors ${
                          agotado
                            ? "cursor-not-allowed border-crust-100 bg-crust-50 opacity-60"
                            : "border-crust-200 bg-white hover:border-dj-terracota hover:bg-dj-crema active:scale-[.98]"
                        }`}
                      >
                        <span className="text-sm font-semibold leading-tight text-crust-800">{p.nombre}</span>
                        <span className="mt-1">
                          <span className="block text-sm font-bold text-crust-700 tabular-nums">
                            {formatUYU(p.precio)}{porPeso ? " /kg" : ""}
                          </span>
                          <span className="block text-[11px] text-crust-400">
                            {agotado
                              ? "Sin stock"
                              : p.stock != null
                                ? `Quedan ${porPeso ? formatearPeso(p.stock) : p.stock}`
                                : porPeso
                                  ? "Por balanza"
                                  : "Al momento"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {visibles.length === 0 && (
              <p className="rounded-xl border border-crust-100 bg-white px-4 py-8 text-center text-crust-400">
                No hay productos que coincidan.
              </p>
            )}
          </div>
        </div>

        {/* ── Carrito y cobro ── */}
        <div
          className={`fixed inset-x-0 bottom-0 z-30 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-crust-200 bg-white p-4 shadow-[0_-8px_24px_rgba(0,0,0,.08)] lg:static lg:max-h-none lg:rounded-2xl lg:border lg:border-crust-100 lg:p-5 lg:shadow-sm ${verCarrito ? "" : "lg:block"}`}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-crust-700">Venta ({carrito.length})</h3>
            <div className="flex items-center gap-2">
              {carrito.length > 0 && (
                <button onClick={limpiar} className="control-compacto rounded-lg px-2 py-1 text-xs font-semibold text-crust-500 hover:bg-crust-100">
                  Vaciar
                </button>
              )}
              <button
                onClick={() => setVerCarrito((v) => !v)}
                className="control-compacto rounded-lg px-2 py-1 text-xs font-semibold text-crust-500 hover:bg-crust-100 lg:hidden"
              >
                {verCarrito ? "Ocultar" : "Ver"}
              </button>
            </div>
          </div>

          <div className={verCarrito ? "" : "hidden lg:block"}>
            {carrito.length === 0 ? (
              <p className="py-6 text-center text-sm text-crust-400">
                Tocá un producto para empezar.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-crust-100 border-y border-crust-100">
                {carrito.map((l) => {
                  const porPeso = l.producto.unidadVenta === UnidadVenta.KG;
                  return (
                    <li key={l.key} className="flex items-center gap-2 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-crust-800">
                          {lineaConCantidad(l.cantidad, l.producto.nombre, porPeso ? UnidadVenta.KG : UnidadVenta.UNIDAD)}
                        </span>
                        <span className="block text-[11px] text-crust-400 tabular-nums">
                          {formatUYU(l.precio)}{porPeso ? " /kg" : " c/u"}
                        </span>
                      </span>
                      {!porPeso && (
                        <span className="flex shrink-0 items-center gap-1">
                          <button
                            onClick={() => cambiarCantidad(l.key, -1)}
                            aria-label={`Quitar uno de ${l.producto.nombre}`}
                            className="h-7 w-7 rounded-full border border-crust-200 text-crust-600 active:bg-crust-100"
                          >
                            −
                          </button>
                          <button
                            onClick={() => cambiarCantidad(l.key, 1)}
                            aria-label={`Agregar otro ${l.producto.nombre}`}
                            className="h-7 w-7 rounded-full border border-crust-200 text-crust-600 active:bg-crust-100"
                          >
                            +
                          </button>
                        </span>
                      )}
                      <span className="w-20 shrink-0 text-right text-sm font-semibold text-crust-800 tabular-nums">
                        {formatUYU(l.precio * l.cantidad)}
                      </span>
                      <button
                        onClick={() => quitar(l.key)}
                        aria-label={`Sacar ${l.producto.nombre}`}
                        className="shrink-0 px-1 text-red-500"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Medio de pago */}
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {MEDIOS.map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => { setMetodo(m); setRecibido(""); }}
                  className={`control-compacto rounded-lg border py-2 text-xs font-semibold ${
                    metodo === m ? "border-dj-terracota bg-dj-terracota text-white" : "border-crust-200 text-crust-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {esEfectivo && carrito.length > 0 && (
              <div className="mt-3 rounded-xl border border-crust-100 bg-crust-50 p-3">
                <span className="mb-1 block text-sm font-medium text-crust-700">Paga con</span>
                <input
                  type="number" step="0.01" min="0" inputMode="decimal" placeholder="Ej: 1000"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value)}
                  className="w-full rounded-lg border border-crust-200 px-3 py-2 tabular-nums"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {BILLETES.map((b) => (
                    <button
                      key={b}
                      onClick={() => setRecibido(String(b))}
                      className="control-compacto rounded-md border border-crust-200 bg-white px-2 py-1 text-xs font-medium text-crust-700 hover:bg-crust-100"
                    >
                      ${b}
                    </button>
                  ))}
                  <button
                    onClick={() => setRecibido(String(total))}
                    className="control-compacto rounded-md border border-crust-200 bg-white px-2 py-1 text-xs font-medium text-crust-700 hover:bg-crust-100"
                  >
                    Justo
                  </button>
                </div>
                {recibido !== "" && (
                  vuelto >= 0 ? (
                    <div className="mt-2 flex items-center justify-between rounded-lg bg-green-100 px-3 py-2 text-green-800">
                      <span className="text-sm font-medium">Vuelto</span>
                      <span className="text-lg font-bold tabular-nums">{formatUYU(vuelto)}</span>
                    </div>
                  ) : (
                    <p className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-700">
                      Falta {formatUYU(-vuelto)} para cubrir el total.
                    </p>
                  )
                )}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-crust-600">Total</span>
            <span className="font-display text-2xl font-bold text-crust-900 tabular-nums">{formatUYU(total)}</span>
          </div>

          <button
            onClick={cobrar}
            disabled={
              carrito.length === 0 ||
              cobrando ||
              cajaAbierta === false ||
              (esEfectivo && recibido !== "" && vuelto < 0)
            }
            className="mt-2 w-full rounded-xl bg-dj-terracota py-3.5 text-lg font-semibold text-white hover:bg-dj-cobre disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cobrando
              ? "Cobrando…"
              : porTerminal
                ? `Cobrar ${formatUYU(total)} en la terminal`
                : `Cobrar ${formatUYU(total)}`}
          </button>
        </div>
      </div>

      {/* ── Esperando a que el cliente pague en la terminal ── */}
      {cobroTerminal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-crust-900/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-terminal"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            {!cobroTerminal.cerrado ? (
              <>
                <div
                  className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-crust-200 border-t-dj-terracota"
                  aria-hidden="true"
                />
                <h3 id="titulo-terminal" className="mt-4 font-display text-xl font-bold text-crust-900">
                  Esperando en la terminal
                </h3>
                <p className="mt-1 text-sm text-crust-500">
                  Pedile al cliente que apoye o inserte la tarjeta.
                </p>
              </>
            ) : cobroTerminal.estado === "APROBADO" ? (
              <>
                <p className="text-4xl" aria-hidden="true">✅</p>
                <h3 id="titulo-terminal" className="mt-2 font-display text-xl font-bold text-crust-900">
                  Pago aprobado
                </h3>
                <p className="mt-1 text-sm text-crust-500">Registrando la venta…</p>
              </>
            ) : (
              <>
                <p className="text-4xl" aria-hidden="true">⚠️</p>
                <h3 id="titulo-terminal" className="mt-2 font-display text-xl font-bold text-crust-900">
                  {FIN_COBRO[cobroTerminal.estado] ?? "El cobro no se completó."}
                </h3>
                <p className="mt-1 text-sm text-crust-500">
                  No se cobró nada. Podés volver a intentar o cobrar con el posnet.
                </p>
              </>
            )}

            <p className="mt-4 font-display text-3xl font-bold text-crust-900 tabular-nums">
              {formatUYU(cobroTerminal.monto)}
            </p>
            {cobroTerminal.detalle && (
              <p className="mt-2 rounded-lg bg-crust-50 px-3 py-2 text-xs text-crust-600">
                {cobroTerminal.detalle}
              </p>
            )}

            <div className="mt-5 grid gap-2">
              {!cobroTerminal.cerrado && (
                <button
                  onClick={cancelarCobro}
                  className="w-full rounded-xl border border-crust-200 py-2.5 font-medium text-crust-700 hover:bg-crust-100"
                >
                  Cancelar el cobro
                </button>
              )}
              {cobroTerminal.estado !== "APROBADO" && (
                <>
                  <button
                    onClick={cobrarAMano}
                    className="w-full rounded-xl bg-dj-terracota py-2.5 font-semibold text-white hover:bg-dj-cobre"
                  >
                    Cobré con el posnet: registrar la venta
                  </button>
                  <button
                    onClick={() => setCobroTerminal(null)}
                    className="w-full py-1 text-sm text-crust-500 underline"
                  >
                    Volver al carrito
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Peso de la balanza ── */}
      {pesando && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-crust-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-peso"
          onClick={() => setPesando(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="titulo-peso" className="font-display text-xl font-bold text-crust-800">{pesando.nombre}</h3>
            <p className="mb-3 text-sm text-crust-500">
              {formatUYU(pesando.precio)} el kilo
              {pesando.stock != null ? ` · quedan ${formatearPeso(pesando.stock - enCarrito(pesando.id))}` : ""}
            </p>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-crust-700">Peso de la balanza (kg)</span>
              <input
                type="number" min="0.001" step="0.001" inputMode="decimal" autoFocus placeholder="Ej: 0,350"
                value={kilos}
                onChange={(e) => setKilos(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") confirmarPeso(); }}
                className="w-full rounded-xl border border-crust-200 px-3 py-3 text-2xl tabular-nums"
              />
            </label>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {PESOS_RAPIDOS.map((kg) => (
                <button
                  key={kg}
                  onClick={() => setKilos(String(kg))}
                  className="control-compacto rounded-md border border-crust-200 px-2.5 py-1 text-xs font-medium text-crust-700 hover:bg-crust-100"
                >
                  {String(kg).replace(".", ",")} kg
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-baseline justify-between rounded-xl bg-crust-50 px-3 py-2">
              <span className="text-sm text-crust-600">
                {Number(kilos) > 0 ? formatearPeso(Number(kilos)) : "—"}
              </span>
              <span className="font-display text-xl font-bold text-crust-900 tabular-nums">
                {formatUYU((Number(kilos) || 0) * pesando.precio)}
              </span>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setPesando(null)}
                className="rounded-xl border border-crust-200 px-5 py-3 font-semibold text-crust-700 hover:bg-crust-100"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarPeso}
                disabled={!(Number(kilos) > 0)}
                className="flex-1 rounded-xl bg-dj-terracota py-3 font-semibold text-white hover:bg-dj-cobre disabled:opacity-50"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
