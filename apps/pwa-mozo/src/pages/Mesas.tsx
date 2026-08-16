import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { cacheGet, cacheSet } from "../lib/db";
import { formatUYU } from "../lib/format";
import { useAuth } from "../lib/auth";
import { LogoHorizontal } from "../lib/Logo";
import type { MesaSel } from "../App";

interface Mesa {
  id: string;
  numero: number;
  capacidad: number;
  status: string;
  forma: string;
  pideCuentaAt: string | null;
  zona: { id: string; nombre: string } | null;
  pedidoAbierto: { total: number; itemsCount: number; mozo: string | null } | null;
}

/** Paleta por estado: fondo de la card, ícono de mesa y chip. */
const ESTADO: Record<string, { label: string; card: string; fill: string; stroke: string; chip: string }> = {
  LIBRE: { label: "Libre", card: "bg-white border-green-200", fill: "#dcfce7", stroke: "#4ade80", chip: "bg-green-100 text-green-700" },
  OCUPADA: { label: "Ocupada", card: "bg-white border-dj-arena", fill: "#E3D5B8", stroke: "#C9A56B", chip: "bg-dj-arena text-dj-grafito" },
  RESERVADA: { label: "Reservada", card: "bg-white border-amber-200", fill: "#fef3c7", stroke: "#fbbf24", chip: "bg-amber-100 text-amber-700" },
  PENDIENTE_PAGO: { label: "Por cobrar", card: "bg-white border-red-200", fill: "#fee2e2", stroke: "#f87171", chip: "bg-red-100 text-red-700" },
};
const estadoDe = (s: string) => ESTADO[s] ?? ESTADO.OCUPADA;

/** Ícono de mesa vista desde arriba (redonda o cuadrada), tintado por estado. */
function MesaIcon({ forma, fill, stroke }: { forma: string; fill: string; stroke: string }) {
  return (
    <svg viewBox="0 0 48 48" className="h-14 w-14" aria-hidden>
      {forma === "CIRCULAR" ? (
        <>
          <circle cx="24" cy="24" r="17" fill={fill} stroke={stroke} strokeWidth="2.5" />
          <circle cx="24" cy="24" r="9" fill="none" stroke={stroke} strokeOpacity="0.4" strokeWidth="1.5" />
        </>
      ) : (
        <>
          <rect x="7" y="7" width="34" height="34" rx="8" fill={fill} stroke={stroke} strokeWidth="2.5" />
          <rect x="15" y="15" width="18" height="18" rx="4" fill="none" stroke={stroke} strokeOpacity="0.4" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

export default function Mesas({ onSelect }: { onSelect: (m: MesaSel) => void }) {
  const { user, logout } = useAuth();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [fromCache, setFromCache] = useState(false);

  const load = () =>
    api
      .get<Mesa[]>("/admin/salon/mesas")
      .then((m) => {
        setMesas(m);
        setFromCache(false);
        cacheSet("mesas", m);
      })
      .catch(async () => {
        const cached = await cacheGet<Mesa[]>("mesas");
        if (cached) {
          setMesas(cached);
          setFromCache(true);
        }
      });

  useEffect(() => {
    load();
    // Tiempo real: refresca la disponibilidad de mesas cada 5s.
    const t = setInterval(() => { if (navigator.onLine) load(); }, 5000);
    return () => clearInterval(t);
  }, []);

  const libres = mesas.filter((m) => m.status === "LIBRE").length;
  const ocupadas = mesas.length - libres;

  return (
    <div className="min-h-screen bg-dj-papel">
      <header className="mb-4 flex items-center justify-between gap-3 bg-dj-carbon px-4 py-3">
        <LogoHorizontal tinta="#F5F0E6" acento="#C9A56B" className="h-9 w-auto" />
        <div className="flex items-center gap-3">
          <p className="text-right text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-dj-dorado">
            {user?.nombre}
            {fromCache && <span className="block text-dj-papel/50">caché · offline</span>}
          </p>
          <button
            onClick={logout}
            className="rounded-full border border-dj-papel/25 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-dj-papel/80 active:bg-dj-papel active:text-dj-carbon"
          >
            Salir
          </button>
        </div>
      </header>

      <div className="p-4 pt-0">
      <h1 className="mb-4 font-display text-2xl font-bold text-dj-carbon">Mesas</h1>

      {/* Resumen del salón */}
      {mesas.length > 0 && (
        <div className="mb-4 flex gap-2 text-xs font-medium">
          <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">{libres} libres</span>
          <span className="rounded-full bg-dj-arena px-3 py-1 text-dj-grafito">{ocupadas} ocupadas</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {mesas.map((m) => {
          const e = estadoDe(m.status);
          return (
            <button
              key={m.id}
              onClick={() => onSelect({ id: m.id, numero: m.numero })}
              className={`relative flex flex-col items-center overflow-hidden rounded-2xl border p-4 shadow-sm transition-transform active:scale-[.97] ${
                m.pideCuentaAt ? "border-amber-300 bg-amber-50 ring-2 ring-amber-200" : e.card
              }`}
            >
              {m.pideCuentaAt && (
                <span className="absolute right-2 top-2 animate-pulse rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-bold text-white shadow">
                  🧾 CUENTA
                </span>
              )}

              <div className="relative">
                <MesaIcon forma={m.forma} fill={e.fill} stroke={e.stroke} />
                <span className="absolute inset-0 grid place-items-center font-display text-xl font-bold text-crust-800">
                  {m.numero}
                </span>
              </div>

              <span className={`mt-2 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${e.chip}`}>
                {e.label}
              </span>

              <span className="mt-1.5 text-[11px] text-crust-400">
                👥 {m.capacidad}{m.zona ? ` · ${m.zona.nombre}` : ""}
              </span>

              {m.pedidoAbierto ? (
                <span className="mt-1 text-sm font-bold text-crust-800">{formatUYU(m.pedidoAbierto.total)}</span>
              ) : (
                <span className="mt-1 text-xs text-crust-300">—</span>
              )}
            </button>
          );
        })}
        {mesas.length === 0 && (
          <p className="col-span-full rounded-2xl border border-crust-100 bg-white p-10 text-center text-crust-400">
            Sin mesas disponibles.
          </p>
        )}
      </div>
      </div>
    </div>
  );
}
