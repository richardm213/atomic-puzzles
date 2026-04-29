import { afterEach,beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase/supabasePuzzles", () => ({
  fetchPuzzleRowsFromSupabase: vi.fn(),
}));

import { fetchPuzzleRowsFromSupabase } from "../supabase/supabasePuzzles";
import { loadPuzzleLibrary } from "./puzzleLibrary";

const fetchMock = fetchPuzzleRowsFromSupabase as unknown as ReturnType<typeof vi.fn>;

describe("loadPuzzleLibrary", () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => fetchMock.mockReset());

  it("filters out rows without a fen and ones with no solution moves", async () => {
    fetchMock.mockResolvedValueOnce([
      { id: 1, fen: "  ", solution: "1. e4" },
      {
        id: 2,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "1. e4 e5",
      },
      {
        id: 3,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "garbage",
      },
    ]);

    const puzzles = await loadPuzzleLibrary();
    expect(puzzles).toHaveLength(1);
    expect(puzzles[0]?.puzzleId).toBe(2);
    expect(puzzles[0]?.solution).toContain("e4");
  });

  it("falls back to index+1 for puzzleId when the row id is not numeric", async () => {
    fetchMock.mockResolvedValueOnce([
      {
        id: "not-a-number",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "1. e4",
      },
    ]);
    const puzzles = await loadPuzzleLibrary();
    expect(puzzles[0]?.puzzleId).toBe(1);
  });

  it("reads the solution from any of the candidate fields", async () => {
    fetchMock.mockResolvedValueOnce([
      {
        id: 1,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        moves: "1. e4",
      },
      {
        id: 2,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        line: ["e4", "e5"],
      },
    ]);
    const puzzles = await loadPuzzleLibrary();
    expect(puzzles).toHaveLength(2);
    expect(puzzles[0]?.solution).toContain("e4");
    expect(puzzles[1]?.solution).toContain("e5");
  });
});
