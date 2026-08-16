import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { LogoPrincipal } from "../lib/Logo";

export default function AdminLogin() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) {
    navigate("/admin", { replace: true });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/admin", { replace: true });
    } catch (err) {
      setError((err as Error).message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-dj-carbon px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-sm border border-dj-arena bg-dj-papel p-8 shadow-2xl"
      >
        <div className="mb-8 text-center">
          <LogoPrincipal
            tinta="#22211F"
            acento="#C0561D"
            conAnio={false}
            className="mx-auto h-24"
          />
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-marca text-dj-humo">
            Acceso a la gestión
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-sm border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <label className="mb-3 block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dj-humo">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-sm border border-dj-arena bg-white px-3 py-2 outline-none transition-colors focus:border-dj-terracota"
            required
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-dj-humo">
            Contraseña
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-sm border border-dj-arena bg-white px-3 py-2 outline-none transition-colors focus:border-dj-terracota"
            required
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-dj-terracota py-3 text-xs font-semibold uppercase tracking-[0.16em] text-dj-papel transition-colors hover:bg-dj-cobre disabled:opacity-60"
        >
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
