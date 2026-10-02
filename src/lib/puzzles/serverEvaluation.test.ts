import { describe, expect, it } from "vitest";

import { evaluatePuzzleMoves } from "../../../shared/domain/puzzles/serverEvaluation";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("server puzzle evaluation", () => {
  it("keeps the continuation private while returning only the next opponent move", () => {
    expect(evaluatePuzzleMoves(START_FEN, "1. e4 e5 2. Nf3", ["e2e4"])).toEqual({
      evaluation: "accepted",
      solved: false,
      opponentMove: "e7e5",
      moveLabel: "e4",
    });
  });

  it("distinguishes retry annotations from incorrect moves", () => {
    const solution = "1. e4 (1. d4?) e5";
    expect(evaluatePuzzleMoves(START_FEN, solution, ["d2d4"]).evaluation).toBe("retry");
    expect(evaluatePuzzleMoves(START_FEN, solution, ["g1f3"]).evaluation).toBe("wrong");
  });

  it("rejects a fabricated prior move history", () => {
    expect(() =>
      evaluatePuzzleMoves(START_FEN, "1. e4 e5 2. Nf3", ["d2d4", "e7e5", "g1f3"]),
    ).toThrow("Move history does not match this puzzle");
  });
});
