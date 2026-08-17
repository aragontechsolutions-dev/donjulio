/**
 * Verifica que la tabla CAPACIDADES de @donjulio/shared diga lo mismo que los
 * @Roles reales de los controladores de la API.
 *
 * El panel decide qué botones mostrar mirando esa tabla. Si alguien cambia un
 * @Roles y no la actualiza, la pantalla vuelve a ofrecer acciones que terminan
 * en un 403 sin explicación. Esto lo detecta antes.
 *
 * Uso: node scripts/check-permisos.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── 1. Rutas y roles declarados en los controladores ──
const archivos = [];
(function recorrer(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) recorrer(p);
    else if (n.endsWith(".ts")) archivos.push(p);
  }
})(join(raiz, "apps/api/src"));

/** @type {{verbo:string, ruta:string, roles:string[]|null}[]} */
const rutas = [];
const RE_CONTROLLER =
  /((?:@[\w.]+\([^\n]*\)\s*\n\s*)*)@Controller\(\s*(?:"([^"]*)")?\s*\)\s*\n\s*(?:export\s+)?class\s+\w+/g;
const RE_METODO =
  /((?:@[\w.]+\([^\n]*\)\s*\n\s*)*)@(Get|Post|Patch|Put|Delete)\(\s*(?:"([^"]*)")?\s*\)/g;
const rolesDe = (deco) => {
  const m = /@Roles\(([^)]*)\)/.exec(deco);
  return m ? m[1].replace(/UserRole\./g, "").replace(/\s/g, "").split(",").filter(Boolean) : null;
};

for (const archivo of archivos) {
  const src = readFileSync(archivo, "utf8");
  for (const m of src.matchAll(RE_CONTROLLER)) {
    const base = m[2] ?? "";
    const rolesClase = rolesDe(m[1]);
    // Recorta el cuerpo de la clase balanceando llaves.
    let i = src.indexOf("{", m.index + m[0].length);
    const inicio = i;
    for (let prof = 0; i < src.length; i++) {
      if (src[i] === "{") prof++;
      else if (src[i] === "}" && --prof === 0) break;
    }
    for (const mm of src.slice(inicio, i).matchAll(RE_METODO)) {
      const ruta = "/" + [base, mm[3] ?? ""].filter(Boolean).join("/");
      rutas.push({ verbo: mm[2].toUpperCase(), ruta, roles: rolesDe(mm[1]) ?? rolesClase });
    }
  }
}

// ── 2. Comparación con la tabla ──
// El build CJS, no el ESM: ese emite imports sin extensión, que sirven para un
// bundler pero Node no los resuelve.
let CAPACIDADES;
try {
  ({ CAPACIDADES } = createRequire(import.meta.url)(
    join(raiz, "packages/shared/dist/cjs/index.js"),
  ));
} catch (e) {
  console.error("Compilá shared primero: pnpm --filter @donjulio/shared build");
  console.error(e.message);
  process.exit(2);
}

const norm = (r) => r.replace(/:[A-Za-z_]\w*/g, ":p").replace(/\/+$/, "");
const problemas = [];

for (const [accion, cap] of Object.entries(CAPACIDADES)) {
  const encontrada = rutas.filter(
    (r) => r.verbo === cap.verbo && norm(r.ruta) === norm(cap.ruta),
  );
  if (encontrada.length === 0) {
    problemas.push(`${accion}: no existe ${cap.verbo} ${cap.ruta} en la API`);
    continue;
  }
  const real = encontrada[0].roles;
  if (real === null) {
    problemas.push(
      `${accion}: ${cap.verbo} ${cap.ruta} no tiene @Roles (la abre cualquier usuario), ` +
        `pero la tabla dice ${cap.roles.join(",")}`,
    );
    continue;
  }
  const esperado = [...cap.roles].sort().join(",");
  const declarado = [...real].sort().join(",");
  if (esperado !== declarado) {
    problemas.push(
      `${accion}: la API dice [${declarado}] y la tabla dice [${esperado}] · ${cap.verbo} ${cap.ruta}`,
    );
  }
}

if (problemas.length > 0) {
  console.error("Permisos desincronizados entre la API y el panel:\n");
  for (const p of problemas) console.error("  · " + p);
  console.error(
    `\n${problemas.length} problema(s). Actualizá packages/shared/src/permisos.ts ` +
      "o el @Roles del controlador, según cuál sea el correcto.",
  );
  process.exit(1);
}

console.log(
  `Permisos OK: ${Object.keys(CAPACIDADES).length} acciones coinciden con los @Roles de la API.`,
);
