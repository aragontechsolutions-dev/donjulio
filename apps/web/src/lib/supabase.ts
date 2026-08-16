import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const provider = (import.meta.env.VITE_AUTH_PROVIDER as string) ?? "local";

/**
 * Cliente de Supabase sólo si está configurado el modo "supabase".
 * En modo "local" es null y la app usa su propio login por JWT.
 */
export const supabase: SupabaseClient | null =
  provider === "supabase" && url && anon
    ? createClient(url, anon, {
        auth: {
          // sessionStorage (no localStorage): la sesión del panel muere al
          // cerrar la pestaña, así el próximo que abra tiene que loguearse.
          storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export const usesSupabaseAuth = !!supabase;
