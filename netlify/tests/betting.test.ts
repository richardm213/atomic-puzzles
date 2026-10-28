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

  it("publishes suggestion vote totals without exposing voter identities", async () => {
    const limit = vi.fn(async () => ({
      data: [
        {
          id: 4,
          username: "market_maker",
          question: "Will sircachetes win AWC 2026?",
          outcomes: [
            { label: "Yes", odds: 1 },
            { label: "No", odds: 99 },
          ],
          created_at: "2026-10-26T10:00:00Z",
          tournament_market_suggestion_votes: [
            { username: "one", vote: 1 },
            { username: "two", vote: -1 },
            { username: "three", vote: 1 },
          ],
        },
      ],
      error: null,
    }));
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.createClient.mockReturnValue({ from });

    const response = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ action: "suggestions" }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).result).toEqual([
      expect.objectContaining({ id: 4, upvotes: 2, downvotes: 1, score: 1, userVote: 0 }),
    ]);
    expect(response.body).not.toContain('"username":"one"');
  });

  it("places a bet for the signed-in username and enforces the maximum", async () => {
    const rpc = vi.fn(async () => ({
      data: { balance: 898, bet: { id: 7, selection: "rabbier" } },
      error: null,
    }));
    const maybeSingle = vi.fn(async () => ({
      data: {
        market_kind: "match",
        player_one: "maracker",
        player_two: "rabbier",
      },
      error: null,
    }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.createClient.mockReturnValue({ from, rpc });

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

    const belowMinimumResponse = await handler({
      httpMethod: "POST",
      headers: requestHeaders("Actual_User"),
      body: JSON.stringify({
        action: "place",
        marketId: "awc2026-wb-r1-m2",
        selection: "rabbier",
        stake: 0,
      }),
    });
    expect(belowMinimumResponse.statusCode).toBe(400);
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

    maybeSingle.mockResolvedValueOnce({
      data: {
        market_kind: "match",
        player_one: "Actual_User",
        player_two: "rival",
      },
      error: null,
    });
    const selfBetResponse = await handler({
      httpMethod: "POST",
      headers: requestHeaders("Actual_User"),
      body: JSON.stringify({
        action: "place",
        marketId: "awc2026-wb-r1-m2",
        selection: "actual_user",
        stake: 10,
      }),
    });
    expect(selfBetResponse.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(2);

    maybeSingle.mockResolvedValueOnce({
      data: {
        market_kind: "match",
        player_one: "Actual_User",
        player_two: "rival",
      },
      error: null,
    });
    const opponentBetResponse = await handler({
      httpMethod: "POST",
      headers: requestHeaders("Actual_User"),
      body: JSON.stringify({
        action: "place",
        marketId: "awc2026-wb-r1-m2",
        selection: "rival",
        stake: 10,
      }),
    });
    expect(opponentBetResponse.statusCode).toBe(400);
    expect(JSON.parse(opponentBetResponse.body).error).toBe("You can’t bet on your opponent.");
    expect(rpc).toHaveBeenCalledTimes(2);

    const selfNotToWinResponse = await handler({
      httpMethod: "POST",
      headers: requestHeaders("Actual_User"),
      body: JSON.stringify({
        action: "place",
        marketId: "awc2026-winner-no",
        selection: "actual_user",
        stake: 10,
      }),
    });
    expect(selfNotToWinResponse.statusCode).toBe(400);
    expect(JSON.parse(selfNotToWinResponse.body).error).toBe(
      "You can’t bet on yourself not to win AWC.",
    );
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("reports a market deadline rejection as a closed market", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "Betting deadline has passed for market awc2026-winner" },
    }));
    const maybeSingle = vi.fn(async () => ({
      data: {
        market_kind: "outright",
        player_one: "",
        player_two: "",
      },
      error: null,
    }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.createClient.mockReturnValue({ from, rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("bettor"),
      body: JSON.stringify({
        action: "place",
        marketId: "awc2026-winner",
        selection: "natso",
        stake: 10,
      }),
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error).toBe("Betting has closed for this market.");
  });

  it("places exchange orders under the authenticated username", async () => {
    const rpc = vi.fn(async () => ({ data: { orderId: 41, balance: 92.5 }, error: null }));
    const rowsByTable: Record<string, unknown[]> = {
      prediction_markets: [
        {
          id: "natso-ban-2026",
          question: "Will natso be banned?",
          resolution_rules: "Resolves from the official account status.",
          resolution_source_url: "https://lichess.org/@/natso",
          closes_at: "2026-12-01T00:00:00Z",
          status: "open",
          outcome: null,
          settlement_price_cents: null,
          settlement_reference_fill_id: null,
          resolved_at: null,
          sportsbook_volume_coins: 0,
          exchange_volume_coins: 0,
        },
      ],
      prediction_orders: [],
      prediction_fills: [],
      prediction_positions: [],
      prediction_legacy_position_credits: [],
    };
    const from = vi.fn((table: string) => {
      const result = { data: rowsByTable[table] ?? [], error: null };
      const query = {
        select: () => query,
        in: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
      };
      return query;
    });
    mocks.createClient.mockReturnValue({ from, rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("Market_User"),
      body: JSON.stringify({
        action: "placeExchangeOrder",
        marketId: "natso-ban-2026",
        outcome: "yes",
        side: "buy",
        priceCents: 75,
        quantity: 10,
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("place_prediction_order", {
      p_username: "market_user",
      p_market_id: "natso-ban-2026",
      p_outcome: "yes",
      p_side: "buy",
      p_price_cents: 75,
      p_quantity: 10,
    });
    expect(JSON.parse(response.body).result).toEqual(
      expect.objectContaining({
        orderId: 41,
        balance: 92.5,
        marketId: "natso-ban-2026",
        state: expect.objectContaining({
          market: expect.objectContaining({ id: "natso-ban-2026" }),
        }),
      }),
    );
  });
});
