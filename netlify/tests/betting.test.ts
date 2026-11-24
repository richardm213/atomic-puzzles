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

  it("reports an upstream egress restriction as temporary downtime", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => void) =>
        resolve({
          data: null,
          error: { message: "Service restricted: exceed_cached_egress_quota" },
        }),
    };
    mocks.createClient.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    const response = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ action: "exchangeMarkets" }),
    });
    expect(response.statusCode).toBe(503);
    expect(response.headers["Retry-After"]).toBe("60");
    expect(JSON.parse(response.body ?? "{}")).toMatchObject({ code: "database_quota" });
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

  it("aggregates a public bettor's realized results, open cost and puzzle rewards", async () => {
    const date = "2026-11-01T00:00:00Z";
    const openFill = {
      id: 1,
      market_id: "open-market",
      outcome: "yes",
      quantity: 10,
      price_cents: 40,
      buyer_username: "trader",
      seller_username: "maker",
      pair_key: null,
      created_at: date,
    };
    const settled = "settled-market";
    const rows: Record<string, unknown[]> = {
      prediction_fills: [
        openFill,
        { ...openFill, id: 2, market_id: settled },
        {
          ...openFill,
          id: 3,
          buyer_username: "maker",
          seller_username: "trader",
          quantity: 2,
          price_cents: 50,
        },
      ],
      prediction_markets: [
        { id: openFill.market_id, status: "closed", question: "Open position", group_path: null },
        {
          id: settled,
          status: "resolved",
          outcome: "yes",
          settlement_price_cents: null,
          question: "Settled position",
          group_path: "/betting/awc-2026-semifinals",
          outcome_yes_label: "Player one",
        },
      ],
    };
    const tradingReceipts = [
      {
        id: 3,
        reason: "prediction_market_payout",
        amount: 10,
        source_key: "private-payout-key",
        metadata: { marketId: settled, outcome: "yes", contracts: 10, private: "not public" },
        created_at: "2026-11-02T00:00:00Z",
      },
    ];
    const eq = vi.fn();
    mocks.createClient.mockReturnValue({
      from: (table: string) => {
        let selection = "";
        const query = {
          select: (columns: string) => {
            selection = columns;
            return query;
          },
          order: () => query,
          in: () => query,
          or: () => query,
          eq: (...args: unknown[]) => {
            eq(table, ...args);
            return query;
          },
          maybeSingle: async () => ({ data: { balance: 50 }, error: null }),
          range: async () => ({
            data:
              table !== "coin_transactions"
                ? (rows[table] ?? [])
                : selection === "amount,reason"
                  ? [
                      { amount: 7, reason: "puzzle_correct" },
                      { amount: 12, reason: "puzzle_created" },
                      { amount: -2, reason: "puzzle_correct" },
                      { amount: -40, reason: "shop_redemption" },
                      { amount: -10, reason: "game_analysis" },
                      { amount: 10, reason: "game_analysis" },
                      { amount: -6, reason: "opening_purchase" },
                    ]
                  : tradingReceipts,
            error: null,
          }),
          then: (resolve: (result: unknown) => void) =>
            resolve({ data: rows[table] ?? [], error: null }),
        };
        return query;
      },
    });

    const response = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ action: "bettorProfile", username: "Trader" }),
    });
    expect(response.statusCode).toBe(200);
    expect(eq).toHaveBeenCalledWith("coin_accounts", "username", "trader");
    expect(JSON.parse(response.body).result).toMatchObject({
      username: "trader",
      realizedPnl: 6.2,
      netWorth: 53.2,
      puzzleSolveCoins: 7,
      puzzleCreationCoins: 12,
      coinsSpent: -46,
      openPositions: [{ marketId: openFill.market_id, quantity: 8, cost: 3.2 }],
      settledBets: [{ marketId: settled, status: "resolved", pnl: 6 }],
      pnlByDay: [
        { day: "2026-11-01", pnl: 0.2 },
        { day: "2026-11-02", pnl: 6.2 },
      ],
    });
    expect(response.body).not.toMatch(/private-payout-key|not public|seller_username/);
    const house = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ action: "bettorProfile", username: "prediction_admin" }),
    });
    expect(house.statusCode).toBe(400);
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
        {
          username: "switched",
          amount: 1020,
          reason: "prediction_market_payout",
          metadata: { marketId: "strike" },
          created_at: "2026-11-15T01:00:00Z",
        },
        {
          username: "switched",
          amount: -20,
          reason: "prediction_reconciliation",
          metadata: { marketId: "strike", kind: "duplicate-legacy-payout" },
          created_at: "2026-11-16T01:00:00Z",
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
    const scopedReads: Record<string, string[]> = {};
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
          in: (column: string, ids: string[]) => {
            if (column !== "reason") scopedReads[table] = ids;
            return query;
          },
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
      remaining_cost_coins: 0,
      closed_cost_coins: 2,
      closed_proceeds_coins: 6,
      fees_coins: 0.1,
    });
    expect(result.find((row: { username: string }) => row.username === "switched")).toMatchObject({
      outcome: "no",
      quantity: 1000,
      remaining_cost_coins: 600,
      closed_cost_coins: 800,
      closed_proceeds_coins: 1000,
      terminal_return_coins: 1000,
    });
    const scoped = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ action: "predictionPositions", marketIds: ["strike"] }),
    });
    expect(scoped.statusCode).toBe(200);
    expect(JSON.parse(scoped.body).result).toEqual(result);
    expect(scopedReads).toEqual({
      prediction_markets: ["strike"],
      prediction_positions: ["strike"],
      prediction_fills: ["strike"],
      prediction_position_credits: ["strike"],
      prediction_position_nettings: ["strike"],
      coin_transactions: ["strike"],
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
    const rpc = vi.fn().mockResolvedValue({ data: { orderId: 41, balance: 92.5 }, error: null });
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

    const orderRequest = {
      httpMethod: "POST",
      headers: requestHeaders("Market_User"),
      body: JSON.stringify({
        action: "placeExchangeOrder",
        requestId: "e29ff207-83d7-4d1e-bcc0-64213e9e1089",
        username: "impersonated-user",
        marketId: "natso-ban-2026",
        outcome: "yes",
        side: "buy",
        priceCents: 75,
        quantity: 10,
      }),
    };
    const response = await handler(orderRequest);

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("place_prediction_order_once", {
      p_request_id: "e29ff207-83d7-4d1e-bcc0-64213e9e1089",
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
    for (const [message, expectedCode] of [
      ["Not enough coins", "order_rejected"],
      ["Order request ID was already used for different parameters", "order_request_conflict"],
    ]) {
      rpc.mockResolvedValueOnce({ data: null, error: { message } });
      const rejected = await handler(orderRequest);
      expect(rejected.statusCode).toBe(409);
      expect(JSON.parse(rejected.body).code).toBe(expectedCode);
    }
  });
});
