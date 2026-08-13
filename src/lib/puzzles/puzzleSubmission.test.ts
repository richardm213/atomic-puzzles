import { INITIAL_FEN as STARTING_FEN } from "chessops/fen";
import { describe, expect, it } from "vitest";

import {
  compactPuzzleSolution,
  parsePuzzlePgnInput,
  splitPuzzlePgnBatch,
  validatePuzzleSubmission,
} from "./puzzleSubmission";
import { parseSolutionUciLines } from "./solutionPgn";

describe("compactPuzzleSolution", () => {
  it("replaces real and escaped line breaks with readable spaces", () => {
    expect(compactPuzzleSolution("1. e4\n  e5\\n2. Nf3\r\nNc6")).toBe("1. e4 e5 2. Nf3 Nc6");
  });
});

describe("validatePuzzleSubmission", () => {
  it("normalizes a legal submission", () => {
    expect(
      validatePuzzleSubmission({
        fen: ` ${STARTING_FEN} `,
        solution: "1. e4 e5",
        event: "  AWC 2026  ",
        explanation: "  The threat is atomic.  ",
      }),
    ).toEqual({
      fen: STARTING_FEN,
      solution: "1. e4 e5",
      event: "AWC 2026",
      explanation: "The threat is atomic.",
    });
  });

  it("accepts a legal submission without an explanation", () => {
    expect(
      validatePuzzleSubmission({
        fen: STARTING_FEN,
        solution: "1. e4 e5",
        event: "",
        explanation: "",
      }).explanation,
    ).toBe("");
  });

  it("rejects invalid positions and move lines", () => {
    expect(() =>
      validatePuzzleSubmission({ fen: "bad", solution: "1. e4", event: "", explanation: "" }),
    ).toThrow(/Invalid FEN/);
    expect(() =>
      validatePuzzleSubmission({
        fen: STARTING_FEN,
        solution: "1. Ke9",
        event: "",
        explanation: "",
      }),
    ).toThrow(/not a legal atomic line/);
  });

  it("uses a FEN header and discards all PGN headers", () => {
    const fen = "r7/pk1n4/2p5/1p1p4/1P1Pp1P1/5P2/PqPQ4/R3KB2 w Q - 0 21";
    expect(
      parsePuzzlePgnInput(
        `[Variant "Atomic"]\n[FEN "${fen}"]\n\n21. Qh6 Nf6 22. Qg7+ Nd7 23. Qg6 (23. Qh6?)`,
        STARTING_FEN,
      ),
    ).toEqual({
      fen,
      solution: "21. Qh6 Nf6 22. Qg7+ Nd7 23. Qg6 (23. Qh6?)",
      event: "",
      hadHeaders: true,
      headerText: `[Variant "Atomic"]\n[FEN "${fen}"]`,
    });
  });

  it("extracts the supplied FEN, event, and every solution line from PGN", () => {
    const pgn = `[Event "Special match"]
[Variant "Atomic"]
[FEN "rnbqkbnr/ppppp1pp/5p2/8/8/4P3/PPPP1PPP/RNBQKBNR w KQkq - 0 2"]

2. Qh5+ (2. Bb5 c6 3. Qh5+ g6 4. Qd5 d6 5. Qf7+ Kd7 6. Qxe7#) 2... g6 3. Qd5 d6 4. Qf7+ Kd7 5. Qxe7#`;
    const normalized = validatePuzzleSubmission({
      fen: STARTING_FEN,
      solution: pgn,
      event: "",
      explanation: "",
    });

    expect(normalized.fen).toBe("rnbqkbnr/ppppp1pp/5p2/8/8/4P3/PPPP1PPP/RNBQKBNR w KQkq - 0 2");
    expect(normalized.event).toBe("Special match");
    expect(parseSolutionUciLines(normalized.fen, normalized.solution)).toHaveLength(2);
  });

  it("requires numbered PGN movetext and rejects non-atomic Variant headers", () => {
    expect(() => parsePuzzlePgnInput("e4 e5", STARTING_FEN)).toThrow(/move number/);
    expect(() => parsePuzzlePgnInput('[Variant "Standard"]\n\n1. e4', STARTING_FEN)).toThrow(
      /must be "Atomic"/,
    );
  });

  it("splits consecutive PGNs into a submission batch", () => {
    const batch = `[Variant "Atomic"]
[FEN "${STARTING_FEN}"]

1. e4 e5

[Event "Second puzzle"]
[Variant "Atomic"]
[FEN "${STARTING_FEN}"]

1. d4 d5`;

    expect(splitPuzzlePgnBatch(batch)).toEqual([
      `[Variant "Atomic"]\n[FEN "${STARTING_FEN}"]\n\n1. e4 e5`,
      `[Event "Second puzzle"]\n[Variant "Atomic"]\n[FEN "${STARTING_FEN}"]\n\n1. d4 d5`,
    ]);
  });

  it("keeps a single headerless movetext submission intact", () => {
    expect(splitPuzzlePgnBatch("\n1. e4 e5\n")).toEqual(["1. e4 e5"]);
  });
});
