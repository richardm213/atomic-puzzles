import { z } from "zod";

import { appAssetPath } from "../../utils/appAssetPath";

const LICHESS_HOST = "https://lichess.org";

export const LICHESS_SESSION_INVALID_EVENT = "atomic-puzzles:lichess-session-invalid";
// Kept only so new releases can delete credentials persisted by older releases.
export const LICHESS_SESSION_STORAGE_KEY = "atomic-puzzles.lichess-session";

const STORAGE_KEYS = {
  pendingAuth: "atomic-puzzles.lichess-pending-auth",
  postLoginRedirect: "atomic-puzzles.post-login-redirect",
  legacySession: LICHESS_SESSION_STORAGE_KEY,
};

export type LichessAccount = {
  username: string;
  [key: string]: unknown;
};

export type LichessSession = { me: LichessAccount };

type PendingAuthState = {
  state: string;
  codeVerifier: string;
  returnTo: string;
  createdAt?: number;
};

export type LichessAuthErrorCode =
  | "authorization_denied"
  | "invalid_callback"
  | "stale_callback"
  | "code_rejected"
  | "token_exchange_failed"
  | "account_rate_limited"
  | "account_load_failed";

export class LichessAuthError extends Error {
  readonly code: LichessAuthErrorCode;
  readonly canRetryCallback: boolean;
  readonly retryAfterMs: number;

  constructor(
    code: LichessAuthErrorCode,
    message: string,
    canRetryCallback = false,
    retryAfterMs = 0,
  ) {
    super(message);
    this.name = "LichessAuthError";
    this.code = code;
    this.canRetryCallback = canRetryCallback;
    this.retryAfterMs = retryAfterMs;
  }
}

const lichessAccountSchema = z
  .object({ username: z.string().trim().min(1).max(100) })
  .passthrough();
const siteSessionResponseSchema = z.object({
  user: lichessAccountSchema.optional(),
  error: z.string().optional(),
});

const textEncoder = new window.TextEncoder();
const PENDING_AUTH_MAX_AGE_MS = 15 * 60 * 1000;
const LICHESS_CREDENTIAL_PATTERN = /^[A-Za-z0-9_]+$/;
const MAX_LICHESS_CREDENTIAL_LENGTH = 512;

const isValidLichessCredential = (value: string): boolean =>
  value.length > 0 &&
  value.length <= MAX_LICHESS_CREDENTIAL_LENGTH &&
  LICHESS_CREDENTIAL_PATTERN.test(value);

const getBasePath = (): string => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  if (baseUrl === "/") return "";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
};

const getClientId = (): string =>
  import.meta.env.VITE_LICHESS_CLIENT_ID?.trim() || window.location.host;
const getRedirectUri = (): string =>
  `${window.location.origin}${getBasePath()}/auth/lichess/callback`;
const getHomePath = (): string => `${getBasePath()}/`;

