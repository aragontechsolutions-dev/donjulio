/**
 * Vacía la base para arrancar con datos reales de producción.
 *
 * Borra TODO —mesas, zonas, productos, recetas, insumos, pedidos, caja,
 * turnos, encargos, reservas, contenido de la web…— y deja un único usuario.
 *
 * Uso (desde la raíz del repo):
 *
 *   # 1. Ver qué se borraría, sin tocar nada:
 *   pnpm --filter @donjulio/api reset:produccion
 *
 *   # 2. Borrar de verdad:
 *   CONFIRMAR=BORRAR-TODO pnpm --filter @donjulio/api reset:produccion
 *
 * Variables:
 *   CONFIRMAR=BORRAR-TODO   Obligatoria para que borre. Sin esto, sólo simula.
 *   EMAIL_CONSERVAR=...     Usuario que sobrevive (por defecto henry@donjulio.uy).
 *   CONSERVAR_WEB=1         No borra la configuración del sitio: ubicación y
 *                           contacto, horarios, textos de la landing, galería
 *                           y política de cierre de sesión.
 *   LIMPIAR_SUPABASE=1      Borra también las cuentas de Supabase Auth que no
 *                           sean la conservada. Necesita SUPABASE_URL y
 *                           SUPABASE_SERVICE_ROLE_KEY.
 *
 * Es irreversible: hacé un backup antes (en Supabase, Database → Backups).
 */
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EMAIL = (process.env.EMAIL_CONSERVAR ?? "henry@donjulio.uy").toLowerCase();
const EJECUTAR = process.env.CONFIRMAR === "BORRAR-TODO";
const CONSERVAR_WEB = process.env.CONSERVAR_WEB === "1";
const LIMPIAR_SUPABASE = process.env.LIMPIAR_SUPABASE === "1";

/** Nunca se truncan: el usuario que se conserva y el historial de migraciones. */
const INTOCABLES = ["Usuario", "_prisma_migrations"];

/** Configuración del sitio, opcional de conservar con CONSERVAR_WEB=1. */
const TABLAS_WEB = [
  "ConfigContacto",
  "Horario",
  "ContenidoLanding",
  "Galeria",
  "Testimonio",
  "SesionConfig",
];

const q = (t: string) => `"${t.replace(/"/g, '""')}"`;

/** Todos los usuarios salvo el conservado (comparación sin distinguir mayúsculas). */
const OTROS_USUARIOS: Prisma.UsuarioWhereInput = {
  NOT: { email: { equals: EMAIL, mode: "insensitive" } },
};

