import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
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

  it("accepts the yearly Nitro reward and reports its 4,000-coin price", async () => {
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
      body: JSON.stringify({ action: "redeem", itemKey: "discord_nitro_year" }),
    });

    expect(rpc).toHaveBeenCalledWith("redeem_shop_item", {
      p_username: "nitro_buyer",
      p_item_key: "discord_nitro_year",
    });
    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "You need 4,000 coins to redeem this item.",
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
});
