import { INITIAL_FEN } from "chessops/fen";

import { validatePuzzleSubmission } from "../puzzles/puzzleSubmission";
import fixtures from "./fixtures/transpositionPuzzles.json";
import {
  convertUciLineToSan,
  parseSolutionUciLines,
  prunePgnLinesFromMove,
  sameSolutionMove,
  serializeSanLinesToPgn,
} from "./pgn";
import {
  buildTranspositionMoveTree,
  synchronizeTranspositions,
  type TranspositionMoveNode,
} from "./transpositions";

const linesFromPgn = (fen: string, pgn: string): string[][] =>
  parseSolutionUciLines(fen, pgn).map((line) => convertUciLineToSan(fen, line));

const suppliedPuzzle = fixtures.find((puzzle) => puzzle.id === "supplied")!;

const jumpsIn = (node: TranspositionMoveNode): TranspositionMoveNode[] =>
  node.transposition ? [node] : [...node.children.values()].flatMap(jumpsIn);

describe("puzzle transpositions", () => {
  it("materializes the supplied puzzle's shared continuation and saves complete legal PGN", () => {
    const { fen, solution } = suppliedPuzzle;
    const lines = linesFromPgn(fen, solution);
    const shortened = [lines[0]!, lines[1]!.slice(0, 3)];
    const synchronized = synchronizeTranspositions(fen, shortened);
    expect(synchronized).toEqual(lines);
    const saved = validatePuzzleSubmission({
      fen,
      solution: serializeSanLinesToPgn(fen, shortened),
      explanation: "",
      event: "",
    });
    expect(linesFromPgn(fen, saved.solution)).toEqual(lines);
    expect(jumpsIn(buildTranspositionMoveTree(fen, synchronized))).toHaveLength(1);
  });

  it("handles multiple and nested transpositions in existing archive puzzles", () => {
    for (const fixture of fixtures) {
      const lines = linesFromPgn(fixture.fen, fixture.solution);
      const synchronized = synchronizeTranspositions(fixture.fen, lines);
      expect(
        jumpsIn(buildTranspositionMoveTree(fixture.fen, synchronized)).length,
        `puzzle ${fixture.id}`,
      ).toBeGreaterThanOrEqual(fixture.transpositions);
      expect(synchronizeTranspositions(fixture.fen, synchronized)).toEqual(synchronized);
      // Standard PGN must contain all copies; arrows are strictly a rendering concern.
      const restored = linesFromPgn(fixture.fen, serializeSanLinesToPgn(fixture.fen, synchronized));
      expect(new Set(restored.map((line) => line.join(" ")))).toEqual(
        new Set(synchronized.map((line) => line.join(" "))),
      );
    }
  });

  it("propagates additions, annotations and deletions from non-original occurrences", () => {
    const fixture = fixtures.find((puzzle) => puzzle.id === 1209)!;
    const lines = linesFromPgn(fixture.fen, fixture.solution);
    const truncated = lines.map((line) => line.slice(0, -1));
    const extended = truncated.map((line, index) => (index === 1 ? [...line, "Rf2"] : line));
    const synchronized = synchronizeTranspositions(fixture.fen, extended, truncated);
    expect(synchronized).toHaveLength(4);
    expect(synchronized.every((line) => line.at(-1) === "Rf2")).toBe(true);
    const annotated = synchronized.map((line, index) =>
      index === 1 ? [...line.slice(0, -1), "Rf2!"] : line,
    );
    const updated = synchronizeTranspositions(fixture.fen, annotated, synchronized);
    expect(updated.every((line) => line.at(-1) === "Rf2!")).toBe(true);
    const pruned = prunePgnLinesFromMove(updated, 1, 4, sameSolutionMove);
    const deleted = synchronizeTranspositions(fixture.fen, pruned.lines, updated);
    expect(deleted.every((line) => line.length === 4)).toBe(true);
    expect(deleted).toHaveLength(4);
  });

  it("keeps repetitions local to their line, but still links alternate move orders", () => {
    const repeated = ["e4", "e5", "Nf3", "Nc6", "Ng1", "Nb8", "d4"];
    expect(synchronizeTranspositions(INITIAL_FEN, [repeated])).toEqual([repeated]);
    expect(jumpsIn(buildTranspositionMoveTree(INITIAL_FEN, [repeated]))).toHaveLength(0);
    // Keep a second branch so the repeated mainline also exercises indexing.
    const lines = [repeated, ["d4", "d5", "Nf3"]];
    expect(synchronizeTranspositions(INITIAL_FEN, lines)).toEqual(lines);
    expect(jumpsIn(buildTranspositionMoveTree(INITIAL_FEN, lines))).toHaveLength(0);
    const edited = [[...repeated.slice(0, -1), "Nc3"], lines[1]!];
    expect(synchronizeTranspositions(INITIAL_FEN, edited, lines)).toEqual(edited);

    // Repeating the starting position is ignored; the later e4/e5 position
    // legitimately transposes to a different branch and shares both replies.
    const cycle = ["Nf3", "Nf6", "Ng1", "Ng8"];
    const alternatives = [
      ["e4", "e5", "Nf3"],
      [...cycle, "e4", "e5", "Nc3"],
    ];
    const synchronized = synchronizeTranspositions(INITIAL_FEN, alternatives);
    expect(synchronized).toEqual([
      ["e4", "e5", "Nf3"],
      ["e4", "e5", "Nc3"],
      [...cycle, "e4", "e5", "Nf3"],
      [...cycle, "e4", "e5", "Nc3"],
    ]);
    expect(jumpsIn(buildTranspositionMoveTree(INITIAL_FEN, synchronized))).toHaveLength(1);
    expect(synchronizeTranspositions(INITIAL_FEN, synchronized)).toEqual(synchronized);
  });

  it("keeps positions with different castling rights separate", () => {
    // Identical piece placement with different castling rights must remain separate.
    const fen = "4k3/8/8/8/8/8/8/4K2R w K - 0 1";
    const rightsLines = [["Rh2", "Kf7", "Rh1", "Ke8", "Rh3"], ["Rh3"]];
    expect(synchronizeTranspositions(fen, rightsLines)).toEqual(rightsLines);
  });
});
