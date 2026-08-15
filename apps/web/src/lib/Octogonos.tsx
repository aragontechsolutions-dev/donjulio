import { OCTOGONO_LABEL, type Octogonos as OctogonosFlags } from "@donjulio/shared";

/** Sello octogonal negro de advertencia (Decreto 272/018). */
function Sello({ texto, size }: { texto: string; size: number }) {
  const palabras = texto.split(" ");
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={texto}>
      {/* Octógono regular */}
      <polygon
        points="30,2 70,2 98,30 98,70 70,98 30,98 2,70 2,30"
        fill="#000"
        stroke="#fff"
        strokeWidth="4"
      />
      <text
        x="50"
        y={50 - (palabras.length - 1) * 9}
        textAnchor="middle"
        fill="#fff"
        fontSize={palabras.length > 2 ? 15 : 17}
        fontWeight="bold"
        fontFamily="Arial, Helvetica, sans-serif"
      >
        {palabras.map((p, i) => (
          <tspan key={i} x="50" dy={i === 0 ? 0 : 18}>
            {p}
          </tspan>
        ))}
      </text>
    </svg>
  );
}

interface Props {
  flags: Partial<OctogonosFlags>;
  size?: number;
  className?: string;
}

/** Fila de sellos frontales activos. No renderiza nada si no hay ninguno. */
export default function Octogonos({ flags, size = 44, className = "" }: Props) {
  const activos = (Object.keys(OCTOGONO_LABEL) as (keyof OctogonosFlags)[]).filter((k) => flags[k]);
  if (activos.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {activos.map((k) => (
        <Sello key={k} texto={OCTOGONO_LABEL[k]} size={size} />
      ))}
    </div>
  );
}
