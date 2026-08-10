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

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Re-consulta /auth/me (por ej. tras cambiar la contraseña). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (usesSupabaseAuth && supabase) {
      // Mantiene el token de Supabase sincronizado con el store que usa la API.
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          tokenStore.set(data.session.access_token);
          api.get<AuthUser>("/auth/me").then(setUser).catch(() => {});
        }
        setLoading(false);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        if (session) tokenStore.set(session.access_token);
        else tokenStore.clear();
      });
      return () => sub.subscription.unsubscribe();
    }

    // Modo local (JWT propio).
    const token = tokenStore.get();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<AuthUser>("/auth/me")
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        if (usesSupabaseAuth && supabase) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw new Error(error.message);
          tokenStore.set(data.session!.access_token);
          const me = await api.get<AuthUser>("/auth/me");
          setUser(me);
          return;
        }
        const res = await api.post<LoginResponse>("/auth/login", {
          email,
          password,
        });
        tokenStore.set(res.accessToken);
        setUser(res.user);
      },
      logout: () => {
        if (usesSupabaseAuth && supabase) supabase.auth.signOut();
        tokenStore.clear();
        setUser(null);
      },
      refresh: async () => {
        const me = await api.get<AuthUser>("/auth/me");
        setUser(me);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
