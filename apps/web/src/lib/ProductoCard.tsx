import { formatUYU } from "./format";

interface ProductoCardProps {
  nombre: string;
  precio: string | number;
  descripcion?: string | null;
  imagenUrl?: string | null;
  destacado?: boolean;
  onClick?: () => void;
}

/** Card de producto con imagen arriba, usada donde se listan productos para pedir. */
export default function ProductoCard({ nombre, precio, descripcion, imagenUrl, destacado, onClick }: ProductoCardProps) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-2xl border border-crust-100 bg-white text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-crust-100">
        {imagenUrl ? (
          <img src={imagenUrl} alt={nombre} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="grid h-full w-full place-items-center text-4xl text-crust-300 transition-transform duration-500 group-hover:scale-110">🥐</div>
        )}
        {destacado && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-crust-700 shadow-sm backdrop-blur">★ Destacado</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <span className="text-sm font-semibold leading-tight text-crust-900">{nombre}</span>
        {descripcion && <p className="mt-0.5 line-clamp-2 text-xs text-crust-500">{descripcion}</p>}
        <span className="mt-auto pt-1.5 text-sm font-bold text-crust-700">{formatUYU(precio)}</span>
      </div>
    </button>
  );
}
