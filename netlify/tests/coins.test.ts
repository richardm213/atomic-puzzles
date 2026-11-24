import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  resolveCanonicalArchiveUsername: vi.fn(async (username: string) => username.toLowerCase()),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("../archive/aliases", () => ({
  resolveCanonicalArchiveUsername: mocks.resolveCanonicalArchiveUsername,
}));

import { handler } from "../functions/coins";
import { createSiteSessionCookie } from "../lib/siteSession";

const requestHeaders = (username: string) => ({
  cookie: createSiteSessionCookie(username, {}).split(";")[0],
  host: "atomic.example",
  origin: "https://atomic.example",
});

describe("coins function", () => {
  it("returns the signed-in account's invested coins alongside its balance", async () => {
    const queries = new Map<string, ReturnType<typeof vi.fn>>();
    const from = vi.fn((table: string) => {
      const query = {
        select: vi.fn(),
        eq: vi.fn(),
        in: vi.fn(),
        gt: vi.fn(),
        neq: vi.fn(),
        or: vi.fn(),
        order: vi.fn(),
        range: vi.fn(async () => ({
          data:
            table === "coin_accounts"
              ? [{ username: "portfolio_owner", balance: 100 }]
              : table === "prediction_markets"
                ? [{ id: "strike" }]
                : table === "prediction_positions"
                  ? [
                      {
                        market_id: "strike",
                        username: "portfolio_owner",
                        outcome: "yes",
                        quantity: 50,
                      },
                    ]
                  : table === "prediction_position_credits"
                    ? [
                        {
                          id: 1,
                          market_id: "strike",
                          username: "portfolio_owner",
                          outcome: "yes",
                          quantity: 50,
                          price_cents: 50,
                          cost_coins: 25,
                          credited_at: "2026-10-01T00:00:00Z",
                        },
                      ]
                    : [],
          error: null,
        })),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      query.in.mockReturnValue(query);
      query.gt.mockReturnValue(query);
      query.neq.mockReturnValue(query);
      query.or.mockReturnValue(query);
      query.order.mockReturnValue(query);
      queries.set(table, query.eq);
      return query;
    });
    mocks.createClient.mockReturnValue({
      from,
      rpc: vi.fn(async () => ({ data: { balance: 100, dailyClaimAvailable: false }, error: null })),
    });
    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("Portfolio_Owner"),
      body: JSON.stringify({ action: "summary", username: "another_player" }),
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).result).toMatchObject({ balance: 100, inBets: 25 });
    expect(queries.get("coin_accounts")).toHaveBeenCalledWith("username", "portfolio_owner");
    expect(queries.get("prediction_position_credits")).toHaveBeenCalledWith(
      "username",
      "portfolio_owner",
    );
  });
  it("purchases a permanent theme for the signed-in user without accepting a client price", async () => {
    const rpc = vi.fn(async () => ({
      data: { balance: 100, redemptionId: 8, status: "fulfilled" },
      error: null,
    }));
    mocks.createClient.mockReturnValue({ rpc });
    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("Theme_Buyer"),
      body: JSON.stringify({
        action: "redeem",
        itemKey: "theme_red_charcoal",
        username: "another_player",
        cost: 1,
      }),
    });
    expect(rpc).toHaveBeenCalledWith("purchase_shop_theme", {
      p_username: "theme_buyer",
      p_item_key: "theme_red_charcoal",
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).result).toMatchObject({ balance: 100, status: "fulfilled" });
  });

  it("checks theme ownership only for the authenticated account and fulfilled purchases", async () => {
    const limit = vi.fn(async () => ({ data: [{ id: 8 }], error: null }));
    const query = { eq: vi.fn(), limit };
    query.eq.mockReturnValue(query);
    mocks.createClient.mockReturnValue({ from: vi.fn(() => ({ select: vi.fn(() => query) })) });
    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("Theme_Buyer"),
      body: JSON.stringify({ action: "redCharcoalAccess", username: "another_player" }),
    });
    expect(query.eq).toHaveBeenCalledWith("username", "theme_buyer");
    expect(query.eq).toHaveBeenCalledWith("item_key", "theme_red_charcoal");
    expect(query.eq).toHaveBeenCalledWith("status", "fulfilled");
    expect(JSON.parse(response.body)).toEqual({ owned: true });
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T00:00:01.000Z"));
    mocks.createClient.mockReset();
    mocks.resolveCanonicalArchiveUsername.mockReset();
    mocks.resolveCanonicalArchiveUsername.mockImplementation(async (username: string) =>
      username.toLowerCase(),
    );
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv(
      "SITE_SESSION_SECRET",
      "test-session-secret-that-is-longer-than-thirty-two-characters",
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("blocks shop purchases until the automatic November 3 reopening", async () => {
    vi.setSystemTime(new Date("2026-11-02T23:59:59.000Z"));
    const cookie = createSiteSessionCookie("Closed_Shop_Buyer", {});

    const response = await handler({
      httpMethod: "POST",
      headers: {
        cookie: cookie.split(";")[0],
        host: "atomic.example",
        origin: "https://atomic.example",
      },
      body: JSON.stringify({ action: "redeem", itemKey: "flowers_500" }),
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "The shop is closed until November 3 at 00:00 UTC.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns public coin rankings ordered by net worth", async () => {
    const rows: Record<string, unknown[]> = {
      coin_accounts: [
        { username: "admin", balance: 10000 },
        { username: "saver", balance: 1200 },
        { username: "bettor", balance: 850 },
      ],
      prediction_markets: [
        { id: "market-1", status: "open", resolved_at: null, outcome: null },
        {
          id: "market-2",
          status: "resolved",
          resolved_at: "2026-10-06T00:00:00Z",
          outcome: "no",
          settlement_price_cents: null,
        },
      ],
      prediction_positions: [
        {
          market_id: "market-1",
          username: "bettor",
          outcome: "yes",
          quantity: 150,
          reserved_quantity: 0,
          updated_at: "2026-10-02T00:00:00Z",
        },
      ],
      prediction_fills: [
        {
          id: 10,
          taker_order_id: 7,
          market_id: "market-1",
          outcome: "yes",
          price_cents: 50,
          quantity: 100,
          buyer_username: "bettor",
          seller_username: null,
          pair_key: null,
          created_at: "2026-10-01T00:00:00Z",
        },
        {
          id: 11,
          market_id: "market-1",
          outcome: "no",
          price_cents: 40,
          quantity: 50,
          buyer_username: "bettor",
          seller_username: null,
          pair_key: null,
          created_at: "2026-10-02T00:00:00Z",
        },
      ],
      prediction_position_credits: [
        {
          id: 2,
          market_id: "market-1",
          username: "bettor",
          outcome: "yes",
          quantity: 100,
          price_cents: 50,
          fee_coins: 2,
          credited_at: "2026-09-01T00:00:00Z",
        },
        {
          id: 3,
          market_id: "market-2",
          username: "bettor",
          outcome: "yes",
          quantity: 10,
          price_cents: 40,
          credited_at: "2026-10-01T00:00:00Z",
        },
      ],
      prediction_position_nettings: [
        {
          id: 1,
          market_id: "market-1",
          username: "bettor",
          quantity: 50,
          created_at: "2026-10-02T00:00:00Z",
        },
      ],
      coin_transactions: [
        {
          id: 15,
          username: "bettor",
          reason: "prediction_order_reserve",
          amount: -51,
          metadata: { marketId: "market-1", orderId: 7, fee: 1 },
          created_at: "2026-10-01T00:00:00Z",
        },
      ],
    };
    mocks.createClient.mockReturnValue({
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: () => query,
          in: () => query,
          gt: () => query,
          neq: () => query,
          order: () => query,
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
      body: JSON.stringify({ action: "leaderboard" }),
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).result).toEqual([
      { username: "saver", netWorth: 1200, balance: 1200, inBets: 0, realizedPnl: 0 },
      { username: "bettor", netWorth: 927.25, balance: 850, inBets: 77.25, realizedPnl: 0.25 },
    ]);
    rows.prediction_positions = [];
    const inconsistent = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ action: "leaderboard" }),
    });
    expect(inconsistent.statusCode).toBe(500);
    expect(JSON.parse(inconsistent.body).code).toBe("internal_error");
  });

  it("returns a bounded, filtered public transaction feed without source keys", async () => {
    const reasons = [
      "fine",
      "coin_transfer",
      "puzzle_correct",
      "puzzle_attempted",
      "puzzle_created",
      "puzzle_tagging",
      "shop_redemption",
      "daily_bonus",
      "tournament_bet",
      "tournament_bet_payout",
      "tournament_bet_refund",
    ];
    const range = vi.fn(async () => ({
      data: [
        {
          id: 19,
          username: "solver",
          amount: 0.25,
          reason: "puzzle_tagging",
          metadata: { puzzleId: 42, tag: "fork", action: "proposed" },
          created_at: "2026-10-01T12:00:00.000Z",
        },
      ],
      error: null,
      count: 121,
    }));
    const orderById = vi.fn(() => ({ range }));
    const orderByCreatedAt = vi.fn(() => ({ order: orderById }));
    const filterUsername = vi.fn(() => ({ order: orderByCreatedAt }));
    const filterReasons = vi.fn(() => ({ eq: filterUsername }));
    const select = vi.fn(() => ({ in: filterReasons }));
    const from = vi.fn(() => ({ select }));
    mocks.createClient.mockReturnValue({ from });

    const response = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ action: "transactions", reasons, page: 2, username: "Solver" }),
    });

    expect(response.statusCode).toBe(200);
    expect(from).toHaveBeenCalledWith("coin_transactions");
    expect(select).toHaveBeenCalledWith("id,username,amount,reason,metadata,created_at", {
      count: "exact",
    });
    expect(filterReasons).toHaveBeenCalledWith("reason", reasons);
    expect(filterUsername).toHaveBeenCalledWith("username", "solver");
    expect(orderByCreatedAt).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(orderById).toHaveBeenCalledWith("id", { ascending: false });
    expect(range).toHaveBeenCalledWith(50, 99);
    const [transaction] = JSON.parse(response.body).result;
    expect(transaction).toMatchObject({ reason: "puzzle_tagging", amount: 0.25 });
    expect(transaction).not.toHaveProperty("source_key");
    expect(JSON.parse(response.body).pagination).toEqual({
      page: 2,
      pageSize: 50,
      total: 121,
      totalPages: 3,
    });
  });

  it("takes the gift sender from the signed session", async () => {
    const rpc = vi.fn(async () => ({
      data: { balance: 90, dailyClaimAvailable: true, transferId: 7 },
      error: null,
    }));
    mocks.createClient.mockReturnValue({ rpc });
    const cookie = createSiteSessionCookie("Actual_Sender", {});

    const response = await handler({
      httpMethod: "POST",
      headers: {
        cookie: cookie.split(";")[0],
        host: "atomic.example",
        origin: "https://atomic.example",
      },
      body: JSON.stringify({
        action: "give",
        senderUsername: "impersonated-user",
        recipientUsername: "recipient",
        amount: 10,
        message: "gg",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("give_coins", {
      p_sender_username: "actual_sender",
      p_recipient_username: "recipient",
      p_amount: 10,
      p_message: "gg",
    });
  });

  it("rejects gifts from a canonical account to one of its aliases", async () => {
    mocks.resolveCanonicalArchiveUsername.mockResolvedValue("canonical_player");

    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("canonical_player"),
      body: JSON.stringify({
        action: "give",
        recipientUsername: "second_alias",
        amount: 10,
      }),
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "You can’t gift coins between aliases of the same player.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("credits a gift sent to an alias to the canonical recipient", async () => {
    mocks.resolveCanonicalArchiveUsername.mockImplementation(async (username: string) =>
      username === "xeransis" ? "gannet" : username,
    );
    const rpc = vi.fn(async () => ({ data: { balance: 90 }, error: null }));
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("sender"),
      body: JSON.stringify({ action: "give", recipientUsername: "xeransis", amount: 10 }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "give_coins",
      expect.objectContaining({ p_recipient_username: "gannet" }),
    );
  });

  it.each([1, 50])(
    "keeps availability purchases in signed-in history with %i recent entries",
    async (count) => {
      const recent = Array.from({ length: count }, (_, index) => ({
        id: index + 10,
        item_key: "flowers_500",
        cost: 500,
        status: "pending",
        created_at: new Date().toISOString(),
        fulfilled_at: null,
      }));
      const oldTheme = {
        ...recent[0],
        id: 1,
        item_key: "theme_red_charcoal",
        status: "fulfilled",
        created_at: "2020-01-01T00:00:00Z",
        fulfilled_at: "2020-01-01T00:00:00Z",
      };
      const patron = { ...recent[0], id: 2, item_key: "lichess_patron_month" };
      const query = {
        select: vi.fn(),
        eq: vi.fn(),
        neq: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(async () => ({ data: recent, error: null })),
        or: vi.fn(async () => ({ data: [recent[0], oldTheme, patron], error: null })),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      query.neq.mockReturnValue(query);
      query.order.mockReturnValue(query);
      const from = vi.fn(() => query);
      mocks.createClient.mockReturnValue({ from });
      const cookie = createSiteSessionCookie("History_User", {});
      const response = await handler({
        httpMethod: "POST",
        headers: { cookie: cookie.split(";")[0] },
        body: JSON.stringify({ action: "history" }),
      });
      expect(response.statusCode).toBe(200);
      expect(from).toHaveBeenCalledWith("shop_redemptions");
      expect(query.eq).toHaveBeenCalledWith("username", "history_user");
      expect(query.eq).toHaveBeenCalledTimes(count === 50 ? 2 : 1);
      const result = JSON.parse(response.body).result;
      expect(result).toHaveLength(count === 50 ? 52 : count);
      expect(
        result.filter((purchase: { id: number }) => purchase.id === recent[0]!.id),
      ).toHaveLength(1);
      if (count === 50) {
        expect(result).toEqual(expect.arrayContaining([oldTheme, patron]));
        expect(query.neq).toHaveBeenCalledWith("status", "cancelled");
        expect(query.or).toHaveBeenCalledWith(expect.stringContaining("item_key.like.theme_*"));
        expect(query.or).toHaveBeenCalledWith(
          expect.stringContaining("item_key.eq.lichess_patron_month"),
        );
      } else {
        expect(query.or).not.toHaveBeenCalled();
      }
    },
  );

  it("loads past admin redemptions from databases without request details", async () => {
    const legacyRow = {
      id: 33,
      username: "rechesster",
      item_key: "discord_nitro_month",
      cost: 500,
      status: "pending",
      created_at: "2026-10-15T19:11:05.407Z",
      fulfilled_at: null,
      fulfilled_by: null,
    };
    const currentLimit = vi.fn(async () => ({
      data: null,
      error: { code: "42703", message: "column shop_redemptions.request_details does not exist" },
    }));
    const legacyLimit = vi.fn(async () => ({ data: [legacyRow], error: null }));
    const select = vi.fn((columns: string) => {
      const limit = columns.includes("request_details") ? currentLimit : legacyLimit;
      const secondOrder = vi.fn(() => ({ limit }));
      return { order: vi.fn(() => ({ order: secondOrder })) };
    });
    mocks.createClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("seaside_tiramisu"),
      body: JSON.stringify({ action: "listRedemptions" }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).redemptions).toEqual([{ ...legacyRow, request_details: {} }]);
  });

  it("rejects cross-site gifts before contacting the database", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: { host: "atomic.example", origin: "https://evil.example" },
      body: JSON.stringify({
        action: "give",
        recipientUsername: "recipient",
        amount: 10,
      }),
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects invalid gift amounts before contacting the database", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({
        action: "give",
        recipientUsername: "recipient",
        amount: 0,
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("accepts the yearly Nitro reward and reports its 12,000-coin price", async () => {
    mocks.resolveCanonicalArchiveUsername.mockRejectedValue(new Error("Archive unavailable"));
    const rpc = vi.fn(async () => ({ data: null, error: { message: "Not enough coins" } }));
    mocks.createClient.mockReturnValue({ rpc });
    const cookie = createSiteSessionCookie("Nitro_Buyer", {});

    const response = await handler({
      httpMethod: "POST",
      headers: {
        cookie: cookie.split(";")[0],
        host: "atomic.example",
        origin: "https://atomic.example",
      },
      body: JSON.stringify({ action: "redeem", itemKey: "discord_nitro_full_year" }),
    });

    expect(rpc).toHaveBeenCalledWith("redeem_shop_item", {
      p_username: "nitro_buyer",
      p_item_key: "discord_nitro_full_year",
    });
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "You need 12,000 coins to buy this item.",
    });
  });

  it("stores a username-change request with the signed-in buyer", async () => {
    const rpc = vi.fn(async () => ({
      data: { balance: 250, redemptionId: 14, status: "pending" },
      error: null,
    }));
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("Current_Name"),
      body: JSON.stringify({
        action: "redeem",
        itemKey: "username_change",
        requestedUsername: "New_Name",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("request_username_change", {
      p_username: "current_name",
      p_requested_username: "New_Name",
    });
  });

  it("stores a structured AtomicDB request for the signed-in user", async () => {
    const rpc = vi.fn(async () => ({
      data: { balance: 300, redemptionId: 12, status: "pending" },
      error: null,
    }));
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("Analysis_Buyer"),
      body: JSON.stringify({
        action: "requestAtomicDbAnalysis",
        focus: "player_lines",
        openings: ["1. e4 f6 2. Be2"],
        players: ["First_Player", "second-player"],
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("request_atomicdb_analysis", {
      p_username: "analysis_buyer",
      p_focus: "player_lines",
      p_openings: ["1. e4 f6 2. Be2"],
      p_players: ["First_Player", "second-player"],
    });
  });

  it("rejects incomplete player-line requests before contacting the database", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("Analysis_Buyer"),
      body: JSON.stringify({
        action: "requestAtomicDbAnalysis",
        focus: "player_lines",
        openings: ["atomicdb.example/opening"],
        players: [],
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("uses the signed administrator identity when resolving a redemption", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        id: 17,
        username: "buyer",
        item_key: "discord_nitro_month",
        status: "fulfilled",
      },
      error: null,
    }));
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("seaside_tiramisu"),
      body: JSON.stringify({ action: "updateRedemption", id: 17, status: "fulfilled" }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("update_shop_redemption_status", {
      p_id: 17,
      p_status: "fulfilled",
      p_updated_by: "seaside_tiramisu",
    });
  });
});
