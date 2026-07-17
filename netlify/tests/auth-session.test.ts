import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { handler } from "../functions/auth-session";
import { readSiteSession } from "../lib/siteSession";

describe("auth-session function", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv(
      "SITE_SESSION_SECRET",
      "test-session-secret-that-is-longer-than-thirty-two-characters",
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires a Lichess login token at the one-time trust boundary", async () => {
    const response = await handler({ httpMethod: "POST" });
    expect(response.statusCode).toBe(401);
  });

  it("verifies Lichess once and issues a signed first-party session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ username: "Actual_Owner" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    mocks.createClient.mockReturnValue({ from });

    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer real_token" },
      // Deliberately unsupported: an attacker cannot select a username.
      body: JSON.stringify({ username: "impersonated-victim" }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ user: { username: "actual_owner" } });
    expect(response.headers["Set-Cookie"]).toContain("atomic_session=");
    expect(response.headers["Set-Cookie"]).toContain("HttpOnly");
    expect(response.headers["Set-Cookie"]).toContain("SameSite=Lax");
    expect(readSiteSession({ cookie: response.headers["Set-Cookie"].split(";")[0] })).toMatchObject(
      { username: "actual_owner" },
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledWith(
      { username: "actual_owner" },
      { onConflict: "username", ignoreDuplicates: true },
    );
    expect(upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ username: "impersonated-victim" }),
      expect.anything(),
    );
  });

  it("still establishes the verified session when user registration is temporarily unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ username: "VerifiedViewer" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    vi.spyOn(globalThis.console, "error").mockImplementation(() => undefined);
    const upsert = vi.fn(async () => ({ error: { message: "database unavailable" } }));
    mocks.createClient.mockReturnValue({ from: () => ({ upsert }) });

    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer real_token" },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ user: { username: "verifiedviewer" } });
    expect(response.headers["Set-Cookie"]).toContain("atomic_session=");
  });

  it("does not touch the database for a rejected token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );

    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer forged_token" },
    });

    expect(response.statusCode).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns a retryable status instead of invalidating login when Lichess rate-limits checks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Promise.resolve(new Response(null, { status: 429, headers: { "Retry-After": "45" } })),
      ),
    );

    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer valid_token" },
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers["Retry-After"]).toBe("45");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("clears the first-party session cookie without contacting Lichess", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler({
      httpMethod: "DELETE",
      headers: { cookie: "atomic_session=old-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["Set-Cookie"]).toContain("Max-Age=0");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-site attempts to establish a session", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: {
        authorization: "Bearer valid_token",
        host: "atomic.example",
        origin: "https://evil.example",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
