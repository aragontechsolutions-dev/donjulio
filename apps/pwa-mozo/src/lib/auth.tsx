import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser, LoginResponse } from "@donjulio/shared";
import { api, tokenStore } from "./api";

interface AuthCtx {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      setReady(true);
      return;
    }
    api
      .get<AuthUser>("/auth/me")
      .then(setUser)
      // Offline: si hay token, confiamos en él hasta poder validar.
      .catch(() => {
        const cached = localStorage.getItem("donjulio_mozo_user");
        if (cached) setUser(JSON.parse(cached));
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      ready,
      login: async (email, password) => {
        const res = await api.post<LoginResponse>("/auth/login", { email, password });
        tokenStore.set(res.accessToken);
        localStorage.setItem("donjulio_mozo_user", JSON.stringify(res.user));
        setUser(res.user);
      },
      logout: () => {
        tokenStore.clear();
        localStorage.removeItem("donjulio_mozo_user");
        setUser(null);
      },
    }),
    [user, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}
