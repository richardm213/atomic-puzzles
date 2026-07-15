import { createClient } from "@supabase/supabase-js";

import { parseBearerToken, verifyLichessAccount } from "../lib/lichessAccount";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

const jsonResponse = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const getSupabase = () => {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Auth session service is not configured.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
};

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const accessToken = parseBearerToken(event.headers);
  if (!accessToken) return jsonResponse(401, { error: "Log in with Lichess first." });

  try {
    // The username is always derived from Lichess. No browser-supplied
    // username is accepted at this trust boundary.
    const account = await verifyLichessAccount(accessToken);
    const username = account?.username?.trim().toLowerCase() ?? "";
    if (!username || username.length > 100) {
      return jsonResponse(401, { error: "Your Lichess login is no longer valid." });
    }

    const { error } = await getSupabase()
      .from("users")
      .upsert({ username }, { onConflict: "username", ignoreDuplicates: true });
    if (error) throw new Error(`Unable to register authenticated user: ${error.message}`);

    return jsonResponse(200, { user: { username } });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to register authenticated user.",
    });
  }
};
