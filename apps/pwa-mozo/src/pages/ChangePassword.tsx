import { useState } from "react";
import { useAuth } from "../lib/auth";
import { showToast } from "../lib/toast";
import { supabase } from "../lib/supabase";

/**
 * Cambio de contraseña obligatorio (primer login / tras reset) en la PWA.
 * Sólo aplica en modo Supabase Auth.
 */
export default function ChangePassword() {
  const { logout } = useAuth();
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pass.length < 6) return setError("La contraseña debe tener al menos 6 caracteres");
    if (pass !== pass2) return setError("Las contraseñas no coinciden");
    if (!supabase) return setError("Disponible sólo con Supabase Auth");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: pass,
        data: { must_change_password: false },
      });
      if (error) throw new Error(error.message);
      // Cierra sesión y vuelve al login: el próximo ingreso trae un token
      // nuevo, ya sin el flag de cambio obligatorio.
      showToast("success", "Contraseña cambiada correctamente. Ingresá con la nueva.");
      await logout();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-crust-100 px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="text-5xl">🔑</div>
          <h1 className="mt-2 font-display text-2xl font-bold text-crust-800">Cambiá tu contraseña</h1>
          <p className="text-sm text-crust-500">Por seguridad, definí una nueva para continuar.</p>
        </div>
        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <input type="password" placeholder="Nueva contraseña" value={pass} onChange={(e) => setPass(e.target.value)} className="mb-3 w-full rounded-xl border border-crust-200 px-4 py-3 text-lg" required />
        <input type="password" placeholder="Repetir contraseña" value={pass2} onChange={(e) => setPass2(e.target.value)} className="mb-6 w-full rounded-xl border border-crust-200 px-4 py-3 text-lg" required />
        <button type="submit" disabled={loading} className="w-full rounded-xl bg-crust-600 py-3.5 text-lg font-semibold text-white active:bg-crust-700 disabled:opacity-60">
          {loading ? "Guardando…" : "Guardar y continuar"}
        </button>
        <button type="button" onClick={logout} className="mt-3 w-full text-center text-sm text-crust-500">
          Cancelar y salir
        </button>
      </form>
    </div>
  );
}
