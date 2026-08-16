import { useState } from "react";
import { useAuth } from "../lib/auth";
import { LogoPrincipal } from "../lib/Logo";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message || "No se pudo ingresar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-dj-carbon px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-sm bg-dj-papel p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <LogoPrincipal tinta="#22211F" acento="#C0561D" conAnio={false} className="mx-auto h-24" />
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-marca text-dj-humo">
            Comandas · Ingreso de mozos
          </p>
        </div>
        {error && (
          <div className="mb-4 border-l-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="mb-3 w-full rounded-sm border border-dj-arena bg-white px-4 py-3 text-lg outline-none focus:border-dj-terracota"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className="mb-6 w-full rounded-sm border border-dj-arena bg-white px-4 py-3 text-lg outline-none focus:border-dj-terracota"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-dj-terracota py-3.5 text-sm font-semibold uppercase tracking-[0.16em] text-dj-papel active:bg-dj-cobre disabled:opacity-60"
        >
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
