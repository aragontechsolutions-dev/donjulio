/**
 * Identidad visual Don Julio, compartida por la web y la PWA del mozo.
 *
 * Un solo archivo para las dos apps: si la marca cambia, se toca acá y no en
 * dos configs que se desincronizan.
 *
 * - `dj`    → los colores del manual de marca, con nombre propio.
 * - `crust` → la rampa neutra cálida derivada de la marca (crema → carbón).
 *   Se conserva el nombre porque el panel entero la usa; los tonos ya no son
 *   marrones sino los neutros del manual. Los colores de acción (botones,
 *   estados activos) van con `dj-terracota`, no con `crust`.
 */

export const colors = {
  // Rampa neutra: fondos, bordes y texto.
  crust: {
    50: "#FAF7F1",
    100: "#EFE8DA",
    200: "#E3D5B8", // arena del manual
    300: "#CBBB9C",
    400: "#A2957F",
    500: "#7D7264",
    600: "#5A5147",
    700: "#3A3733", // grafito
    800: "#2B2A27",
    900: "#22211F", // carbón
  },
  masa: "#FAF7F1",

  // Colores con nombre del manual de marca.
  dj: {
    papel: "#F5F0E6",
    crema: "#EDE3D0",
    arena: "#E3D5B8",
    dorado: "#C9A56B",
    terracota: "#C0561D",
    cobre: "#9E4415",
    humo: "#6C6760",
    grafito: "#3A3733",
    carbon: "#22211F",
    tinta: "#161513",
  },
};

export const fontFamily = {
  display: ['"Playfair Display"', "Georgia", "serif"],
  body: ['"Inter"', "system-ui", "sans-serif"],
};

export const letterSpacing = {
  marca: "0.28em", // el interletrado de "PANADERÍA & PASTELERÍA"
};
