import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { handler } from "../functions/puzzle-tags";
import { createSiteSessionCookie } from "../lib/siteSession";

const authHeaders = (username: string) => ({
  cookie: createSiteSessionCookie(username, {}).split(";")[0],
});

describe("puzzle-tags function", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv(
      "SITE_SESSION_SECRET",
      "test-session-secret-that-is-longer-than-thirty-two-characters",
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("rejects users other than seaside_tiramisu", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("someone_else"),
      body: JSON.stringify({ puzzleId: 42, tags: ["fork"] }),
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects unknown or duplicate tags", async () => {
    for (const tags of [["unknown"], ["fork", "fork"]]) {
      const response = await handler({
        httpMethod: "POST",
        headers: authHeaders("seaside_tiramisu"),
        body: JSON.stringify({ puzzleId: 42, tags }),
      });
      expect(response.statusCode).toBe(400);
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("updates any number of valid tags through the service role", async () => {
    const tags = ["fork", "pin", "tempo"];
    const single = vi.fn(async () => ({ data: { id: 42, tags }, error: null }));
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    mocks.createClient.mockReturnValue({ from });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("seaside_tiramisu"),
      body: JSON.stringify({ puzzleId: 42, tags }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ puzzleId: 42, tags });
    expect(from).toHaveBeenCalledWith("puzzles");
    expect(update).toHaveBeenCalledWith({ tags });
    expect(eq).toHaveBeenCalledWith("id", 42);
  });
});
