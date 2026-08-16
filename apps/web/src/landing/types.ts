export interface RotuladoPublic {
  excesoAzucares: boolean;
  excesoSodio: boolean;
  excesoGrasas: boolean;
  excesoGrasasSat: boolean;
  alergenos: string | null;
}

export interface MenuProducto {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: string;
  imagenUrl: string | null;
  destacado: boolean;
  rotulado?: RotuladoPublic | null;
}

export interface MenuCategoria {
  id: string;
  nombre: string;
  slug: string;
  productos: MenuProducto[];
}

export interface Testimonio {
  id: string;
  autor: string;
  texto: string;
  rating: number;
}

export interface Horario {
  diaSemana: number;
  apertura: string;
  cierre: string;
  cerrado: boolean;
}

export interface Contacto {
  direccion: string | null;
  telefono: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram: string | null;
  facebook: string | null;
  mapsUrl: string | null;
  lat: number | null;
  lng: number | null;
  mapZoom: number | null;
}

export interface GaleriaItem {
  id: string;
  imagenUrl: string;
  titulo: string | null;
}

export interface LandingData {
  contenido: Record<string, string>;
  galeria: GaleriaItem[];
  testimonios: Testimonio[];
  horarios: Horario[];
  contacto: Contacto | null;
}

export interface Promocion {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipoDescuento: string;
  valor: string;
}
