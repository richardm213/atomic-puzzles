import { describe, expect, it } from "vitest";

import { parseSolutionUciLines } from "../../lib/puzzles/solutionPgn";
import {
  buildSolutionHistory,
  evaluateTrainingMove,
  hasExpectedMoveAt,
  recomputeTrainingState,
  tryCreateAtomicPosition,
} from "./puzzlePlayback";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const PUZZLE_506_FEN = "rnbqkbnr/5pp1/p3p2p/3p4/3PP2P/1p3P1N/PPP3P1/R1BQKB1R w KQkq - 0 9";
const PUZZLE_506_SOLUTION =
  "9. c3 Bd7 10. axb3 Ba4 11. Rxa4 (11. b3?) 11... Qd7 12. Qb3 (12. Qc2?)";

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

  it("returns true when a ply has both retry and accepted alternatives", () => {
    const mixedLines = parseSolutionUciLines(STARTING_FEN, "1. e4 (1. d4?)");
    expect(hasExpectedMoveAt(mixedLines, 0)).toBe(true);
  });

  it("returns false when only questionable moves are available at the ply", () => {
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

  it("narrows candidates to the matching variation after shared prefixes", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5 (1... c5) 2. Nf3");
    const e4Key = lines[0]?.[0]?.key ?? "";
    const c5Key = lines.find((line) => line[1]?.uci === "c7c5")?.[1]?.key ?? "";
    const result = recomputeTrainingState({
      isTrainingEnabled: true,
      isAnalysisMode: false,
      playedMoveKeys: [e4Key, c5Key],
      solutionLines: lines,
    });

    expect(result.progress).toBe(2);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.[1]?.uci).toBe("c7c5");
  });

  it("does not auto-solve when the first available move is only a retry", () => {
    const retryOnly = parseSolutionUciLines(STARTING_FEN, "1. e4?");
    const result = recomputeTrainingState({
      isTrainingEnabled: true,
      isAnalysisMode: false,
      playedMoveKeys: [],
      solutionLines: retryOnly,
    });

    expect(result.progress).toBe(0);
    expect(result.candidates).toBe(retryOnly);
    expect(result.solved).toBe(false);
  });

  it("keeps progress before puzzle 506's annotated b3 retry branch", () => {
    const lines = parseSolutionUciLines(PUZZLE_506_FEN, PUZZLE_506_SOLUTION);
    const b3Line = lines.find((line) => line.some((entry) => entry.uci === "b2b3"));
    const playedKeysBeforeB3 = (b3Line ?? []).slice(0, 4).map((entry) => entry.key);

    expect(b3Line?.[4]).toMatchObject({ uci: "b2b3", questionable: true });

    const result = recomputeTrainingState({
      isTrainingEnabled: true,
      isAnalysisMode: false,
      playedMoveKeys: playedKeysBeforeB3,
      solutionLines: lines,
    });

    expect(result.progress).toBe(4);
    expect(result.candidates[0]?.[4]?.uci).toBe("b2b3");
    expect(result.solved).toBe(false);
  });
});

describe("evaluateTrainingMove", () => {
  it("accepts non-questionable solution moves", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5");
    const e4Key = lines[0]?.[0]?.key ?? "";

    expect(evaluateTrainingMove({ candidates: lines, progress: 0, moveKey: e4Key })).toBe(
      "accepted",
    );
  });

  it("prefers accepted when the same move is listed as both correct and retry", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 (1. e4?)");
    const e4Key = lines[0]?.[0]?.key ?? "";

    expect(evaluateTrainingMove({ candidates: lines, progress: 0, moveKey: e4Key })).toBe(
      "accepted",
    );
  });

  it("returns retry for moves marked with ? in the PGN", () => {
    const lines = parseSolutionUciLines(PUZZLE_506_FEN, PUZZLE_506_SOLUTION);
    const b3Entry = lines.flat().find((entry) => entry.uci === "b2b3");

    expect(b3Entry).toMatchObject({ questionable: true });
    expect(
      evaluateTrainingMove({
        candidates: lines,
        progress: 4,
        moveKey: b3Entry?.key ?? "",
      }),
    ).toBe("retry");
  });

  it("returns wrong for moves absent from the current PGN candidates", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5");

    expect(evaluateTrainingMove({ candidates: lines, progress: 0, moveKey: "d2d4" })).toBe(
      "wrong",
    );
  });

  it("returns wrong when there are no candidate moves at the requested ply", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4");
    const e4Key = lines[0]?.[0]?.key ?? "";

    expect(evaluateTrainingMove({ candidates: lines, progress: 1, moveKey: e4Key })).toBe(
      "wrong",
    );
    expect(evaluateTrainingMove({ candidates: [], progress: 0, moveKey: e4Key })).toBe("wrong");
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
