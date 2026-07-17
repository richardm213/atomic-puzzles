import { createClient } from "@supabase/supabase-js";

import {
  getRequestHeader,
  LichessVerificationError,
  verifyLichessAccount,
} from "../lib/lichessAccount";
import {
  clearSiteSessionCookie,
  createSiteSessionCookie,
  isSameOriginRequest,
  readSiteSession,
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

const OAUTH_VALUE_PATTERN = /^[A-Za-z0-9_-]+$/;

const parseOauthExchange = (
  event: NetlifyEvent,
): { code: string; codeVerifier: string; clientId: string; redirectUri: string } | null => {
  try {
    const input = JSON.parse(event.body ?? "") as Record<string, unknown>;
    const code = String(input.code ?? "").trim();
    const codeVerifier = String(input.codeVerifier ?? "").trim();
    const clientId = String(input.clientId ?? "").trim();
    const redirectUri = String(input.redirectUri ?? "").trim();
    const host = (
      getRequestHeader(event.headers, "x-forwarded-host") || getRequestHeader(event.headers, "host")
    )
      .split(",")[0]
      ?.trim()
      .toLowerCase();
    const expectedClientId =
      process.env.LICHESS_CLIENT_ID?.trim() ||
      process.env.VITE_LICHESS_CLIENT_ID?.trim() ||
      host ||
      "";
    const redirect = new URL(redirectUri);
    if (
      !OAUTH_VALUE_PATTERN.test(code) ||
      code.length > 512 ||
      !OAUTH_VALUE_PATTERN.test(codeVerifier) ||
      codeVerifier.length < 43 ||
      codeVerifier.length > 128 ||
      !clientId ||
      clientId !== expectedClientId ||
      !host ||
      redirect.host.toLowerCase() !== host ||
      !redirect.pathname.endsWith("/auth/lichess/callback")
    ) {
      return null;
    }
    return { code, codeVerifier, clientId, redirectUri: redirect.toString() };
  } catch {
    return null;
  }
};

const exchangeLichessCode = async (
  input: NonNullable<ReturnType<typeof parseOauthExchange>>,
): Promise<string> => {
  const response = await fetch("https://lichess.org/api/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    error?: unknown;
    error_description?: unknown;
  } | null;
  const accessToken = String(body?.access_token ?? "").trim();
  if (!response.ok || !OAUTH_VALUE_PATTERN.test(accessToken) || accessToken.length > 512) {
    const description = String(body?.error_description ?? body?.error ?? "").trim();
    throw new Error(description || "Lichess rejected the authorization code.");
  }
  return accessToken;
};

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod === "GET") {
    const session = readSiteSession(event.headers);
    return session
      ? jsonResponse(200, { user: { username: session.username } })
      : jsonResponse(401, { error: "No authenticated site session." });
  }
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

  const oauthExchange = parseOauthExchange(event);
  if (!oauthExchange) return jsonResponse(400, { error: "Invalid Lichess login exchange." });

  try {
    const accessToken = await exchangeLichessCode(oauthExchange);
    let account;
    try {
      // The username is always derived from Lichess. No browser-supplied
      // username is accepted at this trust boundary.
      account = await verifyLichessAccount(accessToken);
    } finally {
      // The token is needed only to prove identity. Revoke it even when account
      // verification fails; the browser never receives it.
      try {
        await fetch("https://lichess.org/api/token", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        // Revocation is best effort, and the token is never persisted locally.
      }
    }
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
