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

  afterEach(() => vi.unstubAllEnvs());

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
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("seaside_tiramisu"),
      body: JSON.stringify({ action: "refresh" }),
    });

    expect(response.statusCode).toBe(200);
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
        },
      ],
    });
  });

  it("builds monthly rankings from each player's final event in the selected month", async () => {
    const query = {
      select: vi.fn(),
      gte: vi.fn(),
      lt: vi.fn(),
      order: vi.fn(),
      range: vi.fn(async () => ({
        data: [
          {
            username: "solver",
            attempted_at: "2026-09-01T00:00:00.000Z",
            puzzle_correct: false,
            user_rating_after: 1990,
            user_rd_after: 80,
          },
          {
            username: "solver",
            attempted_at: "2026-09-30T23:59:59.000Z",
            puzzle_correct: true,
            user_rating_after: 2040,
            user_rd_after: 55,
          },
          {
            username: "other",
            attempted_at: "2026-09-15T00:00:00.000Z",
            puzzle_correct: true,
            user_rating_after: 2100,
            user_rd_after: 50,
          },
        ],
        error: null,
      })),
    };
    query.select.mockReturnValue(query);
    query.gte.mockReturnValue(query);
    query.lt.mockReturnValue(query);
    query.order.mockReturnValue(query);
    mocks.createClient.mockReturnValue({ from: vi.fn(() => query) });

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "leaderboard", period: "monthly", month: "2026-09" }),
    });

    expect(response.statusCode).toBe(200);
    expect(query.gte).toHaveBeenCalledWith("attempted_at", "2026-09-01T00:00:00.000Z");
    expect(query.lt).toHaveBeenCalledWith("attempted_at", "2026-10-01T00:00:00.000Z");
    expect(JSON.parse(response.body)).toEqual({
      rows: [
        {
          username: "solver",
          rating: 2040,
          ratingDeviation: 55,
          attempted: 2,
          correct: 1,
        },
        {
          username: "other",
          rating: 2100,
          ratingDeviation: 50,
          attempted: 1,
          correct: 1,
        },
      ],
    });
  });

  it("updates the V preset without replaying historical player ratings", async () => {
    const row = {
      puzzle_id: 42,
      level: 5,
      rating: 2700,
      rating_deviation: 75,
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
      ratingDeviation: 75,
      attempts: 9,
      successes: 2,
      source: "human",
      updatedAt: "2026-09-29T00:00:00.000Z",
    });
  });
});
