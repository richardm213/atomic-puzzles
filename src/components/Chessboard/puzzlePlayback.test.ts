import { INITIAL_FEN as STARTING_FEN } from "chessops/fen";
import { describe, expect, it } from "vitest";

import { parseSolutionUciLines } from "../../lib/puzzles/solutionPgn";
import {
  buildSolutionHistory,
  evaluateTrainingMove,
  hasAcceptedMoveAt,
  isSolutionCompleteAt,
  recomputeTrainingState,
  tryCreateAtomicPosition,
} from "./puzzlePlayback";

const PUZZLE_506_FEN = "rnbqkbnr/5pp1/p3p2p/3p4/3PP2P/1p3P1N/PPP3P1/R1BQKB1R w KQkq - 0 9";
const PUZZLE_506_SOLUTION =
  "9. c3 Bd7 10. axb3 Ba4 11. Rxa4 (11. b3?) 11... Qd7 12. Qb3 (12. Qc2?)";
const PUZZLE_1327_FEN = "rnbqkb1r/1pp1n1p1/p4p1p/4p3/3P1B2/N6N/PPP2PPP/R2QKB1R w KQkq - 1 8";

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

describe("hasAcceptedMoveAt", () => {
  const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5? 2. Nf3");

  it("returns true when at least one line has a non-questionable move", () => {
    expect(hasAcceptedMoveAt(lines, 0)).toBe(true);
  });

  it("returns true when a ply has both retry and accepted alternatives", () => {
    const mixedLines = parseSolutionUciLines(STARTING_FEN, "1. e4 (1. d4?)");
    expect(hasAcceptedMoveAt(mixedLines, 0)).toBe(true);
  });

  it("returns false when only questionable moves are available at the ply", () => {
    const onlyQuestionable = parseSolutionUciLines(STARTING_FEN, "1. e4 e5?");
    expect(hasAcceptedMoveAt(onlyQuestionable, 1)).toBe(false);
  });

  it("returns false past the end of every line", () => {
    expect(hasAcceptedMoveAt(lines, 99)).toBe(false);
  });
});

describe("isSolutionCompleteAt", () => {
  it("requires an exhausted branch rather than merely having no accepted move", () => {
    const retryOnly = parseSolutionUciLines(STARTING_FEN, "1. e4?");
    const completed = parseSolutionUciLines(STARTING_FEN, "1. e4");

    expect(isSolutionCompleteAt(retryOnly, 0)).toBe(false);
    expect(isSolutionCompleteAt(completed, 0)).toBe(false);
    expect(isSolutionCompleteAt(completed, 1)).toBe(true);
  });

  it("allows a completed accepted branch to ignore a longer retry-only duplicate", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 (1. e4 e5?)");
    expect(isSolutionCompleteAt(lines, 1)).toBe(true);
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

    expect(b3Line?.[4]).toMatchObject({ uci: "b2b3", annotation: "?", retry: true });

    const result = recomputeTrainingState({
      isTrainingEnabled: true,
      isAnalysisMode: false,
      playedMoveKeys: playedKeysBeforeB3,
      solutionLines: lines,
    });

    expect(result.progress).toBe(4);
    expect(result.candidates.some((line) => line[4]?.uci === "b2b3")).toBe(true);
    expect(result.solved).toBe(false);
  });
});

describe("evaluateTrainingMove", () => {
  const evaluate = (
    solutionLines: ReturnType<typeof parseSolutionUciLines>,
    moveKey: string,
    playedMoveKeys: string[] = [],
  ) => evaluateTrainingMove({ solutionLines, playedMoveKeys, moveKey }).evaluation;

  it("accepts non-questionable solution moves", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5");
    const e4Key = lines[0]?.[0]?.key ?? "";

    expect(evaluate(lines, e4Key)).toBe("accepted");
  });

  it("returns the complete next state for an accepted move", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5 (1... c5)");
    const e4Key = lines[0]?.[0]?.key ?? "";
    const result = evaluateTrainingMove({
      solutionLines: lines,
      playedMoveKeys: [],
      moveKey: e4Key,
    });

    expect(result.evaluation).toBe("accepted");
    expect(result.acceptedState).toMatchObject({ progress: 1, solved: false });
    expect(result.acceptedState?.candidates).toHaveLength(2);
  });

  it("prefers accepted when the same move is listed as both correct and retry", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 (1. e4?)");
    const e4Key = lines[0]?.[0]?.key ?? "";

    expect(evaluate(lines, e4Key)).toBe("accepted");
  });

  it("returns retry for moves marked with ? in the PGN", () => {
    const lines = parseSolutionUciLines(PUZZLE_506_FEN, PUZZLE_506_SOLUTION);
    const b3Entry = lines.flat().find((entry) => entry.uci === "b2b3");

    expect(b3Entry).toMatchObject({ annotation: "?", retry: true });
    const playedMoveKeys = (lines.find((line) => line[4]?.key === b3Entry?.key) ?? [])
      .slice(0, 4)
      .map((entry) => entry.key);

    const result = evaluateTrainingMove({
      solutionLines: lines,
      playedMoveKeys,
      moveKey: b3Entry?.key ?? "",
    });
    expect(result.evaluation).toBe("retry");
    expect(result.acceptedState).toBeNull();
  });

  it("accepts every unmarked alternative in puzzle 1327", () => {
    const lines = parseSolutionUciLines(PUZZLE_1327_FEN, "8. Bc4 (8. Bb5+) (8. d5)");
    const firstMoves = lines.map((line) => line[0]);

    expect(firstMoves.map((entry) => entry?.retry)).toEqual([false, false, false]);
    firstMoves.forEach((entry) => {
      expect(evaluate(lines, entry?.key ?? "")).toBe("accepted");
    });
  });

  it("retries only the exact puzzle 1327 alternatives carrying ?", () => {
    const lines = parseSolutionUciLines(PUZZLE_1327_FEN, "8. Bc4 (8. Bb5+?) (8. d5?)");
    const [mainMove, ...retryMoves] = lines.map((line) => line[0]);

    expect(evaluate(lines, mainMove?.key ?? "")).toBe("accepted");
    retryMoves.forEach((entry) => {
      expect(evaluate(lines, entry?.key ?? "")).toBe("retry");
    });
  });

  it("returns wrong for moves absent from the current PGN candidates", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5");

    expect(evaluate(lines, "d2d4")).toBe("wrong");
  });

  it("returns wrong when there are no candidate moves at the requested ply", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4");
    const e4Key = lines[0]?.[0]?.key ?? "";

    expect(evaluate(lines, e4Key, [e4Key])).toBe("wrong");
    expect(evaluate([], e4Key)).toBe("wrong");
  });
});

describe("buildSolutionHistory", () => {
  it("produces fens, lastMoves, and SAN parallel arrays for each ply", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5 2. Nf3");
    const history = buildSolutionHistory(STARTING_FEN, lines[0] ?? []);
    expect(history).not.toBeNull();
    expect(history?.plies).toHaveLength(4); // initial + 3 plies
    expect(history?.plies.slice(1).map((ply) => ply.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(history?.plies.slice(1).map((ply) => ply.uci)).toEqual(["e2e4", "e7e5", "g1f3"]);
    expect(history?.plies[0]?.lastMove).toBeUndefined();
    expect(history?.plies[1]?.lastMove).toEqual(["e2", "e4"]);
  });

  it("returns null when the initial FEN is unusable", () => {
    expect(buildSolutionHistory("garbage", [])).toBeNull();
  });
});
