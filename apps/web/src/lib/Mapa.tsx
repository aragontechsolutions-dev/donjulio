import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Mapa con OpenStreetMap. No necesita API key ni cuenta de Google: las teselas
 * son públicas y sólo hay que mantener la atribución visible.
 *
 * Se usa en dos modos:
 *  - Landing (`editable = false`): mapa de sólo lectura con el marcador fijo.
 *  - Panel  (`editable = true`):  marcador arrastrable + click para reubicar.
 */
export interface MapaProps {
  lat: number;
  lng: number;
  zoom?: number;
  editable?: boolean;
  /** Sólo en modo editable: se dispara al arrastrar el pin o clickear el mapa. */
  onMove?: (lat: number, lng: number) => void;
  /** Sólo en modo editable: se dispara al hacer zoom. */
  onZoom?: (zoom: number) => void;
  className?: string;
}

/**
 * Pin dibujado en HTML/CSS. Evita el clásico bug de las imágenes rotas de
 * Leaflet con bundlers y nos deja usar la paleta de la panadería.
 */
function pinIcon(editable: boolean) {
  return L.divIcon({
    className: "",
    html: `<div style="
        width:34px;height:34px;border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        background:#b45309;border:3px solid #fff;
        box-shadow:0 3px 10px rgba(0,0,0,.35);
        display:grid;place-items:center;
        cursor:${editable ? "grab" : "default"};
      "><span style="transform:rotate(45deg);font-size:15px;line-height:1">🥖</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

export default function Mapa({
  lat,
  lng,
  zoom = 16,
  editable = false,
  onMove,
  onZoom,
  className,
}: MapaProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  // Los callbacks viven en un ref para no re-suscribir los listeners de Leaflet
  // en cada render del padre.
  const cbs = useRef({ onMove, onZoom });
  cbs.current = { onMove, onZoom };

  // Montaje: una sola vez por instancia.
  useEffect(() => {
    if (!host.current || map.current) return;
    const m = L.map(host.current, {
      center: [lat, lng],
      zoom,
      // En la landing el mapa es ilustrativo: sin scroll-zoom para no secuestrar
      // el scroll de la página.
      scrollWheelZoom: editable,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(m);

    const mk = L.marker([lat, lng], {
      icon: pinIcon(editable),
      draggable: editable,
      keyboard: editable,
      title: editable ? "Arrastrá el pin para mover el local" : "Don Julio",
    }).addTo(m);

    if (editable) {
      mk.on("dragend", () => {
        const p = mk.getLatLng();
        cbs.current.onMove?.(p.lat, p.lng);
      });
      m.on("click", (e: L.LeafletMouseEvent) => {
        mk.setLatLng(e.latlng);
        cbs.current.onMove?.(e.latlng.lat, e.latlng.lng);
      });
      m.on("zoomend", () => cbs.current.onZoom?.(m.getZoom()));
    }

    map.current = m;
    marker.current = mk;
    // Si el contenedor nace oculto o dentro de un layout que aún no midió,
    // Leaflet dibuja las teselas mal hasta que se le avisa del tamaño real.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(host.current);

    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza cambios que vengan de afuera (ej.: buscador de direcciones).
  useEffect(() => {
    if (!map.current || !marker.current) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const actual = marker.current.getLatLng();
    if (Math.abs(actual.lat - lat) > 1e-9 || Math.abs(actual.lng - lng) > 1e-9) {
      marker.current.setLatLng([lat, lng]);
      map.current.setView([lat, lng], map.current.getZoom());
    }
  }, [lat, lng]);

  useEffect(() => {
    if (map.current && map.current.getZoom() !== zoom) map.current.setZoom(zoom);
  }, [zoom]);

  return <div ref={host} className={className} />;
}
