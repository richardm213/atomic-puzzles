const LICHESS_HOST = "https://lichess.org";

export const LICHESS_SESSION_INVALID_EVENT = "atomic-puzzles:lichess-session-invalid";
export const LICHESS_SESSION_STORAGE_KEY = "atomic-puzzles.lichess-session";

const STORAGE_KEYS = {
  pendingAuth: "atomic-puzzles.lichess-pending-auth",
  postLoginRedirect: "atomic-puzzles.post-login-redirect",
  session: LICHESS_SESSION_STORAGE_KEY,
};

export type LichessAccount = {
  username: string;
  [key: string]: unknown;
};

export type LichessSession = {
  accessToken: string;
  expiresAt: number | null;
  me: LichessAccount;
};

type PendingAuthState = {
  state: string;
  codeVerifier: string;
  returnTo: string;
  createdAt?: number;
  exchangedAccessToken?: string;
  exchangedExpiresAt?: number | null;
};

export type LichessAuthErrorCode =
  | "authorization_denied"
  | "invalid_callback"
  | "stale_callback"
  | "code_rejected"
  | "token_exchange_failed"
  | "account_load_failed";

export class LichessAuthError extends Error {
  readonly code: LichessAuthErrorCode;
  readonly canRetryCallback: boolean;

  constructor(code: LichessAuthErrorCode, message: string, canRetryCallback = false) {
    super(message);
    this.name = "LichessAuthError";
    this.code = code;
    this.canRetryCallback = canRetryCallback;
  }
}

type LichessTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

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

const getRedirectUri = (): string => `${window.location.origin}${getBasePath()}/auth/lichess/callback`;
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
    timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
};