async function main() {
  console.log(`\n${EJECUTAR ? "🔥 BORRADO REAL" : "🔎 SIMULACIÓN (no se borra nada)"}`);
  console.log(`   Usuario a conservar: ${EMAIL}`);
  if (CONSERVAR_WEB) console.log("   Se conserva la configuración del sitio.\n");
  else console.log("");

  // 1. El usuario a conservar tiene que existir, si no quedaría una base sin acceso.
  const conservado = await prisma.usuario.findFirst({
    where: { email: { equals: EMAIL, mode: "insensitive" } },
  });
  if (!conservado) {
    const todos = await prisma.usuario.findMany({
      select: { email: true, role: true },
      orderBy: { email: "asc" },
    });
    console.error(`✖ No existe ningún usuario con email ${EMAIL}.`);
    console.error("  Crealo primero (Panel → Usuarios) o pasá EMAIL_CONSERVAR con uno de estos:");
    todos.forEach((u) => console.error(`    · ${u.email} (${u.role})`));
    process.exitCode = 1;
    return;
  }
  if (conservado.role !== "ADMIN") {
    console.warn(
      `⚠  ${conservado.email} tiene rol ${conservado.role}, no ADMIN: al terminar no vas a` +
        " poder entrar a todos los módulos. Cambiale el rol antes de seguir.\n",
    );
  }

  // 2. Tablas a vaciar: todas las del esquema public menos las intocables.
  const filas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  const excluidas = new Set([...INTOCABLES, ...(CONSERVAR_WEB ? TABLAS_WEB : [])]);
  const tablas = filas.map((f) => f.tablename).filter((t) => !excluidas.has(t));

  if (tablas.length === 0) {
    console.error("✖ No se encontró ninguna tabla. ¿Apunta DATABASE_URL a la base correcta?");
    process.exitCode = 1;
    return;
  }

  // 3. Conteo real por tabla, para que se vea qué se está por borrar.
  const union = tablas
    .map((t) => `SELECT '${t.replace(/'/g, "''")}' AS tabla, count(*)::int AS filas FROM ${q(t)}`)
    .join(" UNION ALL ");
  const conteos = await prisma.$queryRawUnsafe<{ tabla: string; filas: number }[]>(
    `${union} ORDER BY filas DESC, tabla ASC`,
  );
  const conDatos = conteos.filter((c) => c.filas > 0);
  const total = conteos.reduce((a, c) => a + c.filas, 0);

  const otrosUsuarios = await prisma.usuario.count({ where: OTROS_USUARIOS });

  console.log(`Tablas con datos (${conDatos.length} de ${tablas.length}):`);
  conDatos.forEach((c) => console.log(`   ${String(c.filas).padStart(6)}  ${c.tabla}`));
  console.log(`   ${String(otrosUsuarios).padStart(6)}  Usuario (todos menos ${EMAIL})`);
  console.log(`\n   Total a borrar: ${total + otrosUsuarios} filas\n`);

  if (!EJECUTAR) {
    console.log("Para borrar de verdad, repetí el comando con:");
    console.log("   CONFIRMAR=BORRAR-TODO\n");
    return;
  }

  // 4. Un solo TRUNCATE para todas. CASCADE resuelve el orden de las claves
  //    foráneas; Usuario no puede caer en el cascade porque ninguna de sus
  //    columnas apunta a otra tabla (todas las relaciones lo referencian a él).
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tablas.map(q).join(", ")} RESTART IDENTITY CASCADE`,
  );
  console.log(`✓ Vaciadas ${tablas.length} tablas.`);

  const { count } = await prisma.usuario.deleteMany({ where: OTROS_USUARIOS });
  console.log(`✓ Eliminados ${count} usuarios. Queda ${conservado.email}.`);

  if (LIMPIAR_SUPABASE) await limpiarSupabase();
  else await avisarSupabase();

  console.log("\nBase lista para cargar los datos reales.");
}

/** Borra en Supabase Auth todas las cuentas menos la conservada. */
async function limpiarSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("\n✖ LIMPIAR_SUPABASE=1 pero faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    console.error("  Las cuentas de Supabase Auth quedaron sin tocar.");
    process.exitCode = 1;
    return;
  }
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const aBorrar: { id: string; email: string }[] = [];
  let conservadoEnAuth = false;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      const email = (u.email ?? "").toLowerCase();
      if (email === EMAIL) conservadoEnAuth = true;
      else aBorrar.push({ id: u.id, email: u.email ?? u.id });
    }
    if (data.users.length < 200) break;
  }

  for (const u of aBorrar) {
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    console.log(error ? `⚠  ${u.email}: ${error.message}` : `✓ Supabase Auth: borrado ${u.email}`);
  }
  if (aBorrar.length === 0) console.log("✓ Supabase Auth: no había otras cuentas.");
  if (!conservadoEnAuth) {
    console.warn(
      `\n⚠  ${EMAIL} no existe en Supabase Auth. Creala desde el panel de Supabase o` +
        " no vas a poder iniciar sesión.",
    );
  }
}

/** Con AUTH_PROVIDER=supabase, borrar el Usuario local no alcanza. */
async function avisarSupabase() {
  if ((process.env.AUTH_PROVIDER ?? "local") !== "supabase") return;
  console.warn(
    "\n⚠  AUTH_PROVIDER=supabase: las cuentas siguen existiendo en Supabase Auth.\n" +
      "   Cualquiera de ellas puede iniciar sesión y su fila en Usuario se vuelve a crear sola.\n" +
      "   Volvé a correr esto con LIMPIAR_SUPABASE=1, o borralas a mano en Supabase → Authentication.",
  );
}

main()
  .catch((e) => {
    console.error("\n✖ Falló el reseteo:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
