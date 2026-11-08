/**
 * Copia las imágenes de un proyecto Supabase a otro y corrige las URLs guardadas
 * en la base.
 *
 * Al mudar de proyecto (por ejemplo de São Paulo a Oregon) las fotos se quedan
 * en el bucket viejo: lo que hay en la base son URLs públicas absolutas, con el
 * dominio del proyecto anterior adentro. Si se borra el proyecto viejo, las
 * miniaturas se rompen. Este script baja cada archivo del bucket de origen, lo
 * sube al de destino con la misma ruta y después reemplaza el dominio viejo por
 * el nuevo en las columnas que guardan imágenes.
 *
 * Uso (DATABASE_URL tiene que apuntar ya a la base NUEVA):
 *
 *   SUPABASE_URL_ORIGEN=https://viejo.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY_ORIGEN=... \
 *   pnpm --filter @donjulio/api migrar:storage
 *
 * El destino sale de SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (las del .env ya
 * apuntando al proyecto nuevo) y el bucket de SUPABASE_STORAGE_BUCKET.
 *
 * Es idempotente: se puede correr de nuevo sin duplicar nada (sube con upsert y
 * el reemplazo de URLs sólo afecta a las que todavía apuntan al origen).
 *
 * Variables opcionales:
 *   SOLO_ARCHIVOS=1  copia los archivos y no toca la base.
 *   SOLO_URLS=1      sólo reescribe las URLs (si ya copiaste a mano).
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

const origenUrl = process.env.SUPABASE_URL_ORIGEN;
const origenKey = process.env.SUPABASE_SERVICE_ROLE_KEY_ORIGEN;
const destinoUrl = process.env.SUPABASE_URL;
const destinoKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "donjulio";
const soloArchivos = process.env.SOLO_ARCHIVOS === "1";
const soloUrls = process.env.SOLO_URLS === "1";

if (!origenUrl || !origenKey) {
  console.error("Faltan SUPABASE_URL_ORIGEN y/o SUPABASE_SERVICE_ROLE_KEY_ORIGEN (el proyecto viejo).");
  process.exit(1);
}
if (!destinoUrl || !destinoKey) {
  console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY (el proyecto nuevo).");
  process.exit(1);
}
if (origenUrl === destinoUrl) {
  console.error("El origen y el destino son el mismo proyecto. Revisá las variables.");
  process.exit(1);
}

const origen = createClient(origenUrl, origenKey, { auth: { persistSession: false } });
const destino = createClient(destinoUrl, destinoKey, { auth: { persistSession: false } });

/** Prefijo de las URLs públicas de un proyecto para este bucket. */
const prefijoPublico = (url: string) =>
  `${url.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/`;

/** Lista el bucket entero, entrando en las carpetas (Storage no lista recursivo). */
async function listarTodo(client: SupabaseClient, prefijo = ""): Promise<string[]> {
  const rutas: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefijo, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`No se pudo listar "${prefijo || "/"}": ${error.message}`);
    if (!data?.length) break;
    for (const item of data) {
      const ruta = prefijo ? `${prefijo}/${item.name}` : item.name;
      // Storage devuelve id: null para las carpetas.
      if (item.id === null) rutas.push(...(await listarTodo(client, ruta)));
      else rutas.push(ruta);
    }
    if (data.length < 100) break;
  }
  return rutas;
}

/** Deja el bucket de destino creado y público, como lo hace la API. */
async function prepararDestino() {
  const { data } = await destino.storage.getBucket(bucket);
  if (data) {
    if (!data.public) await destino.storage.updateBucket(bucket, { public: true });
    return;
  }
  const { error } = await destino.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: "5MB",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  });
  if (error && !/exist/i.test(error.message)) {
    throw new Error(`No se pudo crear el bucket "${bucket}" en el destino: ${error.message}`);
  }
  console.log(`Bucket "${bucket}" creado en el destino (público).`);
}

async function copiarArchivos() {
  await prepararDestino();
  const rutas = await listarTodo(origen);
  console.log(`${rutas.length} archivo(s) en el bucket "${bucket}" del proyecto viejo.`);

  let copiados = 0;
  const fallados: string[] = [];
  for (const ruta of rutas) {
    const { data, error } = await origen.storage.from(bucket).download(ruta);
    if (error || !data) {
      fallados.push(`${ruta} (bajando: ${error?.message ?? "sin datos"})`);
      continue;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    const { error: subida } = await destino.storage
      .from(bucket)
      .upload(ruta, buffer, { contentType: data.type || "application/octet-stream", upsert: true });
    if (subida) {
      fallados.push(`${ruta} (subiendo: ${subida.message})`);
      continue;
    }
    copiados++;
    if (copiados % 20 === 0) console.log(`  ${copiados}/${rutas.length}…`);
  }
  console.log(`✅ ${copiados} archivo(s) copiado(s).`);
  if (fallados.length) {
    console.log(`⚠️  ${fallados.length} no se pudieron copiar:`);
    for (const f of fallados) console.log(`   - ${f}`);
  }
}

/** Columnas de la base que guardan una URL de Storage. */
const COLUMNAS: [tabla: string, columna: string][] = [
  ["Producto", "imagenUrl"],
  ["Galeria", "imagenUrl"],
  ["SalonPlano", "imagenUrl"],
  ["Shift", "fotoEntradaUrl"],
  ["Shift", "fotoSalidaUrl"],
];

async function reescribirUrls() {
  const viejo = prefijoPublico(origenUrl!);
  const nuevo = prefijoPublico(destinoUrl!);
  const prisma = new PrismaClient();
  try {
    for (const [tabla, columna] of COLUMNAS) {
      const filas = await prisma.$executeRawUnsafe(
        `UPDATE "${tabla}" SET "${columna}" = replace("${columna}", $1, $2) WHERE "${columna}" LIKE $3`,
        viejo,
        nuevo,
        `${viejo}%`,
      );
      console.log(`  ${tabla}.${columna}: ${filas} fila(s) actualizada(s).`);
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log("✅ URLs apuntando al proyecto nuevo.");
}

(async () => {
  if (!soloUrls) await copiarArchivos();
  if (!soloArchivos) {
    console.log("Reescribiendo las URLs guardadas en la base…");
    await reescribirUrls();
  }
  console.log("\nListo. Revisá las miniaturas en el panel antes de borrar el proyecto viejo.");
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
