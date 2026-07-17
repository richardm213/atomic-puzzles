import process from "node:process";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const createServerSupabase = (serviceName: string): SupabaseClient => {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!url || !key) throw new Error(`${serviceName} is not configured.`);
  return createClient(url, key, { auth: { persistSession: false } });
};
