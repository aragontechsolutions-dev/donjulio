/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Paleta cálida "panadería artesanal".
        crust: {
          50: "#faf6f0",
          100: "#f2e8d9",
          200: "#e6d0b2",
          300: "#d6b183",
          400: "#c68e56",
          500: "#b5763c",
          600: "#9c5f30",
          700: "#7d4929",
          800: "#653c26",
          900: "#553322",
        },
        masa: "#fdfbf7",
        // ── Identidad visual Don Julio (manual de marca) ──
        // Se usa en la web pública. El panel sigue con `crust`.
        dj: {
          papel: "#F5F0E6", // fondo crema del manual
          crema: "#EDE3D0",
          arena: "#E3D5B8", // swatch 1
          dorado: "#C9A56B", // swatch 4
          terracota: "#C0561D", // swatch 3
          cobre: "#9E4415", // terracota oscuro (hover / activos)
          humo: "#6C6760", // texto secundario sobre crema
          grafito: "#3A3733",
          carbon: "#22211F", // swatch 2
          tinta: "#161513", // pie de página / sombras
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', "Georgia", "serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
      },
      letterSpacing: {
        marca: "0.28em", // "PANADERÍA & PASTELERÍA" del logo
      },
    },
  },
  plugins: [],
};
