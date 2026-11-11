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
  const savedAttempt = {
    coinDelta: 0,
    rated: true,
    unratedUntil: null,
    ratingEvent: null,
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
    const rpc = vi.fn(async () => ({ data: savedAttempt, error: null }));
    mocks.createClient.mockReturnValue({ rpc });
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
    expect(rpc).toHaveBeenCalledWith("record_puzzle_attempt_result", {
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

  it("saves a resignation PGN under the authenticated identity", async () => {
    const rpc = vi.fn(async () => ({ data: { ...savedAttempt, rated: false }, error: null }));
    mocks.createClient.mockReturnValue({ rpc });
    const id = "8b298685-4ce8-4d69-9654-2dd18ea6864a";
    const pgn = '[Variant "Atomic"]\n\n7... e5 *';

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: createSiteSessionCookie("Solver", {}).split(";")[0] },
      body: JSON.stringify({
        username: "different-player",
        puzzleId: "42",
        puzzleCorrect: false,
        attemptDurationMs: null,
        attempt: { id, pgn, runId: "bf6cd63f-c399-4d3c-905c-04ab563e8949", resigned: true },
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("submit_puzzle_run_attempt", {
      p_username: "solver",
      p_puzzle_id: "42",
      p_attempt_id: id,
      p_attempt_pgn: pgn,
      p_outcome: "resigned",
      p_run_id: "bf6cd63f-c399-4d3c-905c-04ab563e8949",
      p_attempt_duration_ms: null,
      p_correct_move: null,
      p_incorrect_move: null,
    });
  });

  it("returns grading eligibility for the authenticated player", async () => {
    const grading = {
      runId: null,
      graded: false,
      availableAt: "2027-01-10T12:00:00Z",
      permanent: false,
      hasAttempted: true,
      hasSolved: true,
      misses: 0,
      color: "green",
    };
    const rpc = vi.fn(async () => ({ data: grading, error: null }));
    mocks.createClient.mockReturnValue({ rpc });
    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: createSiteSessionCookie("Solver", {}).split(";")[0] },
      body: JSON.stringify({ action: "gradingState", puzzleId: "42", username: "victim" }),
    });
    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_puzzle_grading_state", {
      p_username: "solver",
      p_puzzle_id: "42",
    });
    expect(JSON.parse(response.body)).toEqual(grading);
  });

  it.each([true, false])(
    "sets the unrated preference for the signed-in identity (%s)",
    async (permanentlyUnrated) => {
      const rpc = vi.fn(async () => ({ data: true, error: null }));
      mocks.createClient.mockReturnValue({ rpc });
      const response = await handler({
        httpMethod: "POST",
        headers: { cookie: createSiteSessionCookie("Author", {}).split(";")[0] },
        body: JSON.stringify({
          action: "markUnrated",
          puzzleId: "42",
          permanentlyUnrated,
          username: "victim",
        }),
      });
      expect(response.statusCode).toBe(200);
      expect(rpc).toHaveBeenCalledWith("set_own_puzzle_permanently_unrated", {
        p_username: "author",
        p_puzzle_id: "42",
        p_permanent: permanentlyUnrated,
      });
      expect(JSON.parse(response.body)).toMatchObject({ permanentlyUnrated });
    },
  );

  it.each([
    { message: "puzzle_not_authored_by_user", status: 403 },
    { message: "puzzle_already_rated", status: 409 },
    { message: "puzzle_already_attempted", status: 409 },
  ])("rejects permanent unrated changes when $message", async ({ message, status }) => {
    const rpc = vi.fn(async () => ({ data: null, error: { message } }));
    mocks.createClient.mockReturnValue({ rpc });
    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: createSiteSessionCookie("Author", {}).split(";")[0] },
      body: JSON.stringify({ action: "markUnrated", puzzleId: "42" }),
    });
    expect(response.statusCode).toBe(status);
  });

  it("returns an incorrect-attempt penalty as a signed coin delta", async () => {
    const rpc = vi.fn(async () => ({
      data: { ...savedAttempt, coinDelta: -3.21644 },
      error: null,
    }));
    mocks.createClient.mockReturnValue({ rpc });
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
    expect(JSON.parse(response.body)).toMatchObject({ coinAward: 0, coinDelta: -3.21644 });
  });

  it.each([
    {
      message: "daily_puzzle_attempt_limit_reached",
      status: 429,
      code: "daily_puzzle_attempt_limit",
    },
    { message: "puzzle_rating_exclusion_active", status: 403, code: "puzzle_rating_excluded" },
    { message: "puzzle_run_finished", status: 409, code: "puzzle_run_finished" },
  ])("returns $code when the database rejects an attempt", async ({ message, status, code }) => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message },
    }));
    mocks.createClient.mockReturnValue({ rpc });
    const cookie = createSiteSessionCookie("Solver", {});

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: cookie.split(";")[0] },
      body: JSON.stringify({
        puzzleId: "201",
        puzzleCorrect: true,
        attemptDurationMs: 1_000,
      }),
    });

    expect(response.statusCode).toBe(status);
    expect(JSON.parse(response.body)).toMatchObject({
      code,
    });
  });

  it("reports an unrated attempt without manufacturing a rating event", async () => {
    const rpc = vi.fn(async () => ({
      data: { ...savedAttempt, rated: false, unratedUntil: "2027-01-10T12:00:00Z" },
      error: null,
    }));
    mocks.createClient.mockReturnValue({ rpc });
    const cookie = createSiteSessionCookie("Puzzle_Author", {});

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: cookie.split(";")[0] },
      body: JSON.stringify({
        puzzleId: "42",
        puzzleCorrect: true,
        attemptDurationMs: 1_000,
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      coinAward: 0,
      coinDelta: 0,
      rated: false,
      unratedUntil: "2027-01-10T12:00:00Z",
      ratingEvent: null,
    });
  });

  it("records a correct alternate solution move", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ...savedAttempt,
        coinDelta: 2,
        ratingEvent: {
          username: "solver",
          puzzleId: "43",
          attemptedAt: "2026-09-29T00:00:00.000Z",
          puzzleCorrect: true,
          userRatingBefore: 2000,
          userRatingAfter: 2018,
          userRatingDeviationBefore: 350,
          userRatingDeviationAfter: 290,
          puzzleRatingBefore: 2100,
          puzzleRatingAfter: 2086,
        },
      },
      error: null,
    }));
    mocks.createClient.mockReturnValue({ rpc });
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
    expect(rpc).toHaveBeenCalledWith("record_puzzle_attempt_result", {
      p_username: "solver",
      p_puzzle_id: "43",
      p_puzzle_correct: true,
      p_attempt_duration_ms: 4_321,
      p_incorrect_move: null,
      p_correct_move: "3. Qg5",
    });
    expect(JSON.parse(response.body)).toMatchObject({
      coinAward: 2,
      coinDelta: 2,
      ratingEvent: {
        puzzleRatingBefore: 2100,
        puzzleRatingAfter: 2086,
      },
    });
  });

  it("records no duration after the one-hour timer expires", async () => {
    const rpc = vi.fn(async () => ({ data: savedAttempt, error: null }));
    mocks.createClient.mockReturnValue({ rpc });
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
    expect(rpc).toHaveBeenCalledWith("record_puzzle_attempt_result", {
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
