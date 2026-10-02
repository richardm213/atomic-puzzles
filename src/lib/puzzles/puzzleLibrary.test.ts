import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase/puzzles", () => ({
  fetchPuzzleCatalogFromSupabase: vi.fn(),
  fetchPuzzleSolverIndexFromSupabase: vi.fn(),
}));
vi.mock("./puzzlePlay", () => ({ fetchPuzzleDetails: vi.fn() }));

import {
  fetchPuzzleCatalogFromSupabase,
  fetchPuzzleSolverIndexFromSupabase,
} from "../supabase/puzzles";
import { loadPuzzleCatalog, loadPuzzlesById, loadPuzzleSolverIndex } from "./puzzleLibrary";
import { fetchPuzzleDetails } from "./puzzlePlay";

const fetchCatalogMock = fetchPuzzleCatalogFromSupabase as unknown as ReturnType<typeof vi.fn>;
const fetchDetailsMock = fetchPuzzleDetails as unknown as ReturnType<typeof vi.fn>;
const fetchSolverIndexMock = fetchPuzzleSolverIndexFromSupabase as unknown as ReturnType<
  typeof vi.fn
>;

describe("puzzleLibrary", () => {
  beforeEach(() => {
    fetchCatalogMock.mockReset();
    fetchDetailsMock.mockReset();
    fetchSolverIndexMock.mockReset();
  });
  afterEach(() => {
    fetchCatalogMock.mockReset();
    fetchDetailsMock.mockReset();
    fetchSolverIndexMock.mockReset();
  });

  it("loads the solver index from id-only rows", async () => {
    fetchSolverIndexMock.mockResolvedValueOnce([{ id: 7 }, { id: 12 }]);

    const puzzles = await loadPuzzleSolverIndex();

    expect(puzzles).toEqual([
      expect.objectContaining({ puzzleId: 7, fen: "", solution: "" }),
      expect.objectContaining({ puzzleId: 12, fen: "", solution: "" }),
    ]);
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

  it("filters requested rows without a fen and keeps hidden solutions empty", async () => {
    fetchDetailsMock.mockResolvedValueOnce([
      { id: 1, fen: "  ", solution: "1. e4" },
      {
        id: 2,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        explanation: "  Controls the center.  ",
      },
      {
        id: 3,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      },
    ]);

    const puzzles = await loadPuzzlesById([1, 2, 3]);
    expect(puzzles).toHaveLength(2);
    expect(puzzles[0]?.puzzleId).toBe(2);
    expect(puzzles[0]?.solution).toBe("");
    expect(puzzles[0]?.explanation).toBe("Controls the center.");
  });

  it("preserves requested detail order", async () => {
    fetchDetailsMock.mockResolvedValueOnce([
      {
        id: 1,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      },
      {
        id: 2,
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      },
    ]);
    const puzzles = await loadPuzzlesById([2, 1]);
    expect(puzzles).toHaveLength(2);
    expect(puzzles[0]?.puzzleId).toBe(2);
    expect(puzzles[0]?.solution).toBe("");
    expect(puzzles[1]?.puzzleId).toBe(1);
    expect(puzzles[1]?.solution).toBe("");
  });
});
