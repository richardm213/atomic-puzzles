import { describe, expect, it } from "vitest";

import {
  mergeSolutionLine,
  parsePuzzlePgnInput,
  validatePuzzleSubmission,
} from "./puzzleSubmission";
import { parseSolutionUciLines } from "./solutionPgn";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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

  it("adds a board-created branch without discarding existing lines", () => {
    expect(
      mergeSolutionLine(
        [
          ["Qh5+", "g6", "Qd5"],
          ["Qh5+", "Kf7"],
        ],
        ["Qh5+", "g6", "Qf3"],
      ),
    ).toEqual([
      ["Qh5+", "g6", "Qd5"],
      ["Qh5+", "Kf7"],
      ["Qh5+", "g6", "Qf3"],
    ]);
  });

  it("extends an existing line instead of retaining its shorter duplicate", () => {
    expect(mergeSolutionLine([["Qh5+", "g6"]], ["Qh5+", "g6", "Qd5"])).toEqual([
      ["Qh5+", "g6", "Qd5"],
    ]);
  });
});
