import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { handler } from "../functions/puzzle-play";
import { createSiteSessionCookie } from "../lib/siteSession";

const authHeaders = () => ({
  cookie: createSiteSessionCookie("solver", {}).split(";")[0],
});

const createPuzzleQuery = () => {
  const query = {
    select: vi.fn(),
    in: vi.fn(async () => ({
      data: [{ id: 414, fen: "puzzle fen", solution: "18. O-O-O" }],
      error: null,
    })),
  };
  query.select.mockReturnValue(query);
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

  it("returns playable puzzle data to a signed-in user", async () => {
    const query = createPuzzleQuery();
    const dailyAttemptQuery = createDailyAttemptQuery();
    mocks.createClient.mockReturnValue({
      from: vi.fn((table: string) => (table === "puzzles" ? query : dailyAttemptQuery)),
    });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ puzzleIds: [414] }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      puzzles: [{ id: 414, fen: "puzzle fen", solution: "18. O-O-O" }],
      blockedPuzzleIds: [],
      dailyLimitReached: false,
    });
    expect(query.in).toHaveBeenCalledWith("id", [414]);
  });

  it("only returns previously attempted puzzles after the UTC daily limit", async () => {
    const puzzleQuery = createPuzzleQuery();
    const dailyAttemptQuery = createDailyAttemptQuery(200);
    const attemptedPuzzleQuery = createAttemptedPuzzleQuery(["414"]);
    let progressQueryCount = 0;
    mocks.createClient.mockReturnValue({
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
