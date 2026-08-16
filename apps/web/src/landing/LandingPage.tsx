import { useEffect, useState } from "react";
import { api } from "../lib/api";
import Navbar from "./Navbar";
import {
  Contacto,
  Footer,
  Galeria,
  Hero,
  Nosotros,
  Productos,
  Promociones,
  Testimonios,
  Ubicacion,
} from "./Sections";
import type { LandingData, MenuCategoria, Promocion } from "./types";

const EMPTY: LandingData = {
  contenido: {},
  galeria: [],
  testimonios: [],
  horarios: [],
  contacto: null,
};

export default function LandingPage() {
  const [data, setData] = useState<LandingData>(EMPTY);
  const [menu, setMenu] = useState<MenuCategoria[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [promos, setPromos] = useState<Promocion[]>([]);

  useEffect(() => {
    // Fallan en silencio: la landing se muestra igual aunque la API no esté.
    api.get<LandingData>("/cms/landing").then(setData).catch(() => {});
    api
      .get<MenuCategoria[]>("/menu")
      .then(setMenu)
      .catch(() => {})
      .finally(() => setMenuLoading(false));
    api.get<Promocion[]>("/promociones").then(setPromos).catch(() => {});
  }, []);

  return (
    <div>
      <Navbar />
      <main>
        <Hero contenido={data.contenido} />
        <Nosotros contenido={data.contenido} />
        <Productos categorias={menu} loading={menuLoading} />
        <Promociones promos={promos} />
        <Galeria contenido={data.contenido} fotos={data.galeria} />
        <Testimonios items={data.testimonios} />
        <Ubicacion contacto={data.contacto} />
        <Contacto contacto={data.contacto} horarios={data.horarios} />
      </main>
      <Footer />
    </div>
  );
}
