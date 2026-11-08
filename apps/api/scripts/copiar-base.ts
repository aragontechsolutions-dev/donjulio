/**
 * Copia los datos de una base Don Julio a otra, tabla por tabla.
 *
 * Es para la mudanza de proyecto Supabase (ver `docs/MIGRACION-USA.md`): la
 * base nueva se crea con `prisma migrate deploy` y después se traen los datos
 * con este script. No hace falta pg_dump, psql ni Docker: usa Prisma, que ya
 * está instalado, así que corre igual en Windows.
 *
 * Uso (DATABASE_URL = base NUEVA, la de destino):
 *
 *   DATABASE_URL_ORIGEN="postgresql://...base vieja..." \
 *   pnpm --filter @donjulio/api copiar:base
 *
 * Conviene usar en las dos puntas la conexión DIRECTA (puerto 5432), no el
 * pooler: son muchas consultas seguidas.
 *
 * El destino tiene que estar vacío. Si tiene datos, el script se detiene y
 * avisa; con VACIAR_DESTINO=1 los borra antes de copiar (ojo con eso).
 *
 * Variables opcionales:
 *   VACIAR_DESTINO=1   borra lo que haya en el destino antes de copiar.
 *   LOTE=500           cuántas filas por insert (bajarlo si hay timeouts).
 *   SOLO=Producto,...  copiar nada más esas tablas.
 */
import { Prisma, PrismaClient } from "@prisma/client";

const origenUrl = process.env.DATABASE_URL_ORIGEN;
const destinoUrl = process.env.DATABASE_URL;
const vaciar = process.env.VACIAR_DESTINO === "1";
const lote = Math.max(1, Number(process.env.LOTE ?? 500) || 500);
const soloEstas = (process.env.SOLO ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!origenUrl) {
  console.error("Falta DATABASE_URL_ORIGEN (la base vieja, de donde se copia).");
  process.exit(1);
}
if (!destinoUrl) {
  console.error("Falta DATABASE_URL (la base nueva, a donde se copia).");
  process.exit(1);
}
if (origenUrl === destinoUrl) {
  console.error("El origen y el destino son la misma base. Revisá las variables.");
  process.exit(1);
}

/** Tabla intermedia de la relación muchos-a-muchos Categoria↔Proveedor. */
const M2M = { tabla: "_CategoriaToProveedor", a: "A", b: "B" };

/**
 * Tablas que vienen con una fila puesta por la propia migración.
 *
 * Una base recién migrada no está del todo vacía: `FiscalConfig` arranca con su
 * fila de configuración. Esas filas no significan "esta base ya está en uso",
 * así que no frenan la copia; se reemplazan por las del origen.
 */
const SEMBRADAS_POR_MIGRACION = new Set(["FiscalConfig"]);

/**
 * Ordena las tablas para que ninguna se inserte antes que aquello a lo que
 * apunta: primero Categoria, después Producto, después PedidoItem.
 *
 * El orden sale del esquema (DMMF), no de una lista escrita a mano, así que al
 * agregar un modelo nuevo esto sigue andando solo.
 */
function ordenarPorDependencias(): string[] {
  const modelos = Prisma.dmmf.datamodel.models;
  const pendientes = new Map<string, Set<string>>();
  for (const m of modelos) {
    const deps = new Set<string>();
    for (const f of m.fields) {
      // Sólo el lado que guarda la clave foránea depende del otro.
      if (f.kind === "object" && f.relationFromFields?.length && f.type !== m.name) {
        deps.add(f.type);
      }
    }
    pendientes.set(m.name, deps);
  }

  const orden: string[] = [];
  while (pendientes.size) {
    const listos = [...pendientes.entries()]
      .filter(([, deps]) => [...deps].every((d) => !pendientes.has(d)))
      .map(([nombre]) => nombre);
    if (!listos.length) {
      // Ciclo entre tablas: se copian al final y Postgres se queja si hace
      // falta. Hasta hoy el esquema no tiene ninguno.
      const restantes = [...pendientes.keys()];
      console.log(`⚠️  Dependencias circulares entre: ${restantes.join(", ")}. Se copian al final.`);
      orden.push(...restantes);
      break;
    }
    listos.sort();
    orden.push(...listos);
    for (const n of listos) pendientes.delete(n);
  }
  return orden;
}

const cliente = (url: string) =>
  new PrismaClient({ datasources: { db: { url } }, log: ["warn", "error"] });

