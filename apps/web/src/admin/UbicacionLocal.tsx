import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { showToast } from "../lib/toast";
import Mapa from "../lib/MapaLazy";
import type { Contacto } from "../landing/types";

/** Plaza principal de Maldonado: punto de partida si todavía no hay ubicación. */
const CENTRO_MALDONADO = { lat: -34.9089, lng: -54.9581 };

interface Sugerencia {
  display_name: string;
  lat: string;
  lon: string;
}

const CAMPOS = [
  { k: "direccion", label: "Dirección", ph: "Av. Roosevelt 1234, Maldonado" },
  { k: "telefono", label: "Teléfono", ph: "4222 1234" },
  { k: "whatsapp", label: "WhatsApp", ph: "+598 99 123 456" },
  { k: "email", label: "Email", ph: "hola@donjulio.uy" },
  { k: "instagram", label: "Instagram", ph: "@donjulio.uy" },
  { k: "facebook", label: "Facebook", ph: "facebook.com/donjulio" },
] as const;

type CampoTexto = (typeof CAMPOS)[number]["k"];

/**
 * Editor de la ubicación que ve el público en la sección "Cómo llegar".
 * Sólo se monta dentro del panel de admin (`/admin/cms`, rol ADMIN) y la API
 * vuelve a exigir el rol en `PUT /cms/contacto`.
 */
