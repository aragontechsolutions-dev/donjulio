/**
 * Logo de Don Julio en SVG, según el manual de marca.
 *
 * Tres piezas, las mismas del manual:
 *  - `Monograma`     → la "DJ" con el rombo terracota.
 *  - `LogoPrincipal` → monograma + DON JULIO + bajada + ciudad.
 *  - `Sello`         → versión circular (cartel de fachada, packaging).
 *
 * Va en SVG y no en imagen para que se vea nítido en cualquier pantalla y
 * herede el color del contexto (claro sobre carbón, oscuro sobre crema).
 *
 * COPIA de `apps/web/src/lib/Logo.tsx`: son dos apps independientes y el
 * paquete compartido no compila TSX. Si cambia el logo, hay que tocar las dos.
 */

const SERIF = '"Playfair Display", Georgia, serif';
const SANS = '"Inter", system-ui, sans-serif';

interface ColorProps {
  /** Color de las letras. Por defecto, el `currentColor` del contenedor. */
  tinta?: string;
  /** Color del rombo y los detalles. */
  acento?: string;
  className?: string;
}

/** Rombo terracota: el detalle que separa y marca la identidad. */
function Rombo({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} fill={fill} transform={`rotate(45 ${x} ${y})`} />;
}

export function Monograma({
  tinta = "currentColor",
  acento = "#C0561D",
  className,
}: ColorProps) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Don Julio">
      {/* El interletrado negativo entrelaza la D y la J, como en el manual. */}
      <text
        x="50"
        y="75"
        textAnchor="middle"
        fontFamily={SERIF}
        fontWeight="700"
        fontSize="82"
        letterSpacing="-16"
        fill={tinta}
      >
        DJ
      </text>
      <Rombo x={54} y={35} r={7} fill={acento} />
    </svg>
  );
}

/** Lockup vertical completo: el que abre la página. */
export function LogoPrincipal({
  tinta = "currentColor",
  acento = "#C0561D",
  className,
  conAnio = true,
}: ColorProps & { conAnio?: boolean }) {
  return (
    <svg viewBox="0 0 420 230" className={className} role="img" aria-label="Don Julio · Panadería y Pastelería · Maldonado, Uruguay">
      <g transform="translate(210 0)">
        <g transform="translate(-42 0) scale(0.84)">
          <text x="50" y="75" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="82" letterSpacing="-16" fill={tinta}>
            DJ
          </text>
          <Rombo x={54} y={35} r={7} fill={acento} />
        </g>
      </g>

      {conAnio && (
        <>
          <text x="96" y="52" textAnchor="middle" fontFamily={SANS} fontSize="13" letterSpacing="4" fill={acento}>
            DESDE
          </text>
          <text x="324" y="52" textAnchor="middle" fontFamily={SANS} fontSize="13" letterSpacing="4" fill={acento}>
            1987
          </text>
        </>
      )}

      <text x="210" y="140" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="58" letterSpacing="1" fill={tinta}>
        DON JULIO
      </text>
      <text x="210" y="172" textAnchor="middle" fontFamily={SANS} fontSize="16" fontWeight="500" letterSpacing="5.5" fill={acento}>
        PANADERÍA &amp; PASTELERÍA
      </text>
      <text x="210" y="203" textAnchor="middle" fontFamily={SANS} fontSize="12" letterSpacing="4.5" fill={tinta} opacity="0.7">
        MALDONADO, URUGUAY
      </text>
    </svg>
  );
}

/** Lockup horizontal compacto: navbar y pie. */
export function LogoHorizontal({
  tinta = "currentColor",
  acento = "#C0561D",
  className,
}: ColorProps) {
  return (
    <svg viewBox="0 0 300 72" className={className} role="img" aria-label="Don Julio · Panadería y Pastelería">
      <g transform="translate(0 -4) scale(0.62)">
        <text x="50" y="75" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="82" letterSpacing="-16" fill={tinta}>
          DJ
        </text>
        <Rombo x={54} y={35} r={7} fill={acento} />
      </g>
      <text x="76" y="36" fontFamily={SERIF} fontWeight="700" fontSize="30" letterSpacing="0.5" fill={tinta}>
        DON JULIO
      </text>
      <text x="78" y="55" fontFamily={SANS} fontSize="9.5" fontWeight="500" letterSpacing="3.4" fill={acento}>
        PANADERÍA &amp; PASTELERÍA
      </text>
    </svg>
  );
}

/** Sello circular: cartel de fachada, stickers y packaging. */
export function Sello({
  tinta = "currentColor",
  acento = "#C0561D",
  className,
}: ColorProps) {
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="Don Julio · Panadería y Pastelería">
      <defs>
        {/* Ambos arcos van de izquierda a derecha. El de abajo con barrido
            inverso, que es lo que deja las letras legibles en la base. */}
        <path id="dj-arco-sup" d="M 100 100 m -66 0 a 66 66 0 1 1 132 0" fill="none" />
        <path id="dj-arco-inf" d="M 100 100 m -66 0 a 66 66 0 1 0 132 0" fill="none" />
      </defs>

      <circle cx="100" cy="100" r="95" fill="none" stroke={tinta} strokeWidth="1" opacity="0.5" />
      <circle cx="100" cy="100" r="88" fill="none" stroke={tinta} strokeWidth="2.5" />

      <text fontFamily={SERIF} fontWeight="700" fontSize="19" letterSpacing="3" fill={tinta}>
        <textPath href="#dj-arco-sup" startOffset="50%" textAnchor="middle">
          DON JULIO
        </textPath>
      </text>
      <text fontFamily={SANS} fontSize="9" fontWeight="500" letterSpacing="2.6" fill={tinta} opacity="0.85">
        <textPath href="#dj-arco-inf" startOffset="50%" textAnchor="middle">
          PANADERÍA &amp; PASTELERÍA
        </textPath>
      </text>

      <Rombo x={24} y={100} r={4} fill={acento} />
      <Rombo x={176} y={100} r={4} fill={acento} />

      <g transform="translate(100 100) scale(0.52) translate(-50 -50)">
        <text x="50" y="75" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize="82" letterSpacing="-16" fill={tinta}>
          DJ
        </text>
        <Rombo x={54} y={35} r={7} fill={acento} />
      </g>
    </svg>
  );
}
