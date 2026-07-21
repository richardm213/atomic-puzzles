import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: () => ({
    rpc: rpcMock,
  }),
}));

import { fetchPuzzleProgressPage, recordPuzzleProgress } from "./supabasePuzzleProgress";

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

    expect(rpcMock).toHaveBeenCalledWith("get_puzzle_progress_page", {
      p_username: "whooooami",
      p_page: 2,
      p_page_size: 20,
    });
    expect(page.total).toBe(27);
    expect(page.rows.map((row) => row.puzzle_id)).toEqual(["21", "22"]);
  });

  it("records an incorrect move without changing its SAN notation", async () => {
    const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ recorded: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await recordPuzzleProgress({
      username: "Solver",
      puzzleId: "42",
      puzzleCorrect: false,
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
          incorrectMove: "2. Nf3+",
          correctMove: null,
        }),
      }),
    );
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
      incorrectMove: null,
      correctMove: "3. Qg5",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/puzzles/progress",
      expect.objectContaining({
        body: JSON.stringify({
          puzzleId: "43",
          puzzleCorrect: true,
          incorrectMove: null,
          correctMove: "3. Qg5",
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

    expect(rpcMock).toHaveBeenCalledWith("get_puzzle_progress_page", {
      p_username: "whooooami",
      p_page: 1,
      p_page_size: 1000,
    });
    expect(page.total).toBe(2);
    expect(page.rows.map((row) => row.puzzle_id)).toEqual(["3", "2"]);
  });
});
