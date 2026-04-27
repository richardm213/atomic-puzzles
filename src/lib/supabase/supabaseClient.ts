import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() ?? "",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "",
};

let supabaseClient: SupabaseClient | null = null;

const requireSupabaseConfig = (): void => {
  const { url, anonKey } = supabaseConfig;
  if (!url || !anonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  }
};

export const getSupabaseClient = (): SupabaseClient => {
  requireSupabaseConfig();
  if (!supabaseClient) {
    const { url, anonKey } = supabaseConfig;
    supabaseClient = createClient(url, anonKey);
  }
  return supabaseClient;
};
