/**
 * Crea los usuarios del sistema en Supabase Auth con su rol en app_metadata.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   pnpm --filter @donjulio/api exec ts-node scripts/provision-supabase-users.ts
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

(async () => {
  for (const u of usuarios) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      app_metadata: { role: u.role },
      user_metadata: { nombre: u.nombre, role: u.role },
    });
    if (error) {
      console.warn(`⚠️  ${u.email}: ${error.message}`);
    } else {
      console.log(`✅ ${u.email} (${u.role}) → ${data.user?.id}`);
    }
  }
  console.log("Listo. Cambiá las contraseñas demo en producción.");
})();
