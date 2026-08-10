/**
 * Crea/actualiza los usuarios del sistema en Supabase Auth con su rol en
 * app_metadata. Es idempotente: si el usuario ya existe, corrige su contraseña,
 * su rol y lo deja confirmado.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   pnpm --filter @donjulio/api provision:supabase
 *
 * La service_role key es secreta: usar sólo en el backend/CLI, nunca en el cliente.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const usuarios = [
  { email: "admin@donjulio.uy", password: "donjulio123", nombre: "Julio (Admin)", role: "ADMIN" },
  { email: "caja@donjulio.uy", password: "donjulio123", nombre: "Cajero/a", role: "CAJERO" },
  { email: "mozo@donjulio.uy", password: "donjulio123", nombre: "Mozo/a", role: "MOZO" },
];

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
  for (const u of usuarios) {
    const existente = await findByEmail(u.email);
    const meta = {
      app_metadata: { role: u.role },
      user_metadata: { nombre: u.nombre, role: u.role },
    };
    if (existente) {
      const { error } = await supabase.auth.admin.updateUserById(existente.id, {
        password: u.password,
        email_confirm: true,
        ...meta,
      });
      console.log(error ? `⚠️  ${u.email}: ${error.message}` : `♻️  actualizado ${u.email} (${u.role})`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        ...meta,
      });
      console.log(error ? `⚠️  ${u.email}: ${error.message}` : `✅ creado ${u.email} (${u.role}) → ${data.user?.id}`);
    }
  }
  console.log("Listo. Cambiá las contraseñas demo en producción.");
})();
