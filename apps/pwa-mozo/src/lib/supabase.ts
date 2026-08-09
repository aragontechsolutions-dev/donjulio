import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const provider = (import.meta.env.VITE_AUTH_PROVIDER as string) ?? "local";

/** Cliente de Supabase sólo en modo "supabase"; null en modo "local". */
export const supabase: SupabaseClient | null =
  provider === "supabase" && url && anon ? createClient(url, anon) : null;

export const usesSupabaseAuth = !!supabase;
