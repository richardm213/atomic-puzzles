import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { handler } from "../functions/auth-session";

describe("auth-session function", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires a bearer token", async () => {
    const response = await handler({ httpMethod: "POST" });
    expect(response.statusCode).toBe(401);
  });

  it("registers only the username that owns the Lichess token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
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
    expect(upsert).toHaveBeenCalledWith(
      { username: "actual_owner" },
      { onConflict: "username", ignoreDuplicates: true },
    );
    expect(upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ username: "impersonated-victim" }),
      expect.anything(),
    );
  });

  it("does not touch the database for a rejected token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));

    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer forged_token" },
    });

    expect(response.statusCode).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
