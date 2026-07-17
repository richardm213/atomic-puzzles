import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearLichessAccountVerificationCache } from "../lib/lichessAccount";
import {
  clearSiteSessionCookie,
  createSiteSessionCookie,
  createSiteSessionToken,
  isSameOriginRequest,
  readSiteSession,
  resolveSiteIdentity,
  SITE_SESSION_MAX_AGE_SECONDS,
  verifySiteSessionToken,
} from "../lib/siteSession";

const currentSecret = "current-session-secret-that-is-at-least-32-characters-long";
const previousSecret = "previous-session-secret-that-is-at-least-32-characters";

describe("signed site sessions", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_SESSION_SECRET", currentSecret);
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    clearLichessAccountVerificationCache();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("round-trips a normalized identity for 30 days", () => {
    const now = Date.UTC(2026, 6, 17);
    const token = createSiteSessionToken("SavedViewer", now);

    expect(verifySiteSessionToken(token, now + 1_000)).toEqual({
      username: "savedviewer",
      issuedAt: Math.floor(now / 1000),
      expiresAt: Math.floor(now / 1000) + SITE_SESSION_MAX_AGE_SECONDS,
    });
  });

  it("rejects payload and signature tampering", () => {
    const token = createSiteSessionToken("viewer");
    const [payload, signature] = token.split(".");

    expect(verifySiteSessionToken(`${payload}x.${signature}`)).toBeNull();
    expect(verifySiteSessionToken(`${payload}.${signature}x`)).toBeNull();
  });

  it("rejects expired sessions", () => {
    const now = Date.UTC(2026, 6, 17);
    const token = createSiteSessionToken("viewer", now);

    expect(verifySiteSessionToken(token, now + SITE_SESSION_MAX_AGE_SECONDS * 1000)).toBeNull();
  });

  it("accepts a previous signing key during key rotation", () => {
    vi.stubEnv("SITE_SESSION_SECRET", previousSecret);
    const token = createSiteSessionToken("viewer");
    vi.stubEnv("SITE_SESSION_SECRET", currentSecret);
    vi.stubEnv("SITE_SESSION_PREVIOUS_SECRETS", previousSecret);

    expect(verifySiteSessionToken(token)).toMatchObject({ username: "viewer" });
  });

  it("creates a production cookie with browser security attributes", () => {
    const cookie = createSiteSessionCookie("viewer", {
      "x-forwarded-proto": "https",
      host: "atomic.example",
    });

    expect(cookie).toContain("__Host-atomic_session=");
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("reads the cookie without exposing its contents to browser JavaScript", () => {
    const cookie = createSiteSessionCookie("viewer", { "x-forwarded-proto": "https" });

    expect(
      readSiteSession({ cookie: cookie.split(";")[0], "x-forwarded-proto": "https" }),
    ).toMatchObject({ username: "viewer" });
  });

  it("uses the signed cookie locally even if a legacy bearer token is also present", async () => {
    const cookie = createSiteSessionCookie("CookieViewer", {});
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      resolveSiteIdentity({
        cookie: cookie.split(";")[0],
        authorization: "Bearer legacy_token",
      }),
    ).resolves.toEqual({
      username: "cookieviewer",
      setCookie: "",
      hadBearerToken: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a missing or invalid site session as anonymous", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(resolveSiteIdentity(undefined)).resolves.toEqual({
      username: null,
      setCookie: "",
      hadBearerToken: false,
    });
    await expect(resolveSiteIdentity({ cookie: "atomic_session=tampered" })).resolves.toEqual({
      username: null,
      setCookie: "",
      hadBearerToken: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("converts one pre-release bearer session into a signed cookie", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ username: "LegacyViewer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const identity = await resolveSiteIdentity({ authorization: "Bearer legacy_token" });

    expect(identity).toMatchObject({ username: "legacyviewer", hadBearerToken: true });
    expect(identity.setCookie).toContain("atomic_session=");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("clears the same secure cookie during logout", () => {
    const cleared = clearSiteSessionCookie({
      cookie: "__Host-atomic_session=token",
      "x-forwarded-proto": "https",
    });

    expect(cleared).toContain("__Host-atomic_session=");
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  });

  it("accepts same-origin mutations and rejects cross-site origins", () => {
    expect(isSameOriginRequest({ origin: "https://atomic.example", host: "atomic.example" })).toBe(
      true,
    );
    expect(isSameOriginRequest({ origin: "https://evil.example", host: "atomic.example" })).toBe(
      false,
    );
    expect(isSameOriginRequest({ host: "atomic.example" })).toBe(true);
  });
});
