import { useState } from "react";
import { useAuth } from "../lib/auth";

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
    <div className="grid min-h-screen place-items-center bg-crust-100 px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="text-5xl">🥖</div>
          <h1 className="mt-2 font-display text-2xl font-bold text-crust-800">Comandas Don Julio</h1>
          <p className="text-sm text-crust-500">Ingreso de mozos</p>
        </div>
        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="mb-3 w-full rounded-xl border border-crust-200 px-4 py-3 text-lg"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className="mb-6 w-full rounded-xl border border-crust-200 px-4 py-3 text-lg"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-crust-600 py-3.5 text-lg font-semibold text-white active:bg-crust-700 disabled:opacity-60"
        >
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
