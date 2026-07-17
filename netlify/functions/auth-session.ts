import { createClient } from "@supabase/supabase-js";

import {
  LichessVerificationError,
  parseBearerToken,
  verifyLichessAccount,
} from "../lib/lichessAccount";
import {
  clearSiteSessionCookie,
  createSiteSessionCookie,
  isSameOriginRequest,
} from "../lib/siteSession";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

const jsonResponse = (
  statusCode: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...headers,
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
  if (event.httpMethod === "DELETE") {
    if (!isSameOriginRequest(event.headers)) {
      return jsonResponse(403, { error: "Cross-site session requests are not allowed." });
    }
    return jsonResponse(
      200,
      { cleared: true },
      { "Set-Cookie": clearSiteSessionCookie(event.headers) },
    );
  }
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed." });
  if (!isSameOriginRequest(event.headers)) {
    return jsonResponse(403, { error: "Cross-site session requests are not allowed." });
  }

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

    // Registration is useful for discovery pages, but a temporary database
    // issue must not invalidate an identity that Lichess already verified.
    try {
      const { error } = await getSupabase()
        .from("users")
        .upsert({ username }, { onConflict: "username", ignoreDuplicates: true });
      if (error) {
        globalThis.console?.error(`Unable to register authenticated user: ${error.message}`);
      }
    } catch (registrationError) {
      globalThis.console?.error(registrationError);
    }

    return jsonResponse(
      200,
      { user: { username } },
      { "Set-Cookie": createSiteSessionCookie(username, event.headers) },
    );
  } catch (error) {
    if (error instanceof LichessVerificationError) {
      return jsonResponse(
        error.status === 429 ? 429 : 503,
        { error: error.message },
        error.retryAfter ? { "Retry-After": error.retryAfter } : {},
      );
    }
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to register authenticated user.",
    });
  }
};
