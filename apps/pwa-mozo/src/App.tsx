import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./lib/auth";
import { api } from "./lib/api";
import { flushOutbox, onConnectivityChange } from "./lib/sync";
import { useIdleLogout } from "./lib/useIdleLogout";
import { outboxAll } from "./lib/db";
import Login from "./pages/Login";
import Mesas from "./pages/Mesas";
import Comanda from "./pages/Comanda";
import ChangePassword from "./pages/ChangePassword";

export interface MesaSel {
  id: string;
  numero: number;
}

export default function App() {
  const { user, ready, logout } = useAuth();
  // Cierre por inactividad según la política del rol (0 = desactivado).
  useIdleLogout(logout, !!user);
  const [mesa, setMesa] = useState<MesaSel | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendientes, setPendientes] = useState(0);
  const [cajaAbierta, setCajaAbierta] = useState(true);

  const refreshPend = useCallback(async () => {
    setPendientes((await outboxAll()).length);
  }, []);

  useEffect(() => {
    if (!user) return;
    const sync = async () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) {
        await flushOutbox();
        api.get<{ abierta: boolean }>("/admin/caja/estado").then((r) => setCajaAbierta(r.abierta)).catch(() => {});
      }
      refreshPend();
    };
    sync();
    const off = onConnectivityChange(sync);
    // Reintento periódico de la cola + estado de caja.
    const t = setInterval(sync, 10000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [refreshPend, user]);

  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-crust-500">Cargando…</div>;
  }
  if (!user) return <Login />;
  // Fuerza el cambio de contraseña en el primer login / tras un reset.
  if (user.mustChangePassword) return <ChangePassword />;

  return (
    <div className="min-h-screen">
      <ConnBar online={online} pendientes={pendientes} />
      {!cajaAbierta && (
        <div className="bg-red-600 px-3 py-2 text-center text-sm font-medium text-white">
          ⚠️ La caja no está abierta. Pedile al responsable que la abra para poder cobrar.
        </div>
      )}
      {mesa ? (
        <Comanda mesa={mesa} onBack={() => setMesa(null)} onQueued={refreshPend} online={online} cajaAbierta={cajaAbierta} />
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
