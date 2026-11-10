import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { handler } from "../functions/puzzle-tags";
import { createSiteSessionCookie } from "../lib/siteSession";

const authHeaders = (username: string) => ({
  cookie: createSiteSessionCookie(username, {}).split(";")[0],
});

describe("puzzle tag voting API", () => {
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

  it("does not accept votes without an authenticated voter", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ puzzleId: 42, tag: "fork", vote: 1 }),
    });
    expect(response.statusCode).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects unknown tags and caller-supplied identity or weight", async () => {
    for (const input of [
      { tag: "unknown", vote: 1 },
      { tag: "fork", vote: 1, voter: "admin" },
      { tag: "fork", vote: 1, weight: 3 },
      { tag: "fork", vote: 3 },
    ]) {
      const response = await handler({
        httpMethod: "POST",
        headers: authHeaders("solver"),
        body: JSON.stringify({ puzzleId: 42, ...input }),
      });
      expect(response.statusCode).toBe(400);
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("lets a regular user downvote a motif that is not visible", async () => {
    const votes = [{ tag: "fork", up: 0, down: 1, vote: -1 }];
    const rpc = vi.fn().mockResolvedValue({ data: { votes, coinAward: 0 }, error: null });
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("solver"),
      body: JSON.stringify({ puzzleId: 42, tag: "fork", vote: -1 }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ votes, coinAward: 0 });
    expect(rpc).toHaveBeenCalledWith("cast_rewarded_puzzle_tag_vote", {
      p_puzzle_id: 42,
      p_voter: "solver",
      p_tag: "fork",
      p_vote: -1,
    });
  });

  it("attributes admin writes and reads to admin without awarding coins or requiring an attempt", async () => {
    const votes = [{ tag: "fork", up: 3, down: 0, vote: 1 }];
    const rpc = vi.fn().mockResolvedValue({ data: votes, error: null });
    mocks.createClient.mockReturnValue({ rpc });
    const headers = authHeaders("seaside_tiramisu");

    const saved = await handler({
      httpMethod: "POST",
      headers,
      body: JSON.stringify({ puzzleId: 42, tag: "fork", vote: 1 }),
    });
    expect(saved.statusCode).toBe(200);
    expect(JSON.parse(saved.body)).toEqual({ votes, coinAward: 0 });
    expect(rpc).toHaveBeenLastCalledWith("cast_puzzle_tag_vote", {
      p_puzzle_id: 42,
      p_voter: "admin",
      p_tag: "fork",
      p_vote: 1,
    });

    const loaded = await handler({
      httpMethod: "GET",
      headers,
      queryStringParameters: { puzzleId: "42" },
    });
    expect(loaded.statusCode).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("get_puzzle_tag_votes", {
      p_puzzle_id: 42,
      p_voter: "admin",
    });
  });

  it.each([{ coinAward: 0.2 }, { coinAward: 0, coinDelta: -0.35 }])(
    "returns a signed coin adjustment (%s) without rejecting the saved vote",
    async (adjustment) => {
      const data = { votes: [{ tag: "fork", up: 1, down: 0, vote: 1 }], ...adjustment };
      mocks.createClient.mockReturnValue({
        rpc: vi.fn().mockResolvedValue({ data, error: null }),
      });

      const response = await handler({
        httpMethod: "POST",
        headers: authHeaders("solver"),
        body: JSON.stringify({ puzzleId: 42, tag: "fork", vote: 1 }),
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(data);
    },
  );
});
