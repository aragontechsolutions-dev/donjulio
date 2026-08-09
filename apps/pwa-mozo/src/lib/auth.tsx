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
import { supabase, usesSupabaseAuth } from "./supabase";

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
    if (usesSupabaseAuth && supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          tokenStore.set(data.session.access_token);
          api
            .get<AuthUser>("/auth/me")
            .then((u) => {
              setUser(u);
              localStorage.setItem("donjulio_mozo_user", JSON.stringify(u));
            })
            .catch(() => {
              const cached = localStorage.getItem("donjulio_mozo_user");
              if (cached) setUser(JSON.parse(cached));
            });
        }
        setReady(true);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        if (session) tokenStore.set(session.access_token);
        else tokenStore.clear();
      });
      return () => sub.subscription.unsubscribe();
    }

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
        if (usesSupabaseAuth && supabase) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw new Error(error.message);
          tokenStore.set(data.session!.access_token);
          const me = await api.get<AuthUser>("/auth/me");
          localStorage.setItem("donjulio_mozo_user", JSON.stringify(me));
          setUser(me);
          return;
        }
        const res = await api.post<LoginResponse>("/auth/login", { email, password });
        tokenStore.set(res.accessToken);
        localStorage.setItem("donjulio_mozo_user", JSON.stringify(res.user));
        setUser(res.user);
      },
      logout: () => {
        if (usesSupabaseAuth && supabase) supabase.auth.signOut();
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
