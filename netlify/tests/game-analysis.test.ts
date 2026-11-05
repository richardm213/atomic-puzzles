import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { handler } from "../functions/game-analysis";
import { createSiteSessionCookie } from "../lib/siteSession";

const headers = (username: string) => ({
  cookie: createSiteSessionCookie(username, {}).split(";")[0],
  host: "atomic.example",
  origin: "https://atomic.example",
});

describe("game analysis admin list", () => {
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

  it("restricts the analysis queue to seaside_tiramisu", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: headers("someone_else"),
      body: JSON.stringify({ action: "adminList" }),
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns existing analysis states for a batch of games", async () => {
    const inGames = vi.fn(async () => ({
      data: [
        { game_id: "game-ready", status: "ready" },
        { game_id: "game-pending", status: "processing" },
      ],
      error: null,
    }));
    const select = vi.fn(() => ({ in: inGames }));
    mocks.createClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    const response = await handler({
      httpMethod: "POST",
      headers: { host: "atomic.example" },
      body: JSON.stringify({
        action: "statuses",
        gameIds: ["game-ready", "game-pending", "game-missing"],
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      analyses: [
        { gameId: "game-ready", status: "ready" },
        { gameId: "game-pending", status: "processing" },
      ],
    });
    expect(inGames).toHaveBeenCalledWith("game_id", ["game-ready", "game-pending", "game-missing"]);
  });

  it("returns pending jobs and the last ten completed jobs", async () => {
    const pendingLimit = vi.fn(async () => ({
      data: [
        {
          game_id: "game-pending",
          status: "processing",
          requested_by: "admin",
          total_positions: 4,
          completed_positions: 2,
          queued_positions: 3,
          cost: 2,
          error: null,
          result: null,
          created_at: "2026-11-04T20:00:00.000Z",
          updated_at: "2026-11-04T20:01:00.000Z",
          completed_at: null,
          moves: ["a2a3", "a7a6", "b2b3"],
          position_states: [
            { completed: true },
            { completed: true },
            { completed: false },
            { completed: true },
          ],
        },
      ],
      error: null,
    }));
    const completedLimit = vi.fn(async () => ({
      data: [
        {
          game_id: "game-ready",
          status: "ready",
          requested_by: "seaside_tiramisu",
          total_positions: 3,
          completed_positions: 3,
          queued_positions: 3,
          cost: 2,
          error: null,
          result: {},
          created_at: "2026-11-04T19:00:00.000Z",
          updated_at: "2026-11-04T19:05:00.000Z",
          completed_at: "2026-11-04T19:05:00.000Z",
          moves: ["a2a3", "a7a6"],
          position_states: [],
        },
      ],
      error: null,
    }));
    const select = vi.fn(() => ({
      in: vi.fn(() => ({ order: vi.fn(() => ({ limit: pendingLimit })) })),
      eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: completedLimit })) })),
    }));
    mocks.createClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    const response = await handler({
      httpMethod: "POST",
      headers: headers("seaside_tiramisu"),
      body: JSON.stringify({ action: "adminList" }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      pending: [
        {
          gameId: "game-pending",
          status: "processing",
          requestedBy: "admin",
          completedMoves: 2,
          totalMoves: 3,
          createdAt: "2026-11-04T20:00:00.000Z",
          completedAt: null,
        },
      ],
      completed: [
        {
          gameId: "game-ready",
          status: "ready",
          requestedBy: "seaside_tiramisu",
          completedMoves: 2,
          totalMoves: 2,
          createdAt: "2026-11-04T19:00:00.000Z",
          completedAt: "2026-11-04T19:05:00.000Z",
        },
      ],
    });
    expect(completedLimit).toHaveBeenCalledWith(10);
  });
});
