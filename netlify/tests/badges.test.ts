import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  queryAchievementRatingPeaks: vi.fn(async () => []),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("../archive/queries", () => ({
  queryAchievementRatingPeaks: mocks.queryAchievementRatingPeaks,
}));

import { handler } from "../functions/badges";
import { createSiteSessionCookie } from "../lib/siteSession";

const queryChain = (result: Record<string, unknown>) => {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "upsert"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain as {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};

const createDatabase = () => {
  const catalog = queryChain({
    data: [
      {
        key: "first-attempt",
        category: "attempted",
        threshold: 1,
        name: "First attempt",
        description: "Attempt one puzzle.",
        tier: "bronze",
        tier_level: 1,
        icon_key: "attempted",
      },
    ],
    error: null,
  });
  const tiers = queryChain({
    data: [{ key: "bronze", name: "Bronze", rank: 1, description: "Bronze tier" }],
    error: null,
  });
  const progress = queryChain({ count: 1, error: null });
  const puzzles = queryChain({ count: 0, error: null });
  const earned = queryChain({ data: [], error: null });
  const from = vi.fn((table: string) => {
    if (table === "badges") return catalog;
    if (table === "badge_tiers") return tiers;
    if (table === "puzzle_progress") return progress;
    if (table === "puzzles") return puzzles;
    return earned;
  });
  mocks.createClient.mockReturnValue({ from });
  return { earned };
};

const ownerHeaders = (username: string) => ({
  cookie: createSiteSessionCookie(username, {}).split(";")[0],
  host: "atomic.example",
  origin: "https://atomic.example",
});

describe("badges function", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.queryAchievementRatingPeaks.mockClear();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv(
      "SITE_SESSION_SECRET",
      "test-session-secret-that-is-longer-than-thirty-two-characters",
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("keeps public achievement reads free of service-role writes", async () => {
    const { earned } = createDatabase();
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ username: "alice" }),
    });

    expect(response.statusCode).toBe(200);
    expect(earned.upsert).not.toHaveBeenCalled();
  });

  it("persists newly earned badges only when the signed-in owner requests them", async () => {
    const { earned } = createDatabase();
    const response = await handler({
      httpMethod: "POST",
      headers: ownerHeaders("alice"),
      body: JSON.stringify({ username: "alice" }),
    });

    expect(response.statusCode).toBe(200);
    expect(earned.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ username: "alice", badge_key: "first-attempt" })],
      { onConflict: "username,badge_key", ignoreDuplicates: true },
    );
  });
});
