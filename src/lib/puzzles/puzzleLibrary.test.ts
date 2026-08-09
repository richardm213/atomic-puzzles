import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase/supabasePuzzles", () => ({
  fetchPuzzleCatalogFromSupabase: vi.fn(),
  fetchPuzzleRowsByIdFromSupabase: vi.fn(),
}));

import {
  fetchPuzzleCatalogFromSupabase,
  fetchPuzzleRowsByIdFromSupabase,
} from "../supabase/supabasePuzzles";
import { loadPuzzleCatalog, loadPuzzlesById } from "./puzzleLibrary";

const fetchCatalogMock = fetchPuzzleCatalogFromSupabase as unknown as ReturnType<typeof vi.fn>;
const fetchDetailsMock = fetchPuzzleRowsByIdFromSupabase as unknown as ReturnType<typeof vi.fn>;

describe("puzzleLibrary", () => {
  beforeEach(() => {
    fetchCatalogMock.mockReset();
    fetchDetailsMock.mockReset();
  });
  afterEach(() => {
    fetchCatalogMock.mockReset();
    fetchDetailsMock.mockReset();
  });

  it("loads a lightweight catalog without parsing solutions", async () => {
    fetchCatalogMock.mockResolvedValueOnce([
      { id: 7, author: "alice", event: "ACL 2026", tags: ["fork", "not_a_motif"] },
      { id: "not-a-number", author: "bob", event: "AWC 2026" },
    ]);

    const puzzles = await loadPuzzleCatalog();

    expect(puzzles).toEqual([
      expect.objectContaining({
        puzzleId: 7,
        fen: "",
        solution: "",
        author: "alice",
        tags: ["fork"],
      }),
      expect.objectContaining({ puzzleId: 2, fen: "", solution: "", author: "bob" }),
    ]);
  });

  it("filters requested rows without a fen and ones with no solution moves", async () => {
    fetchDetailsMock.mockResolvedValueOnce([
      { id: 1, fen: "  ", solution: "1. e4" },
      {
        id: 2,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "1. e4 e5",
        explanation: "  Controls the center.  ",
      },
      {
        id: 3,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "garbage",
      },
    ]);

    const puzzles = await loadPuzzlesById([1, 2, 3]);
    expect(puzzles).toHaveLength(1);
    expect(puzzles[0]?.puzzleId).toBe(2);
    expect(puzzles[0]?.solution).toContain("e4");
    expect(puzzles[0]?.explanation).toBe("Controls the center.");
  });

  it("reads details from any candidate solution field and preserves requested order", async () => {
    fetchDetailsMock.mockResolvedValueOnce([
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
    const puzzles = await loadPuzzlesById([2, 1]);
    expect(puzzles).toHaveLength(2);
    expect(puzzles[0]?.puzzleId).toBe(2);
    expect(puzzles[0]?.solution).toContain("e5");
    expect(puzzles[1]?.puzzleId).toBe(1);
    expect(puzzles[1]?.solution).toContain("e4");
  });
});
