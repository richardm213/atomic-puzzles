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

  it("returns fresh pending, completed, and failed job state", async () => {
    const pendingLimit = vi.fn(async () => ({
      data: [
        {
          game_id: "game-pending",
          status: "processing",
          requested_by: "admin",
          total_moves: 3,
          completed_moves: 2,
          queued_moves: 2,
          error: null,
          created_at: "2026-11-04T20:00:00.000Z",
          updated_at: "2026-11-04T20:01:00.000Z",
          completed_at: null,
          last_checked_at: "2026-11-04T20:01:30.000Z",
          next_check_at: "2026-11-04T20:02:00.000Z",
        },
      ],
      count: 1,
      error: null,
    }));
    const completedLimit = vi.fn(async () => ({
      data: [
        {
          game_id: "game-ready",
          status: "ready",
          requested_by: "seaside_tiramisu",
          total_moves: 2,
          completed_moves: 2,
          queued_moves: 2,
          error: null,
          created_at: "2026-11-04T19:00:00.000Z",
          updated_at: "2026-11-04T19:05:00.000Z",
          completed_at: "2026-11-04T19:05:00.000Z",
          last_checked_at: "2026-11-04T19:04:00.000Z",
          next_check_at: "2026-11-05T19:05:00.000Z",
        },
      ],
      error: null,
    }));
    const failedLimit = vi.fn(async () => ({
      data: [
        {
          game_id: "game-failed",
          status: "failed",
          requested_by: "admin",
          total_moves: 2,
          completed_moves: 0,
          queued_moves: 1,
          error: "AtomicDB request failed.",
          created_at: "2026-11-04T18:00:00.000Z",
          updated_at: "2026-11-04T18:05:00.000Z",
          completed_at: null,
          last_checked_at: "2026-11-04T18:04:00.000Z",
          next_check_at: "2026-11-04T18:04:00.000Z",
        },
      ],
      error: null,
    }));
    const recentFinishedCount = Promise.resolve({ data: null, count: 14, error: null });
    const select = vi.fn((_columns: string, options?: { head?: boolean }) =>
      options?.head
        ? {
            eq: vi.fn(() => ({
              gte: vi.fn(() => recentFinishedCount),
            })),
          }
        : {
            in: vi.fn(() => ({ order: vi.fn(() => ({ limit: pendingLimit })) })),
            eq: vi.fn((_column: string, value: string) => ({
              order: vi.fn(() => ({
                limit: value === "failed" ? failedLimit : completedLimit,
              })),
            })),
          },
    );
    const from = vi.fn(() => ({ select }));
    mocks.createClient.mockReturnValue({ from });

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
          queuedMoves: 2,
          totalMoves: 3,
          error: null,
          createdAt: "2026-11-04T20:00:00.000Z",
          updatedAt: "2026-11-04T20:01:00.000Z",
          completedAt: null,
          lastCheckedAt: "2026-11-04T20:01:30.000Z",
          nextCheckAt: "2026-11-04T20:02:00.000Z",
        },
      ],
      pendingTotal: 1,
      completed: [
        {
          gameId: "game-ready",
          status: "ready",
          requestedBy: "seaside_tiramisu",
          completedMoves: 2,
          queuedMoves: 2,
          totalMoves: 2,
          error: null,
          createdAt: "2026-11-04T19:00:00.000Z",
          updatedAt: "2026-11-04T19:05:00.000Z",
          completedAt: "2026-11-04T19:05:00.000Z",
          lastCheckedAt: null,
          nextCheckAt: null,
        },
      ],
      failed: [
        {
          gameId: "game-failed",
          status: "failed",
          requestedBy: "admin",
          completedMoves: 0,
          queuedMoves: 1,
          totalMoves: 2,
          error: "AtomicDB request failed.",
          createdAt: "2026-11-04T18:00:00.000Z",
          updatedAt: "2026-11-04T18:05:00.000Z",
          completedAt: null,
          lastCheckedAt: null,
          nextCheckAt: null,
        },
      ],
      finishedLast7Days: 14,
      generatedAt: expect.any(String),
    });
    expect(completedLimit).toHaveBeenCalledWith(25);
    expect(failedLimit).toHaveBeenCalledWith(25);
    expect(from).toHaveBeenCalledTimes(4);
    expect(from).toHaveBeenCalledWith("game_analysis_admin_summaries");
  });

  it("returns a newest-first page of finished analyses", async () => {
    const range = vi.fn(async () => ({
      data: [
        {
          game_id: "game-newest",
          status: "ready",
          requested_by: "seaside_tiramisu",
          total_moves: 4,
          completed_moves: 4,
          queued_moves: 4,
          error: null,
          created_at: "2026-11-05T18:00:00.000Z",
          updated_at: "2026-11-05T18:04:00.000Z",
          completed_at: "2026-11-05T18:04:00.000Z",
          last_checked_at: "2026-11-05T18:03:00.000Z",
          next_check_at: "2026-11-06T18:04:00.000Z",
        },
      ],
      count: 101,
      error: null,
    }));
    const tieBreakOrder = vi.fn(() => ({ range }));
    const order = vi.fn(() => ({ order: tieBreakOrder }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    mocks.createClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    const response = await handler({
      httpMethod: "POST",
      headers: headers("seaside_tiramisu"),
      body: JSON.stringify({ action: "adminFinished", page: 2, pageSize: 50 }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      items: [
        {
          gameId: "game-newest",
          status: "ready",
          requestedBy: "seaside_tiramisu",
          completedMoves: 4,
          queuedMoves: 4,
          totalMoves: 4,
          error: null,
          createdAt: "2026-11-05T18:00:00.000Z",
          updatedAt: "2026-11-05T18:04:00.000Z",
          completedAt: "2026-11-05T18:04:00.000Z",
          lastCheckedAt: null,
          nextCheckAt: null,
        },
      ],
      total: 101,
      page: 2,
      pageSize: 50,
      totalPages: 3,
      generatedAt: expect.any(String),
    });
    expect(order).toHaveBeenCalledWith("completed_at", { ascending: false });
    expect(tieBreakOrder).toHaveBeenCalledWith("game_id", { ascending: false });
    expect(range).toHaveBeenCalledWith(50, 99);
  });
});
