import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { handler } from "../functions/betting";
import { createSiteSessionCookie } from "../lib/siteSession";

const requestHeaders = (username: string) => ({
  cookie: createSiteSessionCookie(username, {}).split(";")[0],
  host: "atomic.example",
  origin: "https://atomic.example",
});

describe("betting function", () => {
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
  });

  it("returns the public AWC 2026 markets in bracket order", async () => {
    const roundOrder = vi.fn(async () => ({
      data: [{ id: "awc2026-wb-r1-m2", player_one: "maracker", player_two: "rabbier" }],
      error: null,
    }));
    const categoryOrder = vi.fn(() => ({ order: roundOrder }));
    const inFilter = vi.fn(() => ({ order: categoryOrder }));
    const select = vi.fn(() => ({ in: inFilter }));
    const from = vi.fn(() => ({ select }));
    mocks.createClient.mockReturnValue({ from });

    const response = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ action: "markets" }),
    });

    expect(response.statusCode).toBe(200);
    expect(from).toHaveBeenCalledWith("tournament_betting_markets");
    expect(inFilter).toHaveBeenCalledWith("tournament_id", ["awc2026", "lichess-ban-2026"]);
    expect(categoryOrder).toHaveBeenCalledWith("category_order", { ascending: true });
    expect(roundOrder).toHaveBeenCalledWith("round_order", { ascending: true });
  });

  it("returns all bets publicly in newest-first order", async () => {
    const limit = vi.fn(async () => ({
      data: [{ id: 9, username: "other_player", selection: "natso" }],
      error: null,
    }));
    const secondOrder = vi.fn(() => ({ limit }));
    const firstOrder = vi.fn(() => ({ order: secondOrder }));
    const select = vi.fn(() => ({ order: firstOrder }));
    const from = vi.fn(() => ({ select }));
    mocks.createClient.mockReturnValue({ from });

    const response = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ action: "allBets" }),
    });

    expect(response.statusCode).toBe(200);
    expect(from).toHaveBeenCalledWith("tournament_bets");
    expect(firstOrder).toHaveBeenCalledWith("placed_at", { ascending: false });
    expect(secondOrder).toHaveBeenCalledWith("id", { ascending: false });
    expect(limit).toHaveBeenCalledWith(200);
  });

  it("places a bet for the signed-in username and enforces the maximum", async () => {
    const rpc = vi.fn(async () => ({
      data: { balance: 898, bet: { id: 7, selection: "rabbier" } },
      error: null,
    }));
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("Actual_User"),
      body: JSON.stringify({
        action: "place",
        marketId: "awc2026-wb-r1-m2",
        selection: "rabbier",
        stake: 100,
        username: "impersonated-user",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("place_tournament_bet", {
      p_username: "actual_user",
      p_market_id: "awc2026-wb-r1-m2",
      p_selection: "rabbier",
      p_stake: 100,
    });

    const invalidResponse = await handler({
      httpMethod: "POST",
      headers: requestHeaders("Actual_User"),
      body: JSON.stringify({
        action: "place",
        marketId: "awc2026-wb-r1-m2",
        selection: "rabbier",
        stake: 1001,
      }),
    });
    expect(invalidResponse.statusCode).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);

    const bannedMarketResponse = await handler({
      httpMethod: "POST",
      headers: requestHeaders("Actual_User"),
      body: JSON.stringify({
        action: "place",
        marketId: "lichess-ban-2026-new-life14",
        selection: "new_life14",
        stake: 201,
      }),
    });
    expect(bannedMarketResponse.statusCode).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
