import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./lib/auth";
import { flushOutbox, onConnectivityChange } from "./lib/sync";
import { outboxAll } from "./lib/db";
import Login from "./pages/Login";
import Mesas from "./pages/Mesas";
import Comanda from "./pages/Comanda";

export interface MesaSel {
  id: string;
  numero: number;
}

export default function App() {
  const { user, ready } = useAuth();
  const [mesa, setMesa] = useState<MesaSel | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendientes, setPendientes] = useState(0);

  const refreshPend = useCallback(async () => {
    setPendientes((await outboxAll()).length);
  }, []);

  useEffect(() => {
    refreshPend();
    const sync = async () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) {
        await flushOutbox();
      }
      refreshPend();
    };
    const off = onConnectivityChange(sync);
    // Reintento periódico de la cola.
    const t = setInterval(sync, 10000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [refreshPend]);

  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-crust-500">Cargando…</div>;
  }
  if (!user) return <Login />;

  return (
    <div className="min-h-screen">
      <ConnBar online={online} pendientes={pendientes} />
      {mesa ? (
        <Comanda mesa={mesa} onBack={() => setMesa(null)} onQueued={refreshPend} online={online} />
      ) : (
        <Mesas onSelect={setMesa} />
      )}
    </div>
  );
}

function ConnBar({ online, pendientes }: { online: boolean; pendientes: number }) {
  if (online && pendientes === 0) return null;
  return (
    <div
      className={`sticky top-0 z-40 px-4 py-1.5 text-center text-sm font-semibold text-white ${
        online ? "bg-amber-500" : "bg-red-600"
      }`}
    >
      {online
        ? `Sincronizando ${pendientes} comanda(s) pendiente(s)…`
        : `Sin conexión — ${pendientes} comanda(s) se enviarán al reconectar`}
    </div>
  );
}
