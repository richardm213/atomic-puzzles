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
const fetchPrivateDetailsMock = fetchPuzzleDetails as unknown as ReturnType<typeof vi.fn>;
const fetchSolverIndexMock = fetchPuzzleSolverIndexFromSupabase as unknown as ReturnType<
  typeof vi.fn
>;

describe("puzzleLibrary", () => {
  beforeEach(() => {
    fetchCatalogMock.mockReset();
    fetchPrivateDetailsMock.mockReset();
    fetchSolverIndexMock.mockReset();
  });
  afterEach(() => {
    fetchCatalogMock.mockReset();
    fetchPrivateDetailsMock.mockReset();
    fetchSolverIndexMock.mockReset();
    vi.unstubAllEnvs();
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

  it("filters requested rows without a fen without excluding catalog entries by solution text", async () => {
    fetchPrivateDetailsMock.mockResolvedValueOnce([
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
    expect(puzzles).toHaveLength(2);
    expect(puzzles[0]?.puzzleId).toBe(2);
    expect(puzzles[0]?.solution).toContain("e4");
    expect(puzzles[0]?.explanation).toBe("Controls the center.");
    expect(puzzles[1]?.puzzleId).toBe(3);
  });

  it("reads details from any candidate solution field and preserves requested order", async () => {
    fetchPrivateDetailsMock.mockResolvedValueOnce([
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

  it("always loads playable details through the authenticated endpoint", async () => {
    fetchPrivateDetailsMock.mockResolvedValueOnce([
      {
        id: 414,
        fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
        solution: "1. O-O-O",
      },
    ]);

    const puzzles = await loadPuzzlesById([414]);

    expect(fetchPrivateDetailsMock).toHaveBeenCalledWith([414]);
    expect(puzzles[0]?.solution).toContain("O-O-O");
  });
});
