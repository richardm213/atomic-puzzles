import type { ChessboardState } from "../../types/chessboard";
import { getBoardLineState } from "./boardState";

const state = (overrides: Partial<ChessboardState>): ChessboardState => ({
  fen: "start",
  turn: "white",
  status: "",
  error: "",
  showWrongMove: false,
  solved: false,
  ...overrides,
});

describe("getBoardLineState", () => {
  it("keeps the board history visible when it is not in the stored variations", () => {
    const result = getBoardLineState(
      state({
        lineMoves: ["e4", "c5"],
        lineIndex: 9,
        customLines: [["e4?", "e5"]],
        activeLine: { source: "history" },
      }),
    );

    expect(result.lines).toEqual([
      ["e4?", "e5"],
      ["e4", "c5"],
    ]);
    expect(result.activeLineIndex).toBe(1);
    expect(result.currentPly).toBe(2);
    expect(result.currentMoves).toEqual(["e4", "c5"]);
  });

  it("maps an exact custom copy back to the deduplicated displayed line", () => {
    const result = getBoardLineState(
      state({
        lineMoves: ["e4", "e5"],
        lineIndex: 1,
        solutionLines: [["e4", "e5"]],
        customLines: [["e4?", "e5"]],
        activeLine: { source: "custom", index: 0 },
      }),
    );

    expect(result.lines).toEqual([["e4", "e5"]]);
    expect(result.activeLineIndex).toBe(0);
    expect(result.lineTargets).toEqual([{ source: "solution", index: 0 }]);
  });

  it("maps a partial played history to the full line it follows", () => {
    const result = getBoardLineState(
      state({
        lineMoves: ["e4"],
        lineIndex: 1,
        solutionLines: [["e4", "e5", "Nf3"]],
        activeLine: { source: "history" },
      }),
    );

    expect(result.lines).toEqual([["e4", "e5", "Nf3"]]);
    expect(result.activeLineIndex).toBe(0);
    expect(result.currentMoves).toEqual(["e4"]);
  });

  it("retains legacy active-line fields while older callers are migrated", () => {
    const result = getBoardLineState(
      state({
        lineMoves: ["d4", "d5"],
        lineIndex: 1,
        customLines: [
          ["e4", "e5"],
          ["d4", "d5"],
        ],
        customLineIndex: 1,
      }),
    );

    expect(result.activeLine).toEqual({ source: "custom", index: 1 });
    expect(result.activeLineIndex).toBe(1);
  });
});