const toBase64Url = (value: string): string =>
  window.btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const randomString = (byteLength = 64): string => {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return toBase64Url(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
};

const sha256 = async (value: string): Promise<Uint8Array> => {
  const digest = await window.crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return new Uint8Array(digest);
};

const createCodeChallenge = async (codeVerifier: string): Promise<string> => {
  const digest = await sha256(codeVerifier);
  return toBase64Url(Array.from(digest, (byte) => String.fromCharCode(byte)).join(""));
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

const getPendingAuthState = (): PendingAuthState | null => {
  const current = parseStoredJson<PendingAuthState>(
    window.sessionStorage,
    STORAGE_KEYS.pendingAuth,
  );
  if (current) return current;

  // One-time compatibility for OAuth attempts started before pending PKCE
  // secrets moved from persistent local storage to tab-scoped session storage.
  const legacy = parseStoredJson<PendingAuthState>(window.localStorage, STORAGE_KEYS.pendingAuth);
  if (legacy) {
    window.sessionStorage.setItem(STORAGE_KEYS.pendingAuth, JSON.stringify(legacy));
    window.localStorage.removeItem(STORAGE_KEYS.pendingAuth);
  }
  return legacy;
};

export const getStoredPostLoginRedirect = (): string => {
  const storedValue =
    window.sessionStorage.getItem(STORAGE_KEYS.postLoginRedirect) ??
    window.localStorage.getItem(STORAGE_KEYS.postLoginRedirect);
  return getSafeReturnTo(storedValue);
};

export const setStoredPostLoginRedirect = (path: string): void => {
  window.sessionStorage.setItem(STORAGE_KEYS.postLoginRedirect, getSafeReturnTo(path));
  window.localStorage.removeItem(STORAGE_KEYS.postLoginRedirect);
};

export const clearStoredPostLoginRedirect = (): void => {
  window.sessionStorage.removeItem(STORAGE_KEYS.postLoginRedirect);
  window.localStorage.removeItem(STORAGE_KEYS.postLoginRedirect);
};

const getStoredLichessSession = (): LichessSession | null => {
  const current = parseStoredJson<LichessSession>(window.sessionStorage, STORAGE_KEYS.session);
  if (current) return current;

  // Migrate existing persistent sessions once, then keep bearer tokens scoped
  // to the current browser tab instead of leaving them in persistent storage.
  const legacy = parseStoredJson<LichessSession>(window.localStorage, STORAGE_KEYS.session);
  if (legacy) {
    window.sessionStorage.setItem(STORAGE_KEYS.session, JSON.stringify(legacy));
    window.localStorage.removeItem(STORAGE_KEYS.session);
  }
  return legacy;
};

export const clearStoredLichessSession = (): void => {
  window.sessionStorage.removeItem(STORAGE_KEYS.session);
  window.localStorage.removeItem(STORAGE_KEYS.session);
};

export const invalidateLichessSessionForResponse = (
  response: Response,
  accessToken: string,
): void => {
  if (!accessToken || response.status !== 401) return;
  clearStoredLichessSession();
  window.dispatchEvent(new Event(LICHESS_SESSION_INVALID_EVENT));
};

export const startLichessLogin = async (returnTo?: string): Promise<void> => {
  const nextReturnTo =
    getSafeReturnTo(
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
    JSON.stringify({
      state,
      codeVerifier,
      returnTo: nextReturnTo,
      createdAt: Date.now(),
    }),
  );
  setStoredPostLoginRedirect(nextReturnTo);

  window.location.assign(`${LICHESS_HOST}/oauth?${params.toString()}`);
};

const fetchJson = async <TBody = unknown>(
  input: RequestInfo,
  init?: RequestInit,
  timeoutMessage = "Request timed out.",
): Promise<{ response: Response; body: TBody | null }> => {
  const response = await withTimeout(window.fetch(input, init), 15000, timeoutMessage);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? ((await response.json()) as TBody) : null;
  return { response, body };
};

const fetchLichessAccount = async (accessToken: string): Promise<LichessAccount> => {
  const { response, body } = await fetchJson<LichessAccount & { error?: string }>(
    `${LICHESS_HOST}/api/account`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
    "Timed out while loading your Lichess profile.",
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new LichessAuthError(
        "code_rejected",
        "Lichess rejected the new access token. Start a fresh login.",
      );
    }
    throw new Error(body?.error ?? "Unable to load Lichess account.");
  }

  if (!body) {
    throw new Error("Unable to load Lichess account.");
  }
  return body;
};

export const restoreLichessSession = async (): Promise<LichessSession | null> => {
  const session = getStoredLichessSession();
  if (!session?.accessToken || !isValidLichessCredential(session.accessToken)) {
    clearStoredLichessSession();
    return null;
  }

  if (typeof session.expiresAt === "number" && Date.now() >= session.expiresAt) {
    clearStoredLichessSession();
    return null;
  }

  try {
    const me = await fetchLichessAccount(session.accessToken);
    const verifiedSession = { ...session, me };
    window.sessionStorage.setItem(STORAGE_KEYS.session, JSON.stringify(verifiedSession));
    return verifiedSession;
  } catch {
    clearStoredLichessSession();
    return null;
  }
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
  const expectedState = pendingAuth?.state ?? "";
  const codeVerifier = pendingAuth?.codeVerifier ?? "";
  const returnTo = getSafeReturnTo(pendingAuth?.returnTo);

  if (!pendingAuth || !expectedState || !codeVerifier) {
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

  if (!returnedState) {
    throw new LichessAuthError(
      "invalid_callback",
      "The Lichess callback is missing required information. Start a new login.",
    );
  }

  if (returnedState !== expectedState) {
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

  if (!code) {
    throw new LichessAuthError(
      "invalid_callback",
      "The Lichess callback is missing its authorization code. Start a new login.",
    );
  }

  if (!isValidLichessCredential(code)) {
    throw new LichessAuthError(
      "invalid_callback",
      "The Lichess callback contains an invalid authorization code.",
    );
  }

  let accessToken = pendingAuth.exchangedAccessToken ?? "";
  let expiresAt = pendingAuth.exchangedExpiresAt ?? null;

  if (!accessToken) {
    const body = new window.URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: getRedirectUri(),
      client_id: getClientId(),
    });
    let tokenResult: { response: Response; body: LichessTokenResponse | null };
    try {
      tokenResult = await fetchJson<LichessTokenResponse>(
        `${LICHESS_HOST}/api/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body,
        },
        "Timed out while exchanging the Lichess authorization code.",
      );
    } catch (exchangeError) {
      throw new LichessAuthError(
        "token_exchange_failed",
        exchangeError instanceof Error
          ? exchangeError.message
          : "Unable to contact Lichess while finishing login.",
        true,
      );
    }

    const { response, body: tokenBody } = tokenResult;
    if (
      !response.ok ||
      !tokenBody?.access_token ||
      !isValidLichessCredential(tokenBody.access_token)
    ) {
      clearPendingAuthState();
      const rejectedCode = tokenBody?.error === "invalid_grant";
      throw new LichessAuthError(
        rejectedCode ? "code_rejected" : "token_exchange_failed",
        rejectedCode
          ? "This Lichess login code is stale or has already been used. Start a new login."
          : (tokenBody?.error_description ?? tokenBody?.error ?? "Lichess login failed."),
      );
    }

    accessToken = tokenBody.access_token;
    const expiresInSeconds = Number(tokenBody.expires_in);
    expiresAt =
      Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
        ? Date.now() + expiresInSeconds * 1000
        : null;
    window.sessionStorage.setItem(
      STORAGE_KEYS.pendingAuth,
      JSON.stringify({
        ...pendingAuth,
        exchangedAccessToken: accessToken,
        exchangedExpiresAt: expiresAt,
      }),
    );
  }

  let me: LichessAccount;
  try {
    me = await fetchLichessAccount(accessToken);
  } catch (accountError) {
    if (accountError instanceof LichessAuthError) {
      clearPendingAuthState();
      throw accountError;
    }
    throw new LichessAuthError(
      "account_load_failed",
      accountError instanceof Error
        ? accountError.message
        : "Unable to load your Lichess account after login.",
      true,
    );
  }

  const session: LichessSession = {
    accessToken,
    expiresAt,
    me,
  };
  window.sessionStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
  clearPendingAuthState();

  return { session, returnTo };
};

export const getLichessAuthDebugSnapshot = (): {
  hasPendingAuth: boolean;
  pendingReturnTo: string;
  hasSession: boolean;
  redirectUri: string;
  clientId: string;
} => {
  const pendingAuth = getPendingAuthState();
  const session = getStoredLichessSession();
  return {
    hasPendingAuth: Boolean(pendingAuth),
    pendingReturnTo: pendingAuth?.returnTo ?? "",
    hasSession: Boolean(session?.accessToken),
    redirectUri: getRedirectUri(),
    clientId: getClientId(),
  };
};

export const revokeLichessSession = async (accessToken: string | null | undefined): Promise<void> => {
  if (!accessToken) return;

  await window.fetch(`${LICHESS_HOST}/api/token`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
};
