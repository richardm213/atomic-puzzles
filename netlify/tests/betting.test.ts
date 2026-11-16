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

  it("loads public trader history scoped to the strike and player and rejects filter injection", async () => {
    const eq = vi.fn();
    const or = vi.fn();
    const rows: Record<string, unknown[]> = {
      prediction_fills: [
        {
          id: 1,
          outcome: "yes",
          price_cents: 40,
          quantity: 10,
          taker_order_id: 1,
          buyer_username: "trader",
          seller_username: "maker",
          pair_key: null,
          created_at: "2026-11-01T00:00:00Z",
        },
      ],
      prediction_position_credits: [],
      prediction_position_nettings: [],
      coin_transactions: [
        {
          id: 1,
          reason: "prediction_trade_fee",
          amount: -0.08,
          source_key: "fee:1",
          metadata: { orderId: 1 },
          created_at: "2026-11-01T00:00:00Z",
        },
        {
          id: 2,
          reason: "prediction_market_payout",
          amount: 10,
          source_key: "payout:1",
          metadata: { outcome: "yes", contracts: 10 },
          created_at: "2026-11-02T00:00:00Z",
        },
      ],
    };
    mocks.createClient.mockReturnValue({
      from: (table: string) => {
        const query = {
          select: () => query,
          order: () => query,
          in: () => query,
          eq: (...args: unknown[]) => {
            eq(table, ...args);
            return query;
          },
          or: (...args: unknown[]) => {
            or(table, ...args);
            return query;
          },
          maybeSingle: async () => ({
            data: {
              status: "resolved",
              outcome: "yes",
              resolved_at: "2026-11-02T00:00:00Z",
              settlement_price_cents: null,
            },
            error: null,
          }),
          range: async () => ({ data: rows[table] ?? [], error: null }),
        };
        return query;
      },
    });
    const result = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({
        action: "exchangeTraderHistory",
        marketId: "test-market",
        username: "Trader",
      }),
    });
    expect(result.statusCode).toBe(200);
    const history = JSON.parse(result.body).result;
    expect(history.at(-1)).toMatchObject({ action: "settlement", quantity: 10, runningPnl: 5.92 });
    expect(history[0]).not.toHaveProperty("source_key");
    expect(eq).toHaveBeenCalledWith("prediction_fills", "market_id", "test-market");
    expect(or).toHaveBeenCalledWith(
      "prediction_fills",
      "buyer_username.eq.trader,seller_username.eq.trader",
    );
    expect(eq).toHaveBeenCalledWith("coin_transactions", "username", "trader");
    expect(eq).toHaveBeenCalledWith("coin_transactions", "metadata->>marketId", "test-market");
    mocks.createClient.mockClear();
    const invalid = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({
        action: "exchangeTraderHistory",
        marketId: "test-market",
        username: "trader,username.neq.other",
      }),
    });
    expect(invalid.statusCode).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("paginates public chart trades and scopes time ranges to the selected resolved market", async () => {
    const end = Date.parse("2026-11-14T12:00:00Z");
    const fills = Array.from({ length: 1001 }, (_, id) => ({
      id,
      outcome: "yes",
      price_cents: 40,
      quantity: 1,
      pair_key: null,
      created_at: new Date(end - 1000).toISOString(),
    }));
    const eq = vi.fn();
    const gte = vi.fn();
    const lte = vi.fn();
    const range = vi.fn(async (from: number, to: number) => ({
      data: fills.slice(from, to + 1),
      error: null,
    }));
    mocks.createClient.mockReturnValue({
      from: (table: string) => {
        const query = {
          select: () => query,
          order: () => query,
          eq: (...args: unknown[]) => {
            eq(table, ...args);
            return query;
          },
          gte: (...args: unknown[]) => {
            gte(...args);
            return query;
          },
          lte: (...args: unknown[]) => {
            lte(...args);
            return query;
          },
          range,
          maybeSingle: async () => ({
            data: {
              status: "resolved",
              resolved_at: new Date(end).toISOString(),
              outcome: "no",
              settlement_price_cents: 25,
            },
            error: null,
          }),
        };
        return query;
      },
    });
    const response = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({
        action: "exchangePriceHistory",
        marketId: "selected-strike",
        period: "1h",
      }),
    });
    expect(response.statusCode).toBe(200);
    expect(eq).toHaveBeenCalledWith("prediction_markets", "id", "selected-strike");
    expect(eq).toHaveBeenCalledWith("prediction_fills", "market_id", "selected-strike");
    expect(gte).toHaveBeenCalledWith("created_at", new Date(end - 3_600_000).toISOString());
    expect(lte).toHaveBeenCalledWith("created_at", new Date(end).toISOString());
    expect(range.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(JSON.parse(response.body).result).toMatchObject({
      end,
      settlement: { time: end, price: 25 },
      points: [{ quantity: 1001 }],
    });
  });

  it("returns one accounting row per trader for exited trades and netted holdings", async () => {
    const rows: Record<string, unknown[]> = {
      prediction_positions: [
        {
          market_id: "strike",
          username: "switched",
          outcome: "no",
          quantity: 1000,
          reserved_quantity: 0,
          updated_at: "2026-11-14T02:00:00Z",
        },
      ],
      prediction_position_credits: [],
      prediction_fills: [
        {
          id: 1,
          market_id: "strike",
          outcome: "yes",
          price_cents: 20,
          quantity: 10,
          buyer_username: "trader",
          seller_username: "prediction_admin",
          pair_key: null,
          created_at: "2026-11-14T00:00:00Z",
        },
        {
          id: 2,
          market_id: "strike",
          outcome: "yes",
          price_cents: 60,
          quantity: 10,
          buyer_username: "prediction_admin",
          seller_username: "trader",
          pair_key: null,
          created_at: "2026-11-14T01:00:00Z",
        },
      ],
      prediction_position_nettings: [
        {
          id: 1,
          market_id: "strike",
          username: "switched",
          quantity: 1000,
          created_at: "2026-11-14T02:00:00Z",
        },
      ],
      coin_transactions: [
        {
          username: "trader",
          amount: -0.1,
          reason: "prediction_trade_fee",
          metadata: { marketId: "strike" },
          created_at: "2026-11-14T01:00:00Z",
        },
      ],
    };
    rows.prediction_fills!.push(
      {
        id: 3,
        market_id: "strike",
        outcome: "yes",
        price_cents: 20,
        quantity: 1000,
        buyer_username: "switched",
        seller_username: "prediction_admin",
        pair_key: null,
        created_at: "2026-11-14T00:00:00Z",
      },
      {
        id: 4,
        market_id: "strike",
        outcome: "no",
        price_cents: 60,
        quantity: 2000,
        buyer_username: "switched",
        seller_username: "prediction_admin",
        pair_key: null,
        created_at: "2026-11-14T02:00:00Z",
      },
    );
    mocks.createClient.mockReturnValue({
      from: (table: string) => {
        const query = {
          select: () => query,
          not: () => query,
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
          order: () => query,
          gt: () => query,
          neq: () => query,
          eq: () => query,
          in: () => query,
          range: async (from: number, to: number) => ({
            data: (rows[table] ?? []).slice(from, to + 1),
            error: null,
          }),
        };
        return query;
      },
    });
    const response = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ action: "predictionPositions" }),
    });
    expect(response.statusCode).toBe(200);
    const result = JSON.parse(response.body).result;
    expect(result).toHaveLength(2);
    expect(result.find((row: { username: string }) => row.username === "trader")).toMatchObject({
      outcome: "yes",
      quantity: 0,
      closed_cost_coins: 2,
      closed_proceeds_coins: 6,
      fees_coins: 0.1,
    });
    expect(result.find((row: { username: string }) => row.username === "switched")).toMatchObject({
      outcome: "no",
      quantity: 1000,
      closed_cost_coins: 800,
      closed_proceeds_coins: 1000,
    });
    const bootstrap = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ action: "bootstrap" }),
    });
    expect(bootstrap.statusCode).toBe(200);
    expect(JSON.parse(bootstrap.body).result).toEqual({
      exchangeMarkets: [],
      allPredictionPositions: result,
      exchangeMarketStates: [],
    });
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

  it("rejects retired fixed-price actions before accessing the database", async () => {
    for (const action of ["place", "markets", "bets", "allBets"]) {
      const response = await handler({
        httpMethod: "POST",
        headers: requestHeaders("bettor"),
        body: JSON.stringify({ action, marketId: "awc2026-winner", selection: "natso", stake: 10 }),
      });
      expect(response.statusCode).toBe(400);
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
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
      prediction_position_credits: [],
    };
    const from = vi.fn((table: string) => {
      const result = { data: rowsByTable[table] ?? [], error: null };
      const query = {
        select: () => query,
        in: () => query,
        eq: () => query,
        neq: () => query,
        gt: () => query,
        or: () => query,
        range: () => query,
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
