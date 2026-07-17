import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { handler } from "../functions/auth-session";
import { createSiteSessionCookie, readSiteSession } from "../lib/siteSession";

const verifier = "v".repeat(64);
const loginEvent = {
  httpMethod: "POST",
  headers: { host: "atomic.example", origin: "https://atomic.example" },
  body: JSON.stringify({
    code: "fresh_code",
    codeVerifier: verifier,
    clientId: "atomic.example",
    redirectUri: "https://atomic.example/auth/lichess/callback",
  }),
};

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

  it("requires a valid server-side OAuth exchange", async () => {
    const response = await handler({ httpMethod: "POST" });
    expect(response.statusCode).toBe(400);
  });

  it("leaves client-id and redirect binding to Lichess", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/token") && init?.method === "POST") {
        expect(String(init.body)).toContain("client_id=registered-client");
        expect(String(init.body)).toContain(
          "redirect_uri=https%3A%2F%2Flogin.example%2Fauth%2Flichess%2Fcallback",
        );
        return new Response(JSON.stringify({ access_token: "bound-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/account")) {
        return new Response(JSON.stringify({ username: "Bound_User" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);
    mocks.createClient.mockReturnValue({
      from: () => ({ upsert: vi.fn(async () => ({ error: null })) }),
    });

    const response = await handler({
      ...loginEvent,
      body: JSON.stringify({
        code: "fresh_code",
        codeVerifier: verifier,
        clientId: "registered-client",
        redirectUri: "https://login.example/auth/lichess/callback",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ user: { username: "bound_user" } });
  });

  it("exchanges the code server-side, verifies Lichess, revokes the token, and issues a signed cookie", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/token") && init?.method === "POST") {
        return new Response(JSON.stringify({ access_token: "secret_token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/account")) {
        return new Response(JSON.stringify({ username: "Actual_Owner" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const upsert = vi.fn(async () => ({ error: null }));
    mocks.createClient.mockReturnValue({ from: () => ({ upsert }) });

    const response = await handler(loginEvent);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ user: { username: "actual_owner" } });
    expect(response.body).not.toContain("secret_token");
    expect(response.headers["Set-Cookie"]).toContain("atomic_session=");
    expect(response.headers["Set-Cookie"]).toContain("HttpOnly");
    expect(response.headers["Set-Cookie"]).toContain("SameSite=Lax");
    expect(readSiteSession({ cookie: response.headers["Set-Cookie"].split(";")[0] })).toMatchObject(
      {
        username: "actual_owner",
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://lichess.org/api/token");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://lichess.org/api/account");
    expect(fetchMock.mock.calls[2]).toEqual([
      "https://lichess.org/api/token",
      expect.objectContaining({
        method: "DELETE",
        headers: { Authorization: "Bearer secret_token" },
      }),
    ]);
    expect(upsert).toHaveBeenCalledWith(
      { username: "actual_owner" },
      { onConflict: "username", ignoreDuplicates: true },
    );
  });

  it("accepts the bearer-token callback used by the deployed browser bundle", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://lichess.org/api/account");
      return new Response(JSON.stringify({ username: "Cached_Client" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const upsert = vi.fn(async () => ({ error: null }));
    mocks.createClient.mockReturnValue({ from: () => ({ upsert }) });

    const response = await handler({
      httpMethod: "POST",
      headers: {
        host: "atomic.example",
        origin: "https://atomic.example",
        authorization: "Bearer deployed_browser_token",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ user: { username: "cached_client" } });
    expect(response.headers["Set-Cookie"]).toContain("atomic_session=");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("hydrates browser identity only from the signed cookie", async () => {
    const cookie = createSiteSessionCookie("CookieViewer", { host: "atomic.example" }).split(
      ";",
    )[0];

    const response = await handler({ httpMethod: "GET", headers: { cookie } });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ user: { username: "cookieviewer" } });
  });

  it("returns anonymous when the signed cookie is absent", async () => {
    const response = await handler({ httpMethod: "GET" });
    expect(response.statusCode).toBe(401);
  });

  it("does not touch the database when Lichess rejects the authorization code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "invalid_grant" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const response = await handler(loginEvent);

    expect(response.statusCode).not.toBe(200);
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

  it("rejects cross-site attempts before exchanging a code", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler({
      ...loginEvent,
      headers: { host: "atomic.example", origin: "https://evil.example" },
    });

    expect(response.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
