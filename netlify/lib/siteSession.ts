import { createHmac, timingSafeEqual } from "node:crypto";

import {
  getRequestHeader,
  parseBearerToken,
  type RequestHeaders,
  verifyCachedLichessAccount,
} from "./lichessAccount";

export const SITE_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const SECURE_COOKIE_NAME = "__Host-atomic_session";
const LOCAL_COOKIE_NAME = "atomic_session";
const USERNAME_PATTERN = /^[a-z0-9_-]{1,100}$/i;

export type SiteSession = {
  username: string;
  issuedAt: number;
  expiresAt: number;
};

type SiteSessionPayload = {
  v: 1;
  sub: string;
  iat: number;
  exp: number;
};

const getSigningSecrets = (): string[] => {
  const current =
    process.env.SITE_SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  const previous = (process.env.SITE_SESSION_PREVIOUS_SECRETS ?? "")
    .split(",")
    .map((secret) => secret.trim())
    .filter(Boolean);
  if (current.length < 32) {
    throw new Error("SITE_SESSION_SECRET must contain at least 32 characters.");
  }
  return [current, ...previous.filter((secret) => secret.length >= 32)];
};

const encode = (value: string): string => Buffer.from(value, "utf8").toString("base64url");

const sign = (encodedPayload: string, secret: string): string =>
  createHmac("sha256", secret).update(encodedPayload).digest("base64url");

const signaturesMatch = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const isSecureRequest = (headers: RequestHeaders | undefined): boolean =>
  getRequestHeader(headers, "x-forwarded-proto").split(",")[0]?.trim() === "https" ||
  process.env.NODE_ENV === "production";

const getCookieName = (headers: RequestHeaders | undefined): string =>
  isSecureRequest(headers) ? SECURE_COOKIE_NAME : LOCAL_COOKIE_NAME;

const parseCookies = (headers: RequestHeaders | undefined): Map<string, string> => {
  const cookies = new Map<string, string>();
  for (const part of getRequestHeader(headers, "cookie").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name && value) cookies.set(name, value);
  }
  return cookies;
};

export const createSiteSessionToken = (username: string, now = Date.now()): string => {
  const normalizedUsername = username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(normalizedUsername)) throw new Error("Invalid site-session username.");
  const issuedAt = Math.floor(now / 1000);
  const payload: SiteSessionPayload = {
    v: 1,
    sub: normalizedUsername,
    iat: issuedAt,
    exp: issuedAt + SITE_SESSION_MAX_AGE_SECONDS,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, getSigningSecrets()[0]!)}`;
};

export const verifySiteSessionToken = (token: string, now = Date.now()): SiteSession | null => {
  const [encodedPayload, signature, ...extra] = token.split(".");
  if (!encodedPayload || !signature || extra.length) return null;

  let signatureValid = false;
  try {
    signatureValid = getSigningSecrets().some((secret) =>
      signaturesMatch(signature, sign(encodedPayload, secret)),
    );
  } catch {
    return null;
  }
  if (!signatureValid) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SiteSessionPayload>;
    const nowSeconds = Math.floor(now / 1000);
    if (
      payload.v !== 1 ||
      typeof payload.sub !== "string" ||
      !USERNAME_PATTERN.test(payload.sub) ||
      !Number.isSafeInteger(payload.iat) ||
      !Number.isSafeInteger(payload.exp) ||
      payload.iat! > nowSeconds + 60 ||
      payload.exp! <= nowSeconds ||
      payload.exp! - payload.iat! > SITE_SESSION_MAX_AGE_SECONDS
    ) {
      return null;
    }
    return {
      username: payload.sub.toLowerCase(),
      issuedAt: payload.iat!,
      expiresAt: payload.exp!,
    };
  } catch {
    return null;
  }
};

export const readSiteSession = (headers: RequestHeaders | undefined): SiteSession | null => {
  const cookies = parseCookies(headers);
  const token = cookies.get(getCookieName(headers)) ?? "";
  return token ? verifySiteSessionToken(token) : null;
};

export const resolveSiteIdentity = async (
  headers: RequestHeaders | undefined,
): Promise<{ username: string | null; setCookie: string; hadBearerToken: boolean }> => {
  const siteSession = readSiteSession(headers);
  if (siteSession) {
    return { username: siteSession.username, setCookie: "", hadBearerToken: false };
  }

  const accessToken = parseBearerToken(headers);
  if (!accessToken) return { username: null, setCookie: "", hadBearerToken: false };

  const account = await verifyCachedLichessAccount(accessToken);
  const username = account?.username?.trim().toLowerCase() ?? "";
  return {
    username: username || null,
    setCookie: username ? createSiteSessionCookie(username, headers) : "",
    hadBearerToken: true,
  };
};

export const createSiteSessionCookie = (
  username: string,
  headers: RequestHeaders | undefined,
): string => {
  const secure = isSecureRequest(headers);
  return [
    `${getCookieName(headers)}=${createSiteSessionToken(username)}`,
    "Path=/",
    `Max-Age=${SITE_SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    secure ? "Secure" : "",
    "SameSite=Lax",
  ]
    .filter(Boolean)
    .join("; ");
};

export const clearSiteSessionCookie = (headers: RequestHeaders | undefined): string => {
  const secure = isSecureRequest(headers);
  return [
    `${getCookieName(headers)}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    secure ? "Secure" : "",
    "SameSite=Lax",
  ]
    .filter(Boolean)
    .join("; ");
};

export const isSameOriginRequest = (headers: RequestHeaders | undefined): boolean => {
  const origin = getRequestHeader(headers, "origin").trim();
  if (!origin) return true;
  const host = (getRequestHeader(headers, "x-forwarded-host") || getRequestHeader(headers, "host"))
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
};
