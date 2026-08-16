import { colors, fontFamily, letterSpacing } from "../../tailwind.marca.js";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: { colors, fontFamily, letterSpacing },
  },
  plugins: [],
};
