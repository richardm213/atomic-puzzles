const LICHESS_HOST = "https://lichess.org";

const STORAGE_KEYS = {
  pendingAuth: "atomic-puzzles.lichess-pending-auth",
  postLoginRedirect: "atomic-puzzles.post-login-redirect",
  session: "atomic-puzzles.lichess-session",
};

const textEncoder = new window.TextEncoder();

const getBasePath = () => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  if (baseUrl === "/") return "";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
};

const getClientId = () =>
  import.meta.env.VITE_LICHESS_CLIENT_ID?.trim() || window.location.host;

const getRequestedScope = () => import.meta.env.VITE_LICHESS_OAUTH_SCOPE?.trim() || "";

const getRedirectUri = () => `${window.location.origin}${getBasePath()}/auth/lichess/callback`;
const getHomePath = () => `${getBasePath() || ""}/`;

const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
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

const toBase64Url = (value) =>
  window
    .btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const randomString = (byteLength = 64) => {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return toBase64Url(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
};

const sha256 = async (value) => {
  const digest = await window.crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return new Uint8Array(digest);
};

const createCodeChallenge = async (codeVerifier) => {
  const digest = await sha256(codeVerifier);
  return toBase64Url(Array.from(digest, (byte) => String.fromCharCode(byte)).join(""));
};

const parseStoredJson = (key) => {
  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : null;
  } catch {
    return null;
  }
};

const clearPendingAuthState = () => {
  window.localStorage.removeItem(STORAGE_KEYS.pendingAuth);
};

const getPendingAuthState = () => parseStoredJson(STORAGE_KEYS.pendingAuth);

export const getStoredPostLoginRedirect = () => {
  const storedValue = window.localStorage.getItem(STORAGE_KEYS.postLoginRedirect);
  return storedValue || getHomePath();
};

export const setStoredPostLoginRedirect = (path) => {
  window.localStorage.setItem(STORAGE_KEYS.postLoginRedirect, path || getHomePath());
};

export const clearStoredPostLoginRedirect = () => {
  window.localStorage.removeItem(STORAGE_KEYS.postLoginRedirect);
};

export const getStoredLichessSession = () => parseStoredJson(STORAGE_KEYS.session);

export const clearStoredLichessSession = () => {
  window.localStorage.removeItem(STORAGE_KEYS.session);
};

export const startLichessLogin = async (returnTo) => {
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

const fetchJson = async (input, init, timeoutMessage = "Request timed out.") => {
  const response = await withTimeout(window.fetch(input, init), 15000, timeoutMessage);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : null;
  return { response, body };
};

export const fetchLichessAccount = async (accessToken) => {
  const { response, body } = await fetchJson(
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
    throw new Error(body?.error || "Unable to load Lichess account.");
  }

  return body;
};

export const restoreLichessSession = async () => {
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

export const completeLichessLogin = async (search) => {
  const params = new window.URLSearchParams(search);
  const returnedState = params.get("state") || "";
  const code = params.get("code") || "";
  const error = params.get("error") || "";
  const errorDescription = params.get("error_description") || "";
  const pendingAuth = getPendingAuthState();
  const expectedState = pendingAuth?.state || "";
  const codeVerifier = pendingAuth?.codeVerifier || "";
  const returnTo = pendingAuth?.returnTo || getHomePath();

  if (error) {
    clearPendingAuthState();
    throw new Error(errorDescription || error);
  }

  if (!code || !returnedState || !expectedState || returnedState !== expectedState || !codeVerifier) {
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
  const { response, body: tokenBody } = await fetchJson(
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
    throw new Error(tokenBody?.error_description || tokenBody?.error || "Lichess login failed.");
  }

  const expiresInMs = Number(tokenBody.expires_in || 0) * 1000;
  const expiresAt = Date.now() + expiresInMs;
  const me = await fetchLichessAccount(tokenBody.access_token);
  const session = {
    accessToken: tokenBody.access_token,
    expiresAt,
    me,
  };
  window.localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));

  return { session, returnTo };
};

export const getLichessAuthDebugSnapshot = () => {
  const pendingAuth = getPendingAuthState();
  const session = getStoredLichessSession();
  return {
    hasPendingAuth: Boolean(pendingAuth),
    pendingReturnTo: pendingAuth?.returnTo || "",
    hasSession: Boolean(session?.accessToken),
    redirectUri: getRedirectUri(),
    clientId: getClientId(),
  };
};

export const revokeLichessSession = async (accessToken) => {
  if (!accessToken) return;

  await window.fetch(`${LICHESS_HOST}/api/token`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
};
