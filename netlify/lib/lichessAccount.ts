import { createHash } from "node:crypto";

export type RequestHeaders = Record<string, string | undefined>;

export type LichessAccount = {
  username?: string;
  id?: string;
};

export class LichessVerificationError extends Error {
  readonly status: number;
  readonly retryAfter: string;

  constructor(status: number, message: string, retryAfter = "") {
    super(message);
    this.name = "LichessVerificationError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

type CachedAccount = {
  account: LichessAccount | null;
  expiresAt: number;
};

const ACCOUNT_CACHE_TTL_MS = 60_000;
const INVALID_TOKEN_CACHE_TTL_MS = 5_000;
const accountCache = new Map<string, CachedAccount>();
const pendingVerifications = new Map<string, Promise<LichessAccount | null>>();
const LICHESS_TOKEN_PATTERN = /^[A-Za-z0-9_]{1,512}$/;

const accessTokenCacheKey = (accessToken: string): string =>
  createHash("sha256").update(accessToken).digest("base64url");

export const getRequestHeader = (headers: RequestHeaders | undefined, name: string): string => {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === lowerName && value) return value;
  }
  return "";
};

export const parseBearerToken = (headers: RequestHeaders | undefined): string => {
  const authorization = getRequestHeader(headers, "authorization");
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  return LICHESS_TOKEN_PATTERN.test(accessToken) ? accessToken : "";
};

export const verifyLichessAccount = async (accessToken: string): Promise<LichessAccount | null> => {
  if (!accessToken) return null;
  const response = await fetch("https://lichess.org/api/account", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new LichessVerificationError(
      response.status,
      response.status === 429
        ? "Lichess is temporarily limiting account checks."
        : "Lichess account verification is temporarily unavailable.",
      response.headers.get("retry-after") ?? "",
    );
  }

  const account = (await response.json()) as LichessAccount;
  return account?.username ? account : null;
};

export const verifyCachedLichessAccount = async (
  accessToken: string,
): Promise<LichessAccount | null> => {
  if (!accessToken) return null;

  const cacheKey = accessTokenCacheKey(accessToken);
  const cached = accountCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.account;
  if (cached) accountCache.delete(cacheKey);

  const pending = pendingVerifications.get(cacheKey);
  if (pending) return pending;

  const verification = verifyLichessAccount(accessToken).then((account) => {
    accountCache.set(cacheKey, {
      account,
      expiresAt: Date.now() + (account ? ACCOUNT_CACHE_TTL_MS : INVALID_TOKEN_CACHE_TTL_MS),
    });
    return account;
  });

  pendingVerifications.set(cacheKey, verification);
  try {
    return await verification;
  } finally {
    pendingVerifications.delete(cacheKey);
  }
};

export const clearLichessAccountVerificationCache = (): void => {
  accountCache.clear();
  pendingVerifications.clear();
};
