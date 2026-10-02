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
      body: JSON.stringify({ puzzleId: "42", puzzleCorrect: true, attemptDurationMs: 1_000 }),
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
    const query = ratingEventQuery();
    mocks.createClient.mockReturnValue({ rpc, from: vi.fn(() => query) });
    const cookie = createSiteSessionCookie("Actual_Solver", {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: cookie.split(";")[0] },
      body: JSON.stringify({
        username: "impersonated-victim",
        puzzleId: "42",
        puzzleCorrect: false,
        attemptDurationMs: 12_345,
        incorrectMove: "2. Nf3+",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_first_puzzle_attempt_v2", {
      p_username: "actual_solver",
      p_puzzle_id: "42",
      p_puzzle_correct: false,
      p_attempt_duration_ms: 12_345,
      p_incorrect_move: "2. Nf3+",
      p_correct_move: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(response.body)).toMatchObject({ coinAward: 0, coinDelta: 0 });
  });

  it("returns an incorrect-attempt penalty as a signed coin delta", async () => {
    const rpc = vi.fn(async () => ({ data: -5, error: null }));
    const query = ratingEventQuery();
    mocks.createClient.mockReturnValue({ rpc, from: vi.fn(() => query) });
    const cookie = createSiteSessionCookie("Solver", {});

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: cookie.split(";")[0] },
      body: JSON.stringify({
        puzzleId: "42",
        puzzleCorrect: false,
        attemptDurationMs: 1_000,
        incorrectMove: "2. Nf3+",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ coinAward: 0, coinDelta: -5 });
  });

  it("records a correct alternate solution move", async () => {
    const rpc = vi.fn(async () => ({ data: 2, error: null }));
    const query = ratingEventQuery();
    mocks.createClient.mockReturnValue({ rpc, from: vi.fn(() => query) });
    const cookie = createSiteSessionCookie("Solver", {});

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: cookie.split(";")[0] },
      body: JSON.stringify({
        puzzleId: "43",
        puzzleCorrect: true,
        attemptDurationMs: 4_321,
        correctMove: "3. Qg5",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_first_puzzle_attempt_v2", {
      p_username: "solver",
      p_puzzle_id: "43",
      p_puzzle_correct: true,
      p_attempt_duration_ms: 4_321,
      p_incorrect_move: null,
      p_correct_move: "3. Qg5",
    });
    expect(JSON.parse(response.body)).toMatchObject({ coinAward: 2, coinDelta: 2 });
  });

  it("records no duration after the one-hour timer expires", async () => {
    const rpc = vi.fn(async () => ({ data: 0, error: null }));
    const query = ratingEventQuery();
    mocks.createClient.mockReturnValue({ rpc, from: vi.fn(() => query) });
    const cookie = createSiteSessionCookie("Solver", {});

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: cookie.split(";")[0] },
      body: JSON.stringify({
        puzzleId: "44",
        puzzleCorrect: false,
        attemptDurationMs: null,
        incorrectMove: "1. Kf2",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_first_puzzle_attempt_v2", {
      p_username: "solver",
      p_puzzle_id: "44",
      p_puzzle_correct: false,
      p_attempt_duration_ms: null,
      p_incorrect_move: "1. Kf2",
      p_correct_move: null,
    });
  });

  it("does not write progress for a tampered site cookie", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: "atomic_session=tampered" },
      body: JSON.stringify({ puzzleId: "42", puzzleCorrect: true, attemptDurationMs: 1_000 }),
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
