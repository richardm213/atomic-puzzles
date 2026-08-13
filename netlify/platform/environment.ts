import process from "node:process";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { HttpError } from "./errors";

type ServerEnvironment = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

export const readServerEnvironment = (serviceName: string): ServerEnvironment => {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new HttpError(503, `${serviceName} is not configured.`);
  }
  return { supabaseUrl, supabaseServiceRoleKey };
};

export const createServerSupabase = (serviceName: string): SupabaseClient => {
  const environment = readServerEnvironment(serviceName);
  return createClient(environment.supabaseUrl, environment.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
};
