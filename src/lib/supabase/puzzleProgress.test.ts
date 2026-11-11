import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("./client", () => ({
  getSupabaseClient: () => ({
    rpc: rpcMock,
    from: fromMock,
  }),
}));

import {
  fetchAttemptedPuzzleIds,
  fetchPuzzleAttemptsForPuzzle,
  fetchPuzzleProgressPage,
  recordPuzzleProgress,
} from "./puzzleProgress";

describe("fetchPuzzleProgressPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    rpcMock.mockReset();
    window.localStorage.clear();
  });

  it("does not slice RPC rows a second time when loading a later page", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          puzzle_id: "21",
          first_attempt_at: "2026-06-02T00:00:00.000Z",
          first_attempt_duration_ms: 12_345,
          puzzle_correct: true,
          total_count: 27,
        },
        {
          puzzle_id: "22",
          first_attempt_at: "2026-06-01T00:00:00.000Z",
          puzzle_correct: false,
          total_count: 27,
        },
      ],
      error: null,
    });

    const page = await fetchPuzzleProgressPage("whooooami", { page: 2, pageSize: 20 });

    expect(rpcMock).toHaveBeenCalledWith("get_puzzle_progress_page_v3", {
      p_username: "whooooami",
      p_page: 2,
      p_page_size: 20,
    });
    expect(page.total).toBe(27);
    expect(page.rows.map((row) => row.puzzle_id)).toEqual(["21", "22"]);
    expect(page.rows[0]?.first_attempt_duration_ms).toBe(12_345);
  });

  it("records an incorrect move without changing its SAN notation", async () => {
    const coinChangeListener = vi.fn();
    window.addEventListener("atomic-puzzles:coins-earned", coinChangeListener);
    const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ recorded: true, coinDelta: -3.21644 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await recordPuzzleProgress({
      username: "Solver",
      puzzleId: "42",
      puzzleCorrect: false,
      attemptDurationMs: 12_345,
      incorrectMove: "2. Nf3+",
      correctMove: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/puzzles/progress",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
        body: JSON.stringify({
          puzzleId: "42",
          puzzleCorrect: false,
          attemptDurationMs: 12_345,
          incorrectMove: "2. Nf3+",
          correctMove: null,
        }),
      }),
    );
    expect(window.localStorage.getItem("atomic-puzzles.puzzle-progress.solver")).toBeNull();
    expect(coinChangeListener).toHaveBeenCalledOnce();
    expect((coinChangeListener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      amount: -3.21644,
      label: "Incorrect attempt",
      username: "Solver",
    });
    window.removeEventListener("atomic-puzzles:coins-earned", coinChangeListener);
  });

  it("coalesces concurrent submissions and announces a replayed debit only once", async () => {
    const listener = vi.fn();
    window.addEventListener("atomic-puzzles:coins-earned", listener);
    let resolveFetch!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ coinDelta: -0.5, graded: true, duplicate: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    const input = {
      username: "solver",
      puzzleId: "42",
      puzzleCorrect: false,
      attemptDurationMs: 1000,
      incorrectMove: "1. e4",
      correctMove: null,
      attempt: {
        id: "6de4a619-bcee-4d9a-8af8-e9c736e17eae",
        pgn: "1. e4 *",
        runId: "bf6cd63f-c399-4d3c-905c-04ab563e8949",
      },
    };
    try {
      const first = recordPuzzleProgress(input);
      const second = recordPuzzleProgress(input);
      expect(fetchMock).toHaveBeenCalledOnce();
      resolveFetch(
        new Response(JSON.stringify({ coinDelta: -0.5, graded: true, rated: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      await Promise.all([first, second]);
      await recordPuzzleProgress(input);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]?.[0].detail).toMatchObject({ amount: -0.5, precise: true });
      const payloads = fetchMock.mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
      expect(payloads[0].attempt).toEqual(input.attempt);
      expect(payloads[1].attempt).toEqual(input.attempt);
    } finally {
      window.removeEventListener("atomic-puzzles:coins-earned", listener);
    }
  });

  it("uses Supabase as the sole source of attempted puzzle ids", async () => {
    window.localStorage.setItem(
      "atomic-puzzles.puzzle-progress.whooooami",
      JSON.stringify([
        {
          puzzle_id: "79",
          first_attempt_at: "2026-09-21T00:00:00.000Z",
          puzzle_correct: true,
          incorrect_move: null,
        },
      ]),
    );
    rpcMock.mockResolvedValue({ data: [], error: null });

    const attemptedIds = await fetchAttemptedPuzzleIds("whooooami");

    expect(attemptedIds).toEqual(new Set());
    expect(rpcMock).toHaveBeenCalledWith("get_rated_puzzle_ids", {
      p_username: "whooooami",
    });
  });

  it("records the first divergent move for a correct alternate solution", async () => {
    const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ recorded: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await recordPuzzleProgress({
      username: "Solver",
      puzzleId: "43",
      puzzleCorrect: true,
      attemptDurationMs: 4_321,
      incorrectMove: null,
      correctMove: "3. Qg5",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/puzzles/progress",
      expect.objectContaining({
        body: JSON.stringify({
          puzzleId: "43",
          puzzleCorrect: true,
          attemptDurationMs: 4_321,
          incorrectMove: null,
          correctMove: "3. Qg5",
        }),
      }),
    );
  });

  it("sends a null duration after timing expires", async () => {
    const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ recorded: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await recordPuzzleProgress({
      username: "Solver",
      puzzleId: "44",
      puzzleCorrect: false,
      attemptDurationMs: null,
      incorrectMove: "1. Kf2",
      correctMove: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/puzzles/progress",
      expect.objectContaining({
        body: JSON.stringify({
          puzzleId: "44",
          puzzleCorrect: false,
          attemptDurationMs: null,
          incorrectMove: "1. Kf2",
          correctMove: null,
        }),
      }),
    );
  });

  it("filters rows and totals by a since date", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          puzzle_id: "3",
          first_attempt_at: "2026-07-03T12:00:00.000Z",
          puzzle_correct: true,
          total_count: 3,
        },
        {
          puzzle_id: "2",
          first_attempt_at: "2026-07-02T12:00:00.000Z",
          puzzle_correct: false,
          total_count: 3,
        },
        {
          puzzle_id: "1",
          first_attempt_at: "2026-07-01T12:00:00.000Z",
          puzzle_correct: true,
          total_count: 3,
        },
      ],
      error: null,
    });

    const page = await fetchPuzzleProgressPage("whooooami", {
      page: 1,
      pageSize: 20,
      sinceDate: "2026-07-02",
    });

    expect(rpcMock).toHaveBeenCalledWith("get_puzzle_progress_page_v3", {
      p_username: "whooooami",
      p_page: 1,
      p_page_size: 1000,
    });
    expect(page.total).toBe(2);
    expect(page.rows.map((row) => row.puzzle_id)).toEqual(["3", "2"]);
  });
});

describe("fetchPuzzleAttemptsForPuzzle", () => {
  it("filters solved players in the query while preserving their original incorrect result", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: [
            {
              username: "Recovered",
              puzzle_id: "1742",
              first_attempt_at: "2026-11-10T00:00:00Z",
              puzzle_correct: false,
              has_solved: true,
              incorrect_move: "18. e4",
              solved_move: " 18. d5 ",
            },
          ],
          error: null,
        }).then(resolve),
    };
    fromMock.mockReturnValue(query);
    const rows = await fetchPuzzleAttemptsForPuzzle("1742", { correctOnly: true, limit: 30 });
    expect(query.eq).toHaveBeenCalledWith("has_solved", true);
    expect(query.limit).toHaveBeenCalledWith(30);
    expect(rows[0]).toMatchObject({
      puzzle_correct: false,
      has_solved: true,
      solved_move: "18. d5",
      incorrect_move: "18. e4",
    });
  });
});