const getSafeReturnTo = (value: string | null | undefined): string => {
  const requestedPath = String(value || "").trim();
  if (!requestedPath.startsWith("/") || requestedPath.startsWith("//")) return getHomePath();
  try {
    const requestedUrl = new URL(requestedPath, window.location.origin);
    if (requestedUrl.origin !== window.location.origin) return getHomePath();
    if (requestedUrl.pathname === `${getBasePath()}/auth/lichess/callback`) return getHomePath();
    return `${requestedUrl.pathname}${requestedUrl.search}${requestedUrl.hash}`;
  } catch {
    return getHomePath();
  }
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> => {
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
};

const fetchJson = async (
  input: RequestInfo,
  init?: RequestInit,
  timeoutMessage = "Request timed out.",
): Promise<{ response: Response; body: unknown | null }> => {
  const response = await withTimeout(window.fetch(input, init), 15_000, timeoutMessage);
  const contentType = response.headers.get("content-type") ?? "";
  return {
    response,
    body: contentType.includes("application/json") ? await response.json() : null,
  };
};

const toBase64Url = (value: string): string =>
  window.btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const randomString = (byteLength = 64): string => {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return toBase64Url(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
};

const createCodeChallenge = async (codeVerifier: string): Promise<string> => {
  const digest = await window.crypto.subtle.digest("SHA-256", textEncoder.encode(codeVerifier));
  return toBase64Url(
    Array.from(new Uint8Array(digest), (byte) => String.fromCharCode(byte)).join(""),
  );
};

const parseStoredJson = <T>(storage: Storage, key: string): T | null => {
  try {
    const rawValue = storage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : null;
  } catch {
    return null;
  }
};

const clearPendingAuthState = (): void => {
  window.sessionStorage.removeItem(STORAGE_KEYS.pendingAuth);
  window.localStorage.removeItem(STORAGE_KEYS.pendingAuth);
};

const getPendingAuthState = (): PendingAuthState | null =>
  parseStoredJson<PendingAuthState>(window.sessionStorage, STORAGE_KEYS.pendingAuth);

export const getStoredPostLoginRedirect = (): string =>
  getSafeReturnTo(window.sessionStorage.getItem(STORAGE_KEYS.postLoginRedirect));

export const setStoredPostLoginRedirect = (path: string): void => {
  window.sessionStorage.setItem(STORAGE_KEYS.postLoginRedirect, getSafeReturnTo(path));
  window.localStorage.removeItem(STORAGE_KEYS.postLoginRedirect);
};

export const clearStoredPostLoginRedirect = (): void => {
  window.sessionStorage.removeItem(STORAGE_KEYS.postLoginRedirect);
  window.localStorage.removeItem(STORAGE_KEYS.postLoginRedirect);
};

export const clearStoredLichessSession = (): void => {
  window.sessionStorage.removeItem(STORAGE_KEYS.legacySession);
  window.localStorage.removeItem(STORAGE_KEYS.legacySession);
};

export const invalidateLichessSessionForResponse = (
  response: Response,
  _legacyAccessToken = "",
): void => {
  if (response.status !== 401) return;
  clearStoredLichessSession();
  window.dispatchEvent(new Event(LICHESS_SESSION_INVALID_EVENT));
};

export const startLichessLogin = async (returnTo?: string): Promise<void> => {
  const nextReturnTo = getSafeReturnTo(
    returnTo || `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
  const state = randomString(24);
  const codeVerifier = randomString(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const params = new window.URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    state,
  });
  window.sessionStorage.setItem(
    STORAGE_KEYS.pendingAuth,
    JSON.stringify({ state, codeVerifier, returnTo: nextReturnTo, createdAt: Date.now() }),
  );
  setStoredPostLoginRedirect(nextReturnTo);
  window.location.assign(`${LICHESS_HOST}/oauth?${params.toString()}`);
};

const readSessionResponse = (rawBody: unknown): LichessAccount | null => {
  const result = siteSessionResponseSchema.safeParse(rawBody);
  return result.success && result.data.user?.username ? result.data.user : null;
};

export const restoreLichessSession = async (): Promise<LichessSession | null> => {
  clearStoredLichessSession();
  const { response, body } = await fetchJson(
    appAssetPath("/api/auth/session"),
    { method: "GET", credentials: "same-origin" },
    "Timed out while restoring your site session.",
  );
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Unable to restore your site session.");
  const me = readSessionResponse(body);
  if (!me) throw new Error("The site session service returned incomplete account information.");
  return { me };
};

const establishSiteSession = async (
  code: string,
  codeVerifier: string,
): Promise<LichessAccount> => {
  const { response, body: rawBody } = await fetchJson(
    appAssetPath("/api/auth/session"),
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        codeVerifier,
        clientId: getClientId(),
        redirectUri: getRedirectUri(),
      }),
    },
    "Timed out while establishing your site session.",
  );
  const parsedBody = siteSessionResponseSchema.safeParse(rawBody);
  const errorMessage = parsedBody.success ? parsedBody.data.error : undefined;
  if (!response.ok) {
    const code = response.status === 429 ? "account_rate_limited" : "code_rejected";
    throw new LichessAuthError(
      code,
      errorMessage ?? "Unable to establish your site session. Start a fresh login.",
      false,
    );
  }
  const me = readSessionResponse(rawBody);
  if (!me) throw new Error("The site session service returned incomplete account information.");
  return me;
};

export const completeLichessLogin = async (
  search: string,
): Promise<{ session: LichessSession; returnTo: string }> => {
  const params = new window.URLSearchParams(search);
  const returnedState = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  const error = params.get("error") ?? "";
  const errorDescription = params.get("error_description") ?? "";
  const pendingAuth = getPendingAuthState();
  const returnTo = getSafeReturnTo(pendingAuth?.returnTo);

  if (!pendingAuth?.state || !pendingAuth.codeVerifier) {
    clearPendingAuthState();
    throw new LichessAuthError(
      "stale_callback",
      "This login link is stale or has already been used. Start a new Lichess login.",
    );
  }
  if (
    typeof pendingAuth.createdAt === "number" &&
    Date.now() - pendingAuth.createdAt > PENDING_AUTH_MAX_AGE_MS
  ) {
    clearPendingAuthState();
    throw new LichessAuthError(
      "stale_callback",
      "This login attempt expired. Start a new Lichess login.",
    );
  }
  if (!returnedState || returnedState !== pendingAuth.state) {
    throw new LichessAuthError(
      "invalid_callback",
      "This login response does not match the login that was started in this browser.",
    );
  }
  if (error) {
    clearPendingAuthState();
    throw new LichessAuthError(
      "authorization_denied",
      errorDescription || "Lichess authorization was cancelled.",
    );
  }
  if (!isValidLichessCredential(code)) {
    throw new LichessAuthError(
      "invalid_callback",
      "The Lichess callback contains an invalid authorization code.",
    );
  }

  try {
    const me = await establishSiteSession(code, pendingAuth.codeVerifier);
    clearPendingAuthState();
    clearStoredLichessSession();
    return { session: { me }, returnTo };
  } catch (loginError) {
    clearPendingAuthState();
    if (loginError instanceof LichessAuthError) throw loginError;
    throw new LichessAuthError(
      "account_load_failed",
      loginError instanceof Error ? loginError.message : "Unable to finish Lichess login.",
    );
  }
};

// Older callers may still invoke this during a rolling deployment. The OAuth
// token is now revoked server-side before the browser receives a session.
export const revokeLichessSession = async (): Promise<void> => Promise.resolve();