/** Nombre del modelo → propiedad del cliente Prisma (Producto → producto). */
const prop = (modelo: string) => modelo[0].toLowerCase() + modelo.slice(1);

type Delegado = { count: () => Promise<number>; findMany: (a?: unknown) => Promise<unknown[]>; createMany: (a: unknown) => Promise<{ count: number }> };
const delegado = (p: PrismaClient, modelo: string) =>
  (p as unknown as Record<string, Delegado>)[prop(modelo)];

(async () => {
  const origen = cliente(origenUrl);
  const destino = cliente(destinoUrl);
  try {
    const todas = ordenarPorDependencias();
    const tablas = soloEstas.length ? todas.filter((t) => soloEstas.includes(t)) : todas;
    if (soloEstas.length) {
      const desconocidas = soloEstas.filter((t) => !todas.includes(t));
      if (desconocidas.length) {
        console.error(`SOLO menciona tablas que no existen: ${desconocidas.join(", ")}`);
        process.exit(1);
      }
    }

    // ── Chequeo previo: el destino tiene que estar vacío ──
    const conDatos: string[] = [];
    for (const t of tablas) {
      if ((await delegado(destino, t).count()) > 0) conDatos.push(t);
    }
    const m2mDestino = Number(
      (await destino.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${M2M.tabla}"`))[0].n,
    );
    if (m2mDestino) conDatos.push(M2M.tabla);
    const enUso = conDatos.filter((t) => !SEMBRADAS_POR_MIGRACION.has(t));
    if (enUso.length && !vaciar) {
      console.error(
        `El destino ya tiene datos en: ${enUso.join(", ")}.\n` +
          "Copiar encima mezclaría las dos bases. Si querés reemplazarlo, corré de nuevo con VACIAR_DESTINO=1.",
      );
      process.exit(1);
    }
    if (conDatos.length) {
      console.log(`Vaciando el destino (${conDatos.join(", ")})…`);
      // TRUNCATE con CASCADE y todas juntas: no importa el orden.
      const lista = [...new Set([...tablas.map((t) => `"${t}"`), `"${M2M.tabla}"`])].join(", ");
      await destino.$executeRawUnsafe(`TRUNCATE TABLE ${lista} CASCADE`);
    }

    // ── Copia ──
    console.log(`Copiando ${tablas.length} tabla(s) en lotes de ${lote}…\n`);
    const resumen: [string, number, number][] = [];
    for (const t of tablas) {
      const total = await delegado(origen, t).count();
      if (!total) {
        resumen.push([t, 0, 0]);
        continue;
      }
      let copiadas = 0;
      for (let skip = 0; skip < total; skip += lote) {
        const filas = await delegado(origen, t).findMany({ skip, take: lote });
        const { count } = await delegado(destino, t).createMany({ data: filas, skipDuplicates: true });
        copiadas += count;
      }
      resumen.push([t, total, copiadas]);
      const marca = copiadas === total ? "✓" : "⚠";
      console.log(`  ${marca} ${t}: ${copiadas}/${total}`);
    }

    // ── La tabla intermedia de la m2m, que no es un modelo de Prisma ──
    if (!soloEstas.length) {
      const pares = await origen.$queryRawUnsafe<Record<string, string>[]>(
        `SELECT "${M2M.a}", "${M2M.b}" FROM "${M2M.tabla}"`,
      );
      for (const par of pares) {
        await destino.$executeRawUnsafe(
          `INSERT INTO "${M2M.tabla}" ("${M2M.a}", "${M2M.b}") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          par[M2M.a],
          par[M2M.b],
        );
      }
      if (pares.length) console.log(`  ✓ ${M2M.tabla}: ${pares.length}`);
    }

    // ── Resumen ──
    const faltantes = resumen.filter(([, total, copiadas]) => copiadas !== total);
    const filas = resumen.reduce((a, [, , c]) => a + c, 0);
    console.log(`\n${filas} fila(s) copiada(s) en ${resumen.filter(([, t]) => t > 0).length} tabla(s) con datos.`);
    if (faltantes.length) {
      console.log("\n⚠️  Quedaron filas sin copiar (probablemente ya estaban):");
      for (const [t, total, copiadas] of faltantes) console.log(`   - ${t}: ${copiadas} de ${total}`);
      process.exitCode = 1;
    } else {
      console.log("Todo copiado. Revisá el panel antes de borrar la base vieja.");
    }
  } finally {
    await origen.$disconnect();
    await destino.$disconnect();
  }
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
