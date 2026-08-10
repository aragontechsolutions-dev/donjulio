import { useEffect, useState } from "react";
import { UserRole } from "@donjulio/shared";
import { api } from "../../lib/api";

interface Usuario {
  id: string;
  email: string;
  nombre: string;
  role: string;
}

const ROLES = Object.values(UserRole);

export default function UsuariosAdmin() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [form, setForm] = useState({ email: "", nombre: "", password: "", role: "CAJERO", forceChange: true });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = () =>
    api.get<Usuario[]>("/admin/usuarios").then(setUsuarios).catch((e) => setError((e as Error).message));

  useEffect(() => {
    load();
  }, []);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);
    try {
      await api.post("/admin/usuarios", form);
      setOk(`Usuario ${form.email} creado`);
      setForm({ email: "", nombre: "", password: "", role: "CAJERO", forceChange: true });
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

      <form onSubmit={crear} className="mb-6 grid gap-3 rounded-2xl border border-crust-100 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-lg border border-crust-200 px-3 py-2" required />
        <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="rounded-lg border border-crust-200 px-3 py-2" required />
        <input placeholder="Contraseña" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded-lg border border-crust-200 px-3 py-2" required />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded-lg border border-crust-200 px-3 py-2">
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button className="rounded-lg bg-crust-600 px-4 py-2 font-semibold text-white hover:bg-crust-700">Crear usuario</button>
        <label className="flex items-center gap-2 text-sm text-crust-600 sm:col-span-2 lg:col-span-5">
          <input type="checkbox" checked={form.forceChange} onChange={(e) => setForm({ ...form, forceChange: e.target.checked })} />
          Obligar a cambiar la contraseña en el primer ingreso
        </label>
      </form>

      <div className="overflow-hidden rounded-2xl border border-crust-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-crust-50 text-left text-crust-600">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t border-crust-50">
                <td className="px-4 py-3 font-medium text-crust-800">{u.nombre}</td>
                <td className="px-4 py-3 text-crust-500">{u.email}</td>
                <td className="px-4 py-3">
                  <select value={u.role} onChange={(e) => cambiarRol(u, e.target.value)} className="rounded-lg border border-crust-200 px-2 py-1 text-sm">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => resetear(u)} className="mr-2 rounded-lg border border-crust-200 px-3 py-1.5 text-sm text-crust-700 hover:bg-crust-100">Resetear contraseña</button>
                  <button onClick={() => eliminar(u)} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">Eliminar</button>
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-crust-400">No hay usuarios.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
