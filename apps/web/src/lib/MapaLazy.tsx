import { Suspense, lazy } from "react";
import type { MapaProps } from "./Mapa";

// Leaflet pesa ~40 kB gzip: se carga sólo cuando hay un mapa en pantalla, no
// en el bundle inicial de la landing ni del panel.
const Mapa = lazy(() => import("./Mapa"));

export default function MapaLazy(props: MapaProps) {
  return (
    <Suspense
      fallback={
        <div className={`animate-pulse bg-crust-100 ${props.className ?? ""}`} />
      }
    >
      <Mapa {...props} />
    </Suspense>
  );
}
