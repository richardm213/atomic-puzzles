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
    const accountRange = vi.fn(async () => ({
      data: [
        { username: "saver", balance: 1200 },
        { username: "bettor", balance: 850 },
      ],
      error: null,
    }));
    const orderAccounts = vi.fn(() => ({ range: accountRange }));
    const selectAccounts = vi.fn(() => ({ order: orderAccounts }));
    const openBetRange = vi.fn(async () => ({
      data: [
        { id: 1, username: "bettor", total_cost: 400 },
        { id: 2, username: "bettor", total_cost: 50 },
      ],
      error: null,
    }));
    const orderOpenBets = vi.fn(() => ({ range: openBetRange }));
    const filterOpenBets = vi.fn(() => ({ order: orderOpenBets }));
    const selectOpenBets = vi.fn(() => ({ eq: filterOpenBets }));
    const unsettledMarketRange = vi.fn(async () => ({
      data: [{ id: "market-1" }],
      error: null,
    }));
    const orderUnsettledMarkets = vi.fn(() => ({ range: unsettledMarketRange }));
    const filterUnsettledMarkets = vi.fn(() => ({ order: orderUnsettledMarkets }));
    const selectOpenMarkets = vi.fn(() => ({ in: filterUnsettledMarkets }));
    const positionRange = vi.fn(async () => ({
      data: [
        { market_id: "market-1", username: "bettor", outcome: "yes", quantity: 200 },
        {
          market_id: "market-1",
          username: "prediction_admin",
          outcome: "no",
          quantity: 490,
        },
      ],
      error: null,
    }));
    const positionOrderOutcome = vi.fn(() => ({ range: positionRange }));
    const positionOrderUsername = vi.fn(() => ({ order: positionOrderOutcome }));
    const positionOrderMarket = vi.fn(() => ({ order: positionOrderUsername }));
    const filterPositivePositions = vi.fn(() => ({ order: positionOrderMarket }));
    const filterPositionMarkets = vi.fn(() => ({ gt: filterPositivePositions }));
    const selectPositions = vi.fn(() => ({ in: filterPositionMarkets }));
    const fillRange = vi.fn(async () => ({
      data: [
        {
          id: 10,
          market_id: "market-1",
          outcome: "yes",
          price_cents: 50,
          quantity: 100,
          buyer_username: "bettor",
          seller_username: null,
          pair_key: null,
          created_at: "2026-10-01T00:00:00.000Z",
        },
      ],
      error: null,
    }));
    const orderFills = vi.fn(() => ({ range: fillRange }));
    const filterFillMarkets = vi.fn(() => ({ order: orderFills }));
    const selectFills = vi.fn(() => ({ in: filterFillMarkets }));
    const creditRange = vi.fn(async () => ({
      data: [
        {
          source_bet_id: 2,
          market_id: "market-1",
          username: "bettor",
          outcome: "yes",
          quantity: 100,
          price_cents: 50,
        },
      ],
      error: null,
    }));
    const orderCredits = vi.fn(() => ({ range: creditRange }));
    const filterCreditMarkets = vi.fn(() => ({ order: orderCredits }));
    const selectCredits = vi.fn(() => ({ in: filterCreditMarkets }));
    const from = vi.fn((table: string) => ({
      select:
        table === "coin_accounts"
          ? selectAccounts
          : table === "tournament_bets"
            ? selectOpenBets
            : table === "prediction_markets"
              ? selectOpenMarkets
              : table === "prediction_positions"
                ? selectPositions
                : table === "prediction_fills"
                  ? selectFills
                  : selectCredits,
    }));
    mocks.createClient.mockReturnValue({ from });

    const response = await handler({
      httpMethod: "POST",
      headers: {},
      body: JSON.stringify({ action: "leaderboard" }),
    });

    expect(response.statusCode).toBe(200);
    expect(from).toHaveBeenCalledWith("coin_accounts");
    expect(selectAccounts).toHaveBeenCalledWith("username,balance");
    expect(from).toHaveBeenCalledWith("tournament_bets");
    expect(selectOpenBets).toHaveBeenCalledWith("id,username,total_cost");
    expect(filterOpenBets).toHaveBeenCalledWith("status", "open");
    expect(filterUnsettledMarkets).toHaveBeenCalledWith("status", ["open", "closed"]);
    expect(JSON.parse(response.body).result).toEqual([
      { username: "bettor", netWorth: 1350, balance: 850, inBets: 500 },
      { username: "saver", netWorth: 1200, balance: 1200, inBets: 0 },
    ]);
  });

  it("returns a bounded, filtered public transaction feed without source keys", async () => {
    const reasons = [
      "coin_transfer",
      "puzzle_correct",
      "puzzle_attempted",
      "puzzle_created",
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
          amount: 5,
          reason: "puzzle_correct",
          metadata: { puzzleId: 42 },
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
    expect(JSON.parse(response.body).result[0]).not.toHaveProperty("source_key");
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

  it("returns only the signed-in player’s redemption history", async () => {
    const limit = vi.fn(async () => ({
      data: [
        {
          id: 12,
          item_key: "flowers_500",
          cost: 500,
          status: "pending",
          created_at: "2026-09-30T12:00:00.000Z",
          fulfilled_at: null,
        },
      ],
      error: null,
    }));
    const orderById = vi.fn(() => ({ limit }));
    const orderByCreatedAt = vi.fn(() => ({ order: orderById }));
    const eq = vi.fn(() => ({ order: orderByCreatedAt }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mocks.createClient.mockReturnValue({ from });
    const cookie = createSiteSessionCookie("History_User", {});

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: cookie.split(";")[0] },
      body: JSON.stringify({ action: "history" }),
    });

    expect(from).toHaveBeenCalledWith("shop_redemptions");
    expect(eq).toHaveBeenCalledWith("username", "history_user");
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).result).toHaveLength(1);
  });

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
    expect(JSON.parse(response.body).redemptions).toEqual([
      { ...legacyRow, request_details: {} },
    ]);
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

  it("accepts the yearly Nitro reward and reports its 11,000-coin price", async () => {
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
      error: "You need 11,000 coins to buy this item.",
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

  it("restricts economy ban management to the coin administrator", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("regular_player"),
      body: JSON.stringify({ action: "listBans" }),
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("creates a time-limited economy ban using the signed administrator identity", async () => {
    const rpc = vi.fn(async () => ({
      data: { id: 4, username: "flagged_player" },
      error: null,
    }));
    mocks.createClient.mockReturnValue({ rpc });
    const endsAt = "2026-10-08T12:00:00.000Z";

    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("seaside_tiramisu"),
      body: JSON.stringify({
        action: "ban",
        username: "Flagged_Player",
        endsAt,
        reason: "Prize eligibility review",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("create_coin_economy_ban", {
      p_username: "Flagged_Player",
      p_ends_at: endsAt,
      p_reason: "Prize eligibility review",
      p_created_by: "seaside_tiramisu",
    });
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

  it("returns a clear forbidden response when a banned player changes coins", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "Coin economy ban active until 2026-10-08T12:00:00.000Z" },
    }));
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: requestHeaders("flagged_player"),
      body: JSON.stringify({ action: "claimDaily" }),
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error).toContain("Atomic Coin access is suspended until");
  });
});
