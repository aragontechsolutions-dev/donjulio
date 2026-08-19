#!/usr/bin/env node
/**
 * Casos de plural de la carta.
 *
 * El plural castellano tiene demasiadas excepciones como para confiar en que
 * un retoque de las reglas no rompa otro nombre: acá quedan los casos reales
 * (y los que ya se rompieron una vez) para poder tocarlas tranquilo.
 *
 *   pnpm check:plural
 *
 * Se carga el build CJS porque el ESM emite imports sin extensión que Node no
 * resuelve solo (mismo motivo que en check-permisos.mjs).
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { lineaConCantidad, pluralizarNombre } = require("../packages/shared/dist/cjs/index.js");

const CASOS = [
  // núcleo + complemento: sólo se pluraliza el núcleo
  ["Medialuna de manteca", "Medialunas de manteca"],
  ["Pan de campo", "Panes de campo"],
  ["Café con leche", "Cafés con leche"],
  ["Alfajor de maicena", "Alfajores de maicena"],
  ["Porción de tarta", "Porciones de tarta"],
  ["Maní con chocolate", "Maníes con chocolate"],
  // núcleo + adjetivo: concuerdan los dos
  ["Pan casero", "Panes caseros"],
  ["Budín inglés", "Budines ingleses"],
  ["Nuez confitada", "Nueces confitadas"],
  ["Chivito canadiense", "Chivitos canadienses"],
  ["Agua mineral 500ml", "Aguas minerales 500ml"],
  // adjetivo con mayúscula inicial (así se escribe la carta)
  ["Café Cortado", "Cafés Cortados"],
  ["Empanada Criolla", "Empanadas Criollas"],
  ["Sandwich Caliente", "Sandwiches Calientes"],
  // nombre propio: no se toca
  ["Torta Chajá", "Tortas Chajá"],
  // ya viene en plural
  ["Medialunas (docena)", "Medialunas (docena)"],
  ["Papas fritas", "Papas fritas"],
  ["Churros con dulce de leche", "Churros con dulce de leche"],
  // números y unidades no son adjetivos
  ["Refresco 600 ml", "Refrescos 600 ml"],
  // extranjerismos: -s, no -es
  ["Muffin de arándanos", "Muffins de arándanos"],
  ["Croissant", "Croissants"],
  ["Bagel", "Bagels"],
  // finales que no son "+s"
  ["Flan casero", "Flanes caseros"],
  ["Té", "Tés"],
];

let fallas = 0;
for (const [nombre, esperado] of CASOS) {
  const obtenido = pluralizarNombre(nombre);
  if (obtenido !== esperado) {
    fallas++;
    console.error(`✗ "${nombre}" → "${obtenido}" (se esperaba "${esperado}")`);
  }
}

// Una sola unidad va en singular y sin el "1 ×".
if (lineaConCantidad(1, "Medialuna de manteca") !== "Medialuna de manteca") {
  fallas++;
  console.error("✗ con cantidad 1 no debería mostrarse el multiplicador");
}
if (lineaConCantidad(2, "Medialuna de manteca") !== "2 × Medialunas de manteca") {
  fallas++;
  console.error("✗ con cantidad 2 debería mostrarse «2 × Medialunas de manteca»");
}

if (fallas > 0) {
  console.error(`\n${fallas} caso(s) de plural fallando.`);
  process.exit(1);
}
console.log(`Plurales OK: ${CASOS.length + 2} casos.`);
