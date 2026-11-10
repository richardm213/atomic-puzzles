import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { handler } from "../functions/puzzle-play";
import { createSiteSessionCookie } from "../lib/siteSession";

const authHeaders = () => ({
  cookie: createSiteSessionCookie("solver", {}).split(";")[0],
});

const puzzleFen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1";
const beforeFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

const createPuzzleQuery = () => {
  const query = {
    select: vi.fn(),
    in: vi.fn(),
    is: vi.fn(async () => ({
      data: [{ id: 414, fen: puzzleFen, solution: "2. Nf3", game_moves: ["e4", "e5", "Nf3"] }],
      error: null,
    })),
  };
  query.select.mockReturnValue(query);
  query.in.mockReturnValue(query);
  return query;
};

const createDailyAttemptQuery = (count = 0) => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(async () => ({ count, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  return query;
};

const createAttemptedPuzzleQuery = (puzzleIds: string[]) => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(async () => ({
      data: puzzleIds.map((puzzle_id) => ({ puzzle_id })),
      error: null,
    })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
};

describe("puzzle-play function", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv(
      "SITE_SESSION_SECRET",
      "test-session-secret-that-is-longer-than-thirty-two-characters",
    );
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("requires a signed site session before returning playable puzzle data", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ puzzleIds: [414] }),
    });

    expect(response.statusCode).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("denies test-mode detail requests from regular players before querying data", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ puzzleIds: [414], testMode: true }),
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("serves admin test-mode details without accessing the attempt ledger", async () => {
    const query = createPuzzleQuery();
    const from = vi.fn(() => query);
    mocks.createClient.mockReturnValue({
      rpc: vi.fn(async () => ({ data: [], error: null })),
      from,
    });

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: createSiteSessionCookie("seaside_tiramisu", {}).split(";")[0] },
      body: JSON.stringify({ puzzleIds: [414], testMode: true }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      puzzles: [{ id: 414 }],
      dailyLimitReached: false,
    });
    expect(from.mock.calls).toEqual([["puzzles"]]);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("returns the opponent intro but not the source game continuation", async () => {
    const query = createPuzzleQuery();
    const dailyAttemptQuery = createDailyAttemptQuery();
    mocks.createClient.mockReturnValue({
      rpc: vi.fn(async () => ({ data: [], error: null })),
      from: vi.fn((table: string) => (table === "puzzles" ? query : dailyAttemptQuery)),
    });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ puzzleIds: [414] }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      puzzles: [
        {
          id: 414,
          fen: puzzleFen,
          solution: "2. Nf3",
          intro: { beforeFen, san: "e5", uci: "e7e5" },
          leadIn: {
            beforeFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            moves: ["e4", "e5"],
          },
        },
      ],
      blockedPuzzleIds: [],
      dailyLimitReached: false,
    });
    expect(query.in).toHaveBeenCalledWith("id", [414]);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it.each([false, true])("withholds excluded puzzle data (prefetch: %s)", async (prefetch) => {
    const query = createPuzzleQuery();
    const dailyAttemptQuery = createDailyAttemptQuery();
    const lockedId = prefetch ? "415" : "414";
    const rpc = vi.fn(async () => ({
      data: [{ puzzle_id: lockedId, expires_at: "2027-01-10T12:00:00Z" }],
      error: null,
    }));
    const from = vi.fn((table: string) => (table === "puzzles" ? query : dailyAttemptQuery));
    mocks.createClient.mockReturnValue({ rpc, from });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        puzzleIds: [415, 414],
        activePuzzleId: prefetch ? null : 414,
      }),
    });
    if (prefetch) {
      expect(response.statusCode).toBe(200);
      expect(query.in).toHaveBeenCalledWith("id", [414]);
      expect(JSON.parse(response.body).puzzles.map((p: { id: number }) => p.id)).toEqual([414]);
    } else {
      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body)).toMatchObject({ code: "puzzle_rating_excluded" });
      expect(from).not.toHaveBeenCalledWith("puzzles");
      expect(JSON.parse(response.body)).not.toHaveProperty("puzzles");
    }
    expect(rpc).toHaveBeenCalledWith("get_locked_puzzle_ids", {
      p_username: "solver",
      p_puzzle_ids: ["415", "414"],
    });
  });

  it("returns an empty successful prefetch when every requested puzzle is locked", async () => {
    const dailyAttemptQuery = createDailyAttemptQuery();
    const from = vi.fn(() => dailyAttemptQuery);
    mocks.createClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: [{ puzzle_id: "414", expires_at: "2027-01-10T12:00:00Z" }],
        error: null,
      })),
      from,
    });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ puzzleIds: [414], activePuzzleId: null }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      puzzles: [],
      blockedPuzzleIds: [],
      dailyLimitReached: false,
    });
    expect(from).not.toHaveBeenCalledWith("puzzles");
  });

  it("only returns previously attempted puzzles after the UTC daily limit", async () => {
    const puzzleQuery = createPuzzleQuery();
    const dailyAttemptQuery = createDailyAttemptQuery(200);
    const attemptedPuzzleQuery = createAttemptedPuzzleQuery(["414"]);
    let progressQueryCount = 0;
    mocks.createClient.mockReturnValue({
      rpc: vi.fn(async () => ({ data: [], error: null })),
      from: vi.fn((table: string) => {
        if (table === "puzzles") return puzzleQuery;
        progressQueryCount += 1;
        return progressQueryCount === 1 ? dailyAttemptQuery : attemptedPuzzleQuery;
      }),
    });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ puzzleIds: [414, 415] }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      puzzles: [{ id: 414 }],
      blockedPuzzleIds: [415],
      dailyLimitReached: true,
    });
    expect(puzzleQuery.in).toHaveBeenCalledWith("id", [414]);
    expect(puzzleQuery.is).toHaveBeenCalledWith("deleted_at", null);
  });

  it("rejects cross-site puzzle detail requests", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: { origin: "https://attacker.example", host: "atomicpuzzles.org" },
      body: JSON.stringify({ puzzleIds: [414] }),
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects batches larger than the current prefetch limit", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ puzzleIds: Array.from({ length: 13 }, (_, index) => index + 1) }),
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
