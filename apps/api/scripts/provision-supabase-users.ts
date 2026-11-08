/**
 * Crea/actualiza usuarios en Supabase Auth con su rol en `app_metadata`. Es
 * idempotente: si el usuario ya existe, corrige su contraseña, su rol y lo deja
 * confirmado.
 *
 * Por defecto carga los tres usuarios de demo (admin/caja/mozo). Para un
 * usuario puntual —el caso típico al mudar de proyecto Supabase— se pasan sus
 * datos por entorno:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   USUARIO_EMAIL=henry@donjulio.uy USUARIO_PASSWORD='...' \
 *   USUARIO_ROL=ADMIN USUARIO_NOMBRE='Henry' \
 *   USUARIO_UID=ce66b88f-29f9-4ea5-bff5-2905201a7def \
 *   pnpm --filter @donjulio/api provision:supabase
 *
 * `USUARIO_UID` sirve para conservar el mismo id que tenía en el proyecto
 * viejo: Supabase acepta elegir el UUID al crear, pero no cambiarlo después.
 * Si el usuario ya existe con otro id, el script avisa y no lo toca.
 *
 * La service_role key es secreta: usar sólo en el backend/CLI, nunca en el
 * cliente ni en una variable VITE_*.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const ROLES = ["ADMIN", "GERENTE", "CAJERO", "MOZO", "COCINA", "PANADERO"];

type Nuevo = {
  email: string;
  password: string;
  nombre: string;
  role: string;
  uid?: string;
};

const DEMO: Nuevo[] = [
  { email: "admin@donjulio.uy", password: "donjulio123", nombre: "Julio (Admin)", role: "ADMIN" },
  { email: "caja@donjulio.uy", password: "donjulio123", nombre: "Cajero/a", role: "CAJERO" },
  { email: "mozo@donjulio.uy", password: "donjulio123", nombre: "Mozo/a", role: "MOZO" },
];

/** Un solo usuario desde el entorno, o los de demo si no se pasó ninguno. */
function aProvisionar(): Nuevo[] {
  const email = process.env.USUARIO_EMAIL?.trim();
  if (!email) return DEMO;

  const password = process.env.USUARIO_PASSWORD?.trim();
  if (!password) {
    console.error("Con USUARIO_EMAIL hay que pasar también USUARIO_PASSWORD.");
    process.exit(1);
  }
  const role = (process.env.USUARIO_ROL ?? "ADMIN").trim().toUpperCase();
  if (!ROLES.includes(role)) {
    console.error(`USUARIO_ROL="${role}" no es un rol válido. Opciones: ${ROLES.join(", ")}`);
    process.exit(1);
  }
  const uid = process.env.USUARIO_UID?.trim() || undefined;
  if (uid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
    console.error(`USUARIO_UID="${uid}" no parece un UUID.`);
    process.exit(1);
  }
  return [{ email, password, role, nombre: process.env.USUARIO_NOMBRE?.trim() || email, uid }];
}

/** Busca un usuario por email recorriendo las páginas del admin API. */
async function findByEmail(email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) break; // última página
  }
  return null;
}

(async () => {
  for (const u of aProvisionar()) {
    const existente = await findByEmail(u.email);
    const meta = {
      app_metadata: { role: u.role },
      user_metadata: { nombre: u.nombre, role: u.role },
    };
    if (existente) {
      if (u.uid && existente.id !== u.uid) {
        // El id de Supabase Auth no se puede cambiar: habría que borrar el
        // usuario y recrearlo, y eso no lo decide un script solo.
        console.log(
          `⚠️  ${u.email} ya existe con id ${existente.id}, distinto del USUARIO_UID pedido (${u.uid}).\n` +
            "    No se tocó. Para conservar el UID: borrá ese usuario en Supabase (Authentication → Users) y volvé a correr.",
        );
        continue;
      }
      const { error } = await supabase.auth.admin.updateUserById(existente.id, {
        password: u.password,
        email_confirm: true,
        ...meta,
      });
      console.log(error ? `⚠️  ${u.email}: ${error.message}` : `♻️  actualizado ${u.email} (${u.role}) → ${existente.id}`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        ...(u.uid ? { id: u.uid } : {}),
        ...meta,
      });
      console.log(error ? `⚠️  ${u.email}: ${error.message}` : `✅ creado ${u.email} (${u.role}) → ${data.user?.id}`);
    }
  }
  console.log("Listo. Cambiá las contraseñas demo en producción.");
})();
