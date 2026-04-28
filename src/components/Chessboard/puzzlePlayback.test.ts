import { describe, expect, it } from "vitest";
import {
  buildSolutionHistory,
  hasExpectedMoveAt,
  recomputeTrainingState,
  tryCreateAtomicPosition,
} from "./puzzlePlayback";
import { parseSolutionUciLines } from "../../lib/puzzles/solutionPgn";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("tryCreateAtomicPosition", () => {
  it("returns the position when the FEN is valid", () => {
    const result = tryCreateAtomicPosition(STARTING_FEN);
    expect(result.position).not.toBeNull();
    expect(result.error).toBe("");
  });

  it("returns a null position with an error message on invalid FEN", () => {
    const result = tryCreateAtomicPosition("not-a-fen");
    expect(result.position).toBeNull();
    expect(result.error).toMatch(/Invalid FEN/);
  });
});

describe("hasExpectedMoveAt", () => {
  const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5? 2. Nf3");

  it("returns true when at least one line has a non-questionable move", () => {
    expect(hasExpectedMoveAt(lines, 0)).toBe(true);
  });

  it("returns false when only questionable moves are available at the ply", () => {
    // The second ply only has a `?` move in our single line, so no expected move.
    const onlyQuestionable = parseSolutionUciLines(STARTING_FEN, "1. e4 e5?");
    expect(hasExpectedMoveAt(onlyQuestionable, 1)).toBe(false);
  });

  it("returns false past the end of every line", () => {
    expect(hasExpectedMoveAt(lines, 99)).toBe(false);
  });
});

describe("recomputeTrainingState", () => {
  const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5 2. Nf3");

  it("returns a no-op state when training is disabled", () => {
    expect(
      recomputeTrainingState({
        isTrainingEnabled: false,
        isAnalysisMode: false,
        playedMoveKeys: [],
        solutionLines: lines,
      }),
    ).toEqual({ candidates: [], progress: 0, solved: false });
  });

  it("returns a no-op state when in analysis mode", () => {
    expect(
      recomputeTrainingState({
        isTrainingEnabled: true,
        isAnalysisMode: true,
        playedMoveKeys: [],
        solutionLines: lines,
      }),
    ).toEqual({ candidates: [], progress: 0, solved: false });
  });

  it("advances progress when played moves match the line", () => {
    const e4Key = lines[0]?.[0]?.key ?? "";
    const result = recomputeTrainingState({
      isTrainingEnabled: true,
      isAnalysisMode: false,
      playedMoveKeys: [e4Key],
      solutionLines: lines,
    });
    expect(result.progress).toBe(1);
    expect(result.solved).toBe(false);
    expect(result.candidates).toHaveLength(1);
  });

  it("marks the puzzle as solved once every line is exhausted", () => {
    const playedKeys = (lines[0] ?? []).map((entry) => entry.key);
    const result = recomputeTrainingState({
      isTrainingEnabled: true,
      isAnalysisMode: false,
      playedMoveKeys: playedKeys,
      solutionLines: lines,
    });
    expect(result.solved).toBe(true);
    expect(result.progress).toBe(playedKeys.length);
  });

  it("stops advancing when a played move diverges from the solution", () => {
    const result = recomputeTrainingState({
      isTrainingEnabled: true,
      isAnalysisMode: false,
      playedMoveKeys: ["wrong-move-key"],
      solutionLines: lines,
    });
    expect(result.progress).toBe(0);
  });
});

describe("buildSolutionHistory", () => {
  it("produces fens, lastMoves, and SAN parallel arrays for each ply", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5 2. Nf3");
    const history = buildSolutionHistory(STARTING_FEN, lines[0] ?? []);
    expect(history).not.toBeNull();
    expect(history?.fens).toHaveLength(4); // initial + 3 plies
    expect(history?.moveSans).toEqual(["e4", "e5", "Nf3"]);
    expect(history?.moveUcis).toEqual(["e2e4", "e7e5", "g1f3"]);
    expect(history?.lastMoves[0]).toBeUndefined();
    expect(history?.lastMoves[1]).toEqual(["e2", "e4"]);
  });

  it("returns null when the initial FEN is unusable", () => {
    expect(buildSolutionHistory("garbage", [])).toBeNull();
  });
});