export default function UbicacionLocal() {
  const [form, setForm] = useState<Partial<Contacto>>({});
  const [lat, setLat] = useState(CENTRO_MALDONADO.lat);
  const [lng, setLng] = useState(CENTRO_MALDONADO.lng);
  const [zoom, setZoom] = useState(16);
  const [ubicado, setUbicado] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api
      .get<{ contacto: Contacto | null }>("/cms/landing")
      .then(({ contacto }) => {
        if (!contacto) return;
        setForm(contacto);
        if (contacto.lat != null && contacto.lng != null) {
          setLat(contacto.lat);
          setLng(contacto.lng);
          setUbicado(true);
        }
        if (contacto.mapZoom) setZoom(contacto.mapZoom);
      })
      .catch(() => {});
  }, []);

  const mover = (nuevaLat: number, nuevaLng: number) => {
    // Escribiendo a mano en los inputs pasan valores intermedios ("-", "").
    if (!Number.isFinite(nuevaLat) || !Number.isFinite(nuevaLng)) return;
    setLat(nuevaLat);
    setLng(nuevaLng);
    setUbicado(true);
  };

  /** Geocodifica con Nominatim (OpenStreetMap): gratis y sin API key. */
  const buscarDireccion = async () => {
    const q = busqueda.trim();
    if (q.length < 3) {
      showToast("error", "Escribí al menos 3 caracteres para buscar.");
      return;
    }
    setBuscando(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=uy&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Sugerencia[];
      setSugerencias(data);
      if (data.length === 0) {
        showToast("error", "No encontramos esa dirección. Probá con otra o movés el pin a mano.");
      }
    } catch {
      showToast("error", "No se pudo buscar la dirección. Movés el pin a mano.");
    } finally {
      setBuscando(false);
    }
  };

  const usarSugerencia = (s: Sugerencia) => {
    mover(Number(s.lat), Number(s.lon));
    setZoom(17);
    setSugerencias([]);
    setBusqueda("");
    if (!form.direccion) setForm((f) => ({ ...f, direccion: s.display_name }));
  };

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) {
      showToast("error", "Tu navegador no permite compartir la ubicación.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mover(pos.coords.latitude, pos.coords.longitude);
        setZoom(18);
        showToast("success", "Pin colocado en tu ubicación actual.");
      },
      () => showToast("error", "No pudimos leer tu ubicación. Revisá los permisos del navegador."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const guardar = async () => {
    if (!ubicado) {
      showToast("error", "Marcá primero la ubicación del local en el mapa.");
      return;
    }
    setGuardando(true);
    try {
      await api.put("/cms/contacto", {
        ...Object.fromEntries(
          CAMPOS.map(({ k }) => [k, (form[k] ?? "").toString().trim() || null]),
        ),
        mapsUrl: (form.mapsUrl ?? "").trim() || null,
        lat,
        lng,
        mapZoom: zoom,
      });
    } catch {
      /* el toast lo emite api */
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mt-8 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
      <h2 className="font-display text-lg font-semibold text-crust-800">
        Ubicación y contacto del local
      </h2>
      <p className="mb-5 text-sm text-crust-500">
        Es lo que ven los clientes en la sección <b>Cómo llegar</b> de la web. Buscá la
        dirección, o arrastrá el pin hasta la puerta del local para dejarlo exacto.
      </p>

      {/* Buscador de dirección */}
      <div className="flex flex-wrap gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              buscarDireccion();
            }
          }}
          placeholder="Buscar dirección… ej: Sarandí 700, Maldonado"
          className="min-w-[240px] flex-1 rounded-lg border border-crust-200 px-3 py-2 text-sm"
        />
        <button
          onClick={buscarDireccion}
          disabled={buscando}
          className="rounded-lg bg-dj-terracota px-4 py-2 text-sm font-semibold text-white hover:bg-dj-cobre disabled:opacity-50"
        >
          {buscando ? "Buscando…" : "Buscar"}
        </button>
        <button
          onClick={usarMiUbicacion}
          className="rounded-lg border border-crust-200 px-4 py-2 text-sm font-semibold text-crust-700 hover:bg-crust-100"
          title="Colocar el pin donde estás ahora"
        >
          📍 Estoy en el local
        </button>
      </div>

      {sugerencias.length > 0 && (
        <ul className="mt-2 divide-y divide-crust-100 overflow-hidden rounded-lg border border-crust-200">
          {sugerencias.map((s) => (
            <li key={`${s.lat},${s.lon}`}>
              <button
                onClick={() => usarSugerencia(s)}
                className="block w-full px-3 py-2 text-left text-sm text-crust-700 hover:bg-crust-50"
              >
                {s.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Mapa editable */}
      <div className="mt-4 overflow-hidden rounded-xl border border-crust-200">
        <Mapa
          lat={lat}
          lng={lng}
          zoom={zoom}
          editable
          onMove={mover}
          onZoom={setZoom}
          className="h-[360px] w-full"
        />
      </div>
      <p className="mt-2 text-xs text-crust-400">
        Arrastrá el pin o hacé click en el mapa para moverlo. El zoom con el que lo dejes
        es el que verán los clientes.
      </p>

      {/* Coordenadas exactas */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-crust-700">Latitud</span>
          <input
            type="number"
            step="0.000001"
            value={lat}
            onChange={(e) => mover(Number(e.target.value), lng)}
            className="w-full rounded-lg border border-crust-200 px-3 py-2 text-sm tabular-nums"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-crust-700">Longitud</span>
          <input
            type="number"
            step="0.000001"
            value={lng}
            onChange={(e) => mover(lat, Number(e.target.value))}
            className="w-full rounded-lg border border-crust-200 px-3 py-2 text-sm tabular-nums"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-crust-700">Zoom ({zoom})</span>
          <input
            type="range"
            min={10}
            max={19}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="mt-3 w-full"
          />
        </label>
      </div>

      {/* Datos de contacto */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {CAMPOS.map(({ k, label, ph }) => (
          <label key={k} className="text-sm">
            <span className="mb-1 block font-medium text-crust-700">{label}</span>
            <input
              value={(form[k as CampoTexto] as string) ?? ""}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              placeholder={ph}
              className="w-full rounded-lg border border-crust-200 px-3 py-2 text-sm"
            />
          </label>
        ))}
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-crust-700">
            Link propio de Google Maps <span className="font-normal text-crust-400">(opcional)</span>
          </span>
          <input
            value={form.mapsUrl ?? ""}
            onChange={(e) => setForm({ ...form, mapsUrl: e.target.value })}
            placeholder="https://maps.app.goo.gl/…"
            className="w-full rounded-lg border border-crust-200 px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-crust-400">
            Si pegás acá el link de tu ficha de Google, el botón “Abrir indicaciones” de la web
            lleva a esa ficha. Si lo dejás vacío, se generan indicaciones hasta el pin.
          </span>
        </label>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-lg bg-dj-terracota px-5 py-2 text-sm font-semibold text-white hover:bg-dj-cobre disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar ubicación y contacto"}
        </button>
        {!ubicado && (
          <span className="text-xs text-amber-600">
            Todavía no marcaste la ubicación: el mapa parte del centro de Maldonado.
          </span>
        )}
      </div>
    </div>
  );
}
