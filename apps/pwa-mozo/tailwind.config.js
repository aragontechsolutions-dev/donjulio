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
      },
      fontFamily: {
        display: ['"Playfair Display"', "Georgia", "serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
