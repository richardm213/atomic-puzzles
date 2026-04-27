const LICHESS_HOST = "https://lichess.org";

const STORAGE_KEYS = {
  pendingAuth: "atomic-puzzles.lichess-pending-auth",
  postLoginRedirect: "atomic-puzzles.post-login-redirect",
  session: "atomic-puzzles.lichess-session",
};

export type LichessAccount = {
  username: string;
  [key: string]: unknown;
};

export type LichessSession = {
  accessToken: string;
  expiresAt: number;
  me: LichessAccount;
};

type PendingAuthState = {
  state: string;
  codeVerifier: string;
  returnTo: string;
};

type LichessTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

const textEncoder = new window.TextEncoder();

const getBasePath = (): string => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  if (baseUrl === "/") return "";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
};

const getClientId = (): string =>
  import.meta.env.VITE_LICHESS_CLIENT_ID?.trim() || window.location.host;

const getRequestedScope = (): string => import.meta.env.VITE_LICHESS_OAUTH_SCOPE?.trim() ?? "";

const getRedirectUri = (): string => `${window.location.origin}${getBasePath()}/auth/lichess/callback`;
const getHomePath = (): string => `${getBasePath()}/`;

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

const parseStoredJson = <T>(key: string): T | null => {
  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : null;
  } catch {
    return null;
  }
};

const clearPendingAuthState = (): void => {
  window.localStorage.removeItem(STORAGE_KEYS.pendingAuth);
};

const getPendingAuthState = (): PendingAuthState | null =>
  parseStoredJson<PendingAuthState>(STORAGE_KEYS.pendingAuth);

export const getStoredPostLoginRedirect = (): string => {
  const storedValue = window.localStorage.getItem(STORAGE_KEYS.postLoginRedirect);
  return storedValue || getHomePath();
};

export const setStoredPostLoginRedirect = (path: string): void => {
  window.localStorage.setItem(STORAGE_KEYS.postLoginRedirect, path || getHomePath());
};

export const clearStoredPostLoginRedirect = (): void => {
  window.localStorage.removeItem(STORAGE_KEYS.postLoginRedirect);
};

const getStoredLichessSession = (): LichessSession | null =>
  parseStoredJson<LichessSession>(STORAGE_KEYS.session);

export const clearStoredLichessSession = (): void => {
  window.localStorage.removeItem(STORAGE_KEYS.session);
};

export const startLichessLogin = async (returnTo?: string): Promise<void> => {
  const nextReturnTo =
    returnTo || `${window.location.pathname}${window.location.search}${window.location.hash}`;
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
  const scope = getRequestedScope();
  if (scope) {
    params.set("scope", scope);
  }

  window.localStorage.setItem(
    STORAGE_KEYS.pendingAuth,
    JSON.stringify({
      state,
      codeVerifier,
      returnTo: nextReturnTo,
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
    throw new Error(body?.error ?? "Unable to load Lichess account.");
  }

  if (!body) {
    throw new Error("Unable to load Lichess account.");
  }
  return body;
};

export const restoreLichessSession = async (): Promise<LichessSession | null> => {
  const session = getStoredLichessSession();
  if (!session?.accessToken || !session?.expiresAt || !session?.me?.username) {
    clearStoredLichessSession();
    return null;
  }

  if (Date.now() >= session.expiresAt) {
    clearStoredLichessSession();
    return null;
  }

  return session;
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
  const returnTo = pendingAuth?.returnTo ?? getHomePath();

  if (error) {
    clearPendingAuthState();
    throw new Error(errorDescription || error);
  }

  if (
    !code ||
    !returnedState ||
    !expectedState ||
    returnedState !== expectedState ||
    !codeVerifier
  ) {
    clearPendingAuthState();
    throw new Error("Lichess login could not be verified. Please try again.");
  }

  const body = new window.URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: getRedirectUri(),
    client_id: getClientId(),
  });
  const { response, body: tokenBody } = await fetchJson<LichessTokenResponse>(
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

  clearPendingAuthState();

  if (!response.ok || !tokenBody?.access_token) {
    throw new Error(tokenBody?.error_description ?? tokenBody?.error ?? "Lichess login failed.");
  }

  const expiresInMs = Number(tokenBody.expires_in ?? 0) * 1000;
  const expiresAt = Date.now() + expiresInMs;
  const me = await fetchLichessAccount(tokenBody.access_token);
  const session: LichessSession = {
    accessToken: tokenBody.access_token,
    expiresAt,
    me,
  };
  window.localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));

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
