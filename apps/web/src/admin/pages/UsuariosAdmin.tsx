import { useEffect, useState } from "react";
import { UserRole } from "@donjulio/shared";
import { api } from "../../lib/api";

interface Usuario {
  id: string;
  email: string;
  nombre: string;
  role: string;
  localId?: string;
  numeroEmpleado?: number;
  pinHash?: boolean;
}

const ROLES = Object.values(UserRole);

interface SesionCfg {
  adminMin: number;
  cajeroMin: number;
  produccionMin: number;
  mozoMin: number;
  deliveryMin: number;
}
const CAMPOS_SESION: { k: keyof SesionCfg; label: string }[] = [
  { k: "adminMin", label: "Admin" },
  { k: "cajeroMin", label: "Cajero" },
  { k: "produccionMin", label: "Producción" },
  { k: "mozoMin", label: "Mozo" },
  { k: "deliveryMin", label: "Delivery" },
];

export default function UsuariosAdmin() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [sesion, setSesion] = useState<SesionCfg | null>(null);
  const [savingSesion, setSavingSesion] = useState(false);
  const [form, setForm] = useState({ email: "", nombre: "", password: "", role: "CAJERO", forceChange: true, pin: "" });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = () =>
    api.get<Usuario[]>("/admin/usuarios").then(setUsuarios).catch((e) => setError((e as Error).message));

  useEffect(() => {
    load();
    api.get<SesionCfg>("/admin/config/sesion").then(setSesion).catch(() => {});
  }, []);

  const guardarSesion = async () => {
    if (!sesion) return;
    setSavingSesion(true);
    setError(null);
    setOk(null);
    try {
      await api.patch("/admin/config/sesion", sesion);
      setOk("Política de sesión guardada. Se aplica al volver a iniciar sesión.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingSesion(false);
    }
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (form.pin && !/^\d{4,6}$/.test(form.pin)) {
      setError("El PIN de fichaje debe tener entre 4 y 6 dígitos.");
      return;
    }
    try {
      const u = await api.post<Usuario>(
        "/admin/usuarios",
        { ...form, pin: form.pin || undefined },
        { sinToast: true }, // el aviso de abajo ya dice el número asignado
      );
      setOk(
        u.pinHash
          ? `${form.nombre} ya puede fichar en el tablet: número ${u.numeroEmpleado} + el PIN que definiste.`
          : `${form.nombre} creado con el número ${u.numeroEmpleado}. Asignale un PIN para que pueda fichar.`,
      );
      setForm({ email: "", nombre: "", password: "", role: "CAJERO", forceChange: true, pin: "" });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  /** PIN de 4-6 dígitos para fichar en el tablet del local. */
  const definirPin = async (u: Usuario) => {
    if (!u.localId) {
      setError("Este usuario todavía no inició sesión, así que no tiene ficha local para fichar.");
      return;
    }
    const pin = prompt(`PIN de fichaje para ${u.nombre} (4 a 6 dígitos). Su número de empleado es ${u.numeroEmpleado ?? "—"}:`);
    if (!pin) return;
    setError(null);
    setOk(null);
    try {
      await api.post(`/admin/usuarios/${u.localId}/pin`, { pin });
      setOk(`PIN actualizado. ${u.nombre} ficha con el número ${u.numeroEmpleado} y ese PIN.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const resetear = async (u: Usuario) => {
    const temp = prompt(`Contraseña temporal para ${u.email} (se le pedirá cambiarla al ingresar):`);
    if (!temp) return;
    setError(null);
    setOk(null);
    try {
      await api.post(`/admin/usuarios/${u.id}/reset-password`, { password: temp });
      setOk(`Contraseña de ${u.email} reseteada. Deberá cambiarla al ingresar.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const cambiarRol = async (u: Usuario, role: string) => {
    setError(null);
    try {
      await api.patch(`/admin/usuarios/${u.id}/rol`, { role });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const eliminar = async (u: Usuario) => {
    if (!confirm(`¿Eliminar a ${u.email}?`)) return;
    setError(null);
    try {
      await api.del(`/admin/usuarios/${u.id}`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold text-crust-800">Usuarios</h1>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {ok && <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}

      <form onSubmit={crear} className="mb-6 grid gap-3 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-lg border border-crust-200 px-3 py-2" required />
        <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="rounded-lg border border-crust-200 px-3 py-2" required />
        <input placeholder="Contraseña" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded-lg border border-crust-200 px-3 py-2" required />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded-lg border border-crust-200 px-3 py-2">
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input
          placeholder="PIN de fichaje"
          inputMode="numeric"
          maxLength={6}
          value={form.pin}
          onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
          className="rounded-lg border border-crust-200 px-3 py-2 tabular-nums"
          title="4 a 6 dígitos. Opcional: se puede asignar después con el botón Asignar PIN."
        />
        <button className="rounded-lg bg-dj-terracota px-4 py-2 font-semibold text-white hover:bg-dj-cobre">Crear usuario</button>
        <label className="flex items-center gap-2 text-sm text-crust-600 sm:col-span-2 lg:col-span-6">
          <input type="checkbox" checked={form.forceChange} onChange={(e) => setForm({ ...form, forceChange: e.target.checked })} />
          Obligar a cambiar la contraseña en el primer ingreso
        </label>
        <p className="text-xs text-crust-400 sm:col-span-2 lg:col-span-6">
          El <b>número de empleado</b> se asigna solo al crear el usuario. Con ese número
          y el PIN se ficha en el tablet del local; el email y la contraseña son para
          entrar al panel.
        </p>
      </form>

      <div className="overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-crust-50 text-left text-crust-600">
            <tr>
              <th className="px-4 py-3 text-center">N°</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t border-crust-50">
                <td className="px-4 py-3 text-center">
                  <span className="inline-grid h-7 w-7 place-items-center rounded-full bg-crust-100 text-xs font-bold text-crust-700" title="Número de empleado para fichar">
                    {u.numeroEmpleado ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-crust-800">{u.nombre}</td>
                <td className="px-4 py-3 text-crust-500">{u.email}</td>
                <td className="px-4 py-3">
                  <select value={u.role} onChange={(e) => cambiarRol(u, e.target.value)} className="rounded-lg border border-crust-200 px-2 py-1 text-sm">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => definirPin(u)} className={`mr-2 rounded-lg border px-3 py-1.5 text-sm ${u.pinHash ? "border-crust-200 text-crust-700 hover:bg-crust-100" : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"}`}>
                    {u.pinHash ? "Cambiar PIN" : "Asignar PIN"}
                  </button>
                  <button onClick={() => resetear(u)} className="mr-2 rounded-lg border border-crust-200 px-3 py-1.5 text-sm text-crust-700 hover:bg-crust-100">Resetear contraseña</button>
                  <button onClick={() => eliminar(u)} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">Eliminar</button>
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-crust-400">No hay usuarios.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Cierre de sesión por inactividad */}
      {sesion && (
        <div className="mt-8 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-crust-800">Cierre de sesión por inactividad</h2>
          <p className="mb-4 text-sm text-crust-500">
            Minutos sin actividad antes de cerrar la sesión automáticamente, por rol.
            Usá <b>0</b> para que no se cierre nunca (útil en el tablet de mozos o la pantalla de cocina).
          </p>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {CAMPOS_SESION.map(({ k, label }) => (
              <label key={k} className="block">
                <span className="mb-1 block text-sm font-medium text-crust-700">{label}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={1440}
                    value={sesion[k]}
                    onChange={(e) => setSesion({ ...sesion, [k]: Number(e.target.value) })}
                    className="w-20 rounded-lg border border-crust-200 px-2 py-1.5"
                  />
                  <span className="text-xs text-crust-400">min</span>
                </div>
                {sesion[k] === 0 && <span className="mt-1 block text-xs text-crust-400">sin cierre</span>}
              </label>
            ))}
          </div>
          <button onClick={guardarSesion} disabled={savingSesion} className="mt-4 rounded-lg bg-dj-terracota px-5 py-2 font-semibold text-white hover:bg-dj-cobre disabled:opacity-60">
            {savingSesion ? "Guardando…" : "Guardar política"}
          </button>
          <p className="mt-2 text-xs text-crust-400">
            Además, la sesión ya no sobrevive al cierre de la ventana: al volver a abrir el panel hay que iniciar sesión.
          </p>
        </div>
      )}
    </div>
  );
}
