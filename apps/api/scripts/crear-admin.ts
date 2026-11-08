/**
 * Crea (o corrige) un usuario en la tabla `Usuario`, sin tocar nada más.
 *
 * Es para el primer login de una base nueva y vacía. El seed sirve para
 * desarrollo, pero además de los usuarios carga catálogo de demo, mesas e
 * insumos: en una base que va a tener datos reales eso hay que borrarlo
 * después. Esto crea sólo la persona que va a entrar.
 *
 * Uso:
 *   USUARIO_EMAIL=henry@donjulio.uy USUARIO_PASSWORD='...' \
 *   USUARIO_ROL=ADMIN USUARIO_NOMBRE='Henry' \
 *   pnpm --filter @donjulio/api crear:admin
 *
 * Si el email ya existe, le corrige el rol, el nombre y la contraseña (sirve
 * para recuperar el acceso si se perdió la clave).
 *
 * Con `AUTH_PROVIDER=supabase` el login lo valida Supabase y la contraseña de
 * acá no se usa: en ese caso el usuario se crea con `provision:supabase`, que
 * además conserva el UID. Esta fila igual no molesta, porque es la que la API
 * crea sola en el primer login (emparejando por email).
 *
 * Opcional:
 *   USUARIO_PIN=1234   PIN de 4 dígitos para fichar en el tablet.
 */
import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const email = process.env.USUARIO_EMAIL?.trim().toLowerCase();
const password = process.env.USUARIO_PASSWORD;
const nombre = process.env.USUARIO_NOMBRE?.trim();
const rolTxt = (process.env.USUARIO_ROL ?? "ADMIN").trim().toUpperCase();
const pin = process.env.USUARIO_PIN?.trim();

if (!email || !password) {
  console.error(
    "Faltan datos. Ejemplo:\n" +
      "  USUARIO_EMAIL=henry@donjulio.uy USUARIO_PASSWORD='...' USUARIO_NOMBRE='Henry' \\\n" +
      "  pnpm --filter @donjulio/api crear:admin",
  );
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`"${email}" no parece un email.`);
  process.exit(1);
}
if (password.length < 8) {
  console.error("La contraseña tiene que tener al menos 8 caracteres.");
  process.exit(1);
}
if (!Object.values(UserRole).includes(rolTxt as UserRole)) {
  console.error(`USUARIO_ROL="${rolTxt}" no existe. Opciones: ${Object.values(UserRole).join(", ")}`);
  process.exit(1);
}
if (pin && !/^\d{4}$/.test(pin)) {
  console.error("USUARIO_PIN tiene que ser de 4 dígitos.");
  process.exit(1);
}

const prisma = new PrismaClient();

(async () => {
  try {
    const role = rolTxt as UserRole;
    const passwordHash = await bcrypt.hash(password, 10);
    const pinHash = pin ? await bcrypt.hash(pin, 10) : undefined;
    const existia = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });

    const usuario = await prisma.usuario.upsert({
      where: { email },
      update: { nombre: nombre || undefined, role, passwordHash, activo: true, ...(pinHash ? { pinHash } : {}) },
      create: { email, nombre: nombre || email, role, passwordHash, ...(pinHash ? { pinHash } : {}) },
      select: { id: true, email: true, role: true, numeroEmpleado: true, pinHash: true },
    });

    console.log(
      `${existia ? "♻️  actualizado" : "✅ creado"} ${usuario.email} (${usuario.role})\n` +
        `   número de empleado para fichar: ${usuario.numeroEmpleado}` +
        (usuario.pinHash ? ` · con PIN${pin ? " (el nuevo)" : ""}` : " · sin PIN todavía (se pone en el panel)"),
    );
    const total = await prisma.usuario.count();
    if (total > 1) {
      console.log(`\nHay ${total} usuarios en la base. Revisá en el panel que no queden los de demo.`);
    }
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
