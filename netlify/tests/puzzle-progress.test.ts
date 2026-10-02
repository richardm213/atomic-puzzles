import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { handler } from "../functions/puzzle-progress";
import { createSiteSessionCookie } from "../lib/siteSession";

describe("puzzle-progress function", () => {
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const ratingEventQuery = () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    return query;
  };

  const puzzleQuery = () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: { fen: START_FEN, solution: "1. e4 e5" },
        error: null,
      })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    return query;
  };

  const serverClient = (rpc: ReturnType<typeof vi.fn>) => {
    const rating = ratingEventQuery();
    const puzzle = puzzleQuery();
    return {
      rpc,
      from: vi.fn((table: string) => (table === "puzzles" ? puzzle : rating)),
    };
  };

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
    vi.unstubAllGlobals();
  });

  it("requires a signed site session", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ puzzleId: "42", moves: ["e2e4", "e7e5"] }),
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects malformed progress values before reading the session", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ puzzleId: "42", puzzleCorrect: "yes" }),
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("takes the progress owner from the signed session, never the request body", async () => {
    const rpc = vi.fn(async () => ({ data: 0, error: null }));
    mocks.createClient.mockReturnValue(serverClient(rpc));
    const cookie = createSiteSessionCookie("Actual_Solver", {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: cookie.split(";")[0] },
      body: JSON.stringify({
        username: "impersonated-victim",
        puzzleId: "42",
        moves: ["d2d4"],
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_first_puzzle_attempt_v2", {
      p_username: "actual_solver",
      p_puzzle_id: "42",
      p_puzzle_correct: false,
      p_incorrect_move: "d4",
      p_correct_move: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(response.body)).toMatchObject({ coinAward: 0 });
  });

  it("records a correct alternate solution move", async () => {
    const rpc = vi.fn(async () => ({ data: 2, error: null }));
    mocks.createClient.mockReturnValue(serverClient(rpc));
    const cookie = createSiteSessionCookie("Solver", {});

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: cookie.split(";")[0] },
      body: JSON.stringify({
        puzzleId: "43",
        moves: ["e2e4", "e7e5"],
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_first_puzzle_attempt_v2", {
      p_username: "solver",
      p_puzzle_id: "43",
      p_puzzle_correct: true,
      p_incorrect_move: null,
      p_correct_move: "e5",
    });
    expect(JSON.parse(response.body)).toMatchObject({ coinAward: 2 });
  });

  it("does not write progress for a tampered site cookie", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: "atomic_session=tampered" },
      body: JSON.stringify({ puzzleId: "42", moves: ["e2e4", "e7e5"] }),
    });

    expect(response.statusCode).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-site progress mutations before reading the session", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: { host: "atomic.example", origin: "https://evil.example" },
      body: JSON.stringify({ puzzleId: "42", puzzleCorrect: true }),
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
