#!/usr/bin/env node
/**
 * Endpoints de la API que ninguna pantalla usa.
 *
 *   pnpm check:endpoints
 *
 * Nació de encontrar tres veces seguidas una capacidad que existía en la API
 * y no tenía puerta en el panel: las entradas de stock de productos, editar
 * insumos y elegirle el proveedor a un insumo. Las tres aparecieron cuando
 * alguien las necesitó, no antes.
 *
 * No todo lo que lista está mal: un webhook lo llama el proveedor de pagos,
 * no el navegador. Lo que hay que mirar es si lo que aparece es eso, o una
 * pantalla que falta.
 *
 * El emparejamiento es por texto, así que puede fallar en los dos sentidos:
 * sirve para mirar la lista, no para fallar un build.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const raiz = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const archivos = (dir, ext) => {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === "node_modules" || e === "dist") continue;
    if (statSync(p).isDirectory()) out.push(...archivos(p, ext));
    else if (ext.some((x) => e.endsWith(x))) out.push(p);
  }
  return out;
};

// 1. Rutas declaradas en la API.
const rutas = [];
for (const f of archivos(join(raiz, "apps/api/src"), [".ts"])) {
  const src = readFileSync(f, "utf8");
  // @Controller("x") ... @Get("y")
  const ctrlRe = /@Controller\(\s*["'`]([^"'`]*)["'`]\s*\)[\s\S]*?(?=\n@Controller|\n@Module|$)/g;
  let m;
  while ((m = ctrlRe.exec(src))) {
    const base = m[1];
    const cuerpo = m[0];
    const mRe = /@(Get|Post|Patch|Put|Delete)\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g;
    let mm;
    while ((mm = mRe.exec(cuerpo))) {
      const sub = mm[2] ?? "";
      const full = "/" + [base, sub].filter(Boolean).join("/");
      rutas.push({ metodo: mm[1].toUpperCase(), ruta: full, archivo: f.replace(raiz + "/", "") });
    }
  }
}

// 2. Todo lo que los frontends le piden a la API.
let frontend = "";
for (const app of ["apps/web/src", "apps/pwa-mozo/src"]) {
  for (const f of archivos(join(raiz, app), [".ts", ".tsx"])) frontend += readFileSync(f, "utf8");
}

/** ¿Alguna llamada del panel coincide con esta ruta? */
const usada = (ruta) => {
  // /admin/caja/:id/movimientos → busca "/admin/caja/" y "movimientos"
  const partes = ruta.split("/").filter(Boolean);
  const fijas = partes.filter((p) => !p.startsWith(":"));
  if (fijas.length === 0) return true;
  // Primero el camino literal completo.
  if (frontend.includes(ruta)) return true;
  // Si tiene parámetros, basta con que aparezcan todos los tramos fijos
  // en una misma llamada (plantilla con ${}).
  const re = new RegExp(fijas.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^\"'`\\n]*"));
  return re.test(frontend);
};

const sinUsar = rutas.filter((r) => !usada(r.ruta));
const porArchivo = {};
for (const r of sinUsar) (porArchivo[r.archivo] ??= []).push(`${r.metodo} ${r.ruta}`);

console.log(`Rutas en la API: ${rutas.length}`);
console.log(`Sin ninguna llamada desde el panel ni la PWA: ${sinUsar.length}\n`);
for (const [f, rs] of Object.entries(porArchivo).sort()) {
  console.log(f);
  for (const r of rs) console.log("   " + r);
}
