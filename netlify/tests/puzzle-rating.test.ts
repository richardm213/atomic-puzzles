import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { handler } from "../functions/puzzle-rating";
import { createSiteSessionCookie } from "../lib/siteSession";

const authHeaders = (username: string) => ({
  cookie: createSiteSessionCookie(username, {}).split(";")[0],
});

describe("puzzle-rating function", () => {
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
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("restricts rating edits to seaside_tiramisu", async () => {
    const editResponse = await handler({
      httpMethod: "POST",
      headers: authHeaders("someone_else"),
      body: JSON.stringify({ puzzleId: 42, level: 5 }),
    });
    const refreshResponse = await handler({
      httpMethod: "POST",
      headers: authHeaders("someone_else"),
      body: JSON.stringify({ action: "refresh" }),
    });

    expect(editResponse.statusCode).toBe(403);
    expect(refreshResponse.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects levels outside V1 to V5", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("seaside_tiramisu"),
      body: JSON.stringify({ puzzleId: 42, level: 6 }),
    });

    expect(response.statusCode).toBe(400);
  });

  it("lets seaside_tiramisu explicitly refresh all rating calculations", async () => {
    const provisionalLevelQuery = {
      update: vi.fn(),
      lt: vi.fn(),
      is: vi.fn(async () => ({ data: null, error: null })),
    };
    provisionalLevelQuery.update.mockReturnValue(provisionalLevelQuery);
    provisionalLevelQuery.lt.mockReturnValue(provisionalLevelQuery);
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    mocks.createClient.mockReturnValue({
      from: vi.fn(() => provisionalLevelQuery),
      rpc,
    });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("seaside_tiramisu"),
      body: JSON.stringify({ action: "refresh" }),
    });

    expect(response.statusCode).toBe(200);
    expect(provisionalLevelQuery.update).toHaveBeenCalledWith({ computed_level: 3 });
    expect(provisionalLevelQuery.lt).toHaveBeenCalledWith("attempts", 4);
    expect(provisionalLevelQuery.is).toHaveBeenCalledWith("human_level", null);
    expect(rpc).toHaveBeenCalledWith("rebuild_puzzle_ratings_from_history");
    expect(JSON.parse(response.body)).toEqual({ refreshed: true });
  });

  it("returns public rating history without exposing the private table directly", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn(async () => ({
        data: [
          {
            username: "solver",
            puzzle_id: 42,
            attempted_at: "2026-09-29T00:00:00.000Z",
            puzzle_correct: true,
            user_rating_before: 2000,
            user_rating_after: 2018,
            user_rd_before: 350,
            user_rd_after: 290,
            puzzle_rating_before: 2100,
            puzzle_rating_after: 2086,
          },
        ],
        error: null,
      })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    mocks.createClient.mockReturnValue({ from: vi.fn(() => query) });

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "history", username: " Solver " }),
    });

    expect(response.statusCode).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("username", "solver");
    expect(JSON.parse(response.body)).toEqual({
      events: [
        {
          username: "solver",
          puzzleId: "42",
          attemptedAt: "2026-09-29T00:00:00.000Z",
          puzzleCorrect: true,
          userRatingBefore: 2000,
          userRatingAfter: 2018,
          userRatingDeviationBefore: 350,
          userRatingDeviationAfter: 290,
          puzzleRatingBefore: 2100,
          puzzleRatingAfter: 2086,
        },
      ],
    });
  });

  it("loads monthly rankings and available months through aggregate RPCs", async () => {
    const rpc = vi.fn((name: string) => {
      if (name === "get_puzzle_leaderboard_months") {
        return Promise.resolve({ data: [{ month: "2026-09" }], error: null });
      }
      return Promise.resolve({
        data: [
          {
            username: "solver",
            rating: 2040,
            rating_deviation: 55,
            attempted: 20,
            correct: 15,
            activity_attempts: 20,
            average_seconds: 42,
          },
        ],
        error: null,
      });
    });
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "leaderboard", period: "monthly", month: "2026-09" }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_puzzle_leaderboard", {
      p_period: "monthly",
      p_month: "2026-09",
    });
    expect(rpc).toHaveBeenCalledWith("get_puzzle_leaderboard_months");
    expect(JSON.parse(response.body)).toEqual({
      rows: [
        {
          username: "solver",
          rating: 2040,
          ratingDeviation: 55,
          attempted: 20,
          correct: 15,
          activityAttempts: 20,
          averageSeconds: 42,
        },
      ],
      months: ["2026-09"],
    });
  });

  it("loads all-time activity through the aggregate leaderboard RPC", async () => {
    const rpc = vi.fn((name: string) =>
      Promise.resolve({
        data:
          name === "get_puzzle_leaderboard"
            ? [
                {
                  username: "solver",
                  rating: 2200,
                  rating_deviation: 50,
                  attempted: 600,
                  correct: 400,
                  activity_attempts: 2,
                  average_seconds: 30,
                },
              ]
            : [{ month: "2026-10" }],
        error: null,
      }),
    );
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "leaderboard", period: "all" }),
    });

    expect(rpc).toHaveBeenCalledWith("get_puzzle_leaderboard", {
      p_period: "all",
      p_month: null,
    });
    expect(JSON.parse(response.body).rows[0]).toMatchObject({
      username: "solver",
      attempted: 600,
      activityAttempts: 2,
    });
  });

  it("returns pre-aggregated puzzle ranking trophies", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          username: "solver",
          month: "2026-09",
          rank: 1,
          eligible: true,
          rating: 2400,
          rating_deviation: 50,
          attempted: 20,
          correct: 10,
        },
      ],
      error: null,
    }));
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "trophies" }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("get_puzzle_ranking_trophies");
    expect(JSON.parse(response.body).rows).toEqual([
      expect.objectContaining({ username: "solver", month: "2026-09", rank: 1 }),
    ]);
  });

  it("updates the V preset without replaying historical player ratings", async () => {
    const row = {
      puzzle_id: 42,
      level: 5,
      rating: 2700,
      rating_deviation: 150,
      attempts: 9,
      successes: 2,
      source: "human",
      updated_at: "2026-09-29T00:00:00.000Z",
    };
    const single = vi.fn(async () => ({ data: row, error: null }));
    const rpc = vi.fn(() => ({ single }));
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("seaside_tiramisu"),
      body: JSON.stringify({ puzzleId: 42, level: 5 }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_human_puzzle_level", {
      p_puzzle_id: 42,
      p_username: "seaside_tiramisu",
      p_level: 5,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(JSON.parse(response.body)).toEqual({
      puzzleId: 42,
      level: 5,
      rating: 2700,
      ratingDeviation: 150,
      attempts: 9,
      successes: 2,
      source: "human",
      updatedAt: "2026-09-29T00:00:00.000Z",
    });
  });
});
