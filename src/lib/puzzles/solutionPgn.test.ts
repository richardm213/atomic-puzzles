import { describe, expect, it } from "vitest";

import {
  compareMoves,
  convertUciLineToSan,
  createAtomicPosition,
  moveFromUci,
  movePrefix,
  normalizeSolutionPgn,
  parseSolutionUciLines,
  serializeSanLinesToPgn,
  serializeUciLinesToPgn,
  squareName,
  toComparableUci,
} from "./solutionPgn";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const BLACK_TO_MOVE_FEN =
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const BLACK_TO_MOVE_LONG_FEN =
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 37";

describe("squareName", () => {
  it("translates file/rank into algebraic coordinates", () => {
    expect(squareName(0, 0)).toBe("a1");
    expect(squareName(4, 1)).toBe("e2");
    expect(squareName(7, 7)).toBe("h8");
  });
});

describe("movePrefix", () => {
  it("returns a move number for white plies", () => {
    expect(movePrefix(0)).toBe("1. ");
    expect(movePrefix(2)).toBe("2. ");
  });

  it("returns an empty prefix for black plies by default", () => {
    expect(movePrefix(1)).toBe("");
  });

  it("emits the elided black-move number when forced", () => {
    expect(movePrefix(1, true)).toBe("1... ");
    expect(movePrefix(3, true)).toBe("2... ");
  });
});

describe("compareMoves", () => {
  it("orders questionable moves after solid ones", () => {
    expect(compareMoves("e4", "e4?")).toBeLessThan(0);
    expect(compareMoves("e4?", "e4")).toBeGreaterThan(0);
  });

  it("falls back to provided indices for tie-breaking", () => {
    expect(compareMoves("e4", "d4", 0, 1)).toBeLessThan(0);
    expect(compareMoves("e4", "d4", 5, 1)).toBeGreaterThan(0);
    expect(compareMoves("e4", "d4", 2, 2)).toBe(0);
  });
});

describe("createAtomicPosition", () => {
  it("loads a valid atomic position", () => {
    const position = createAtomicPosition(STARTING_FEN);
    expect(position.turn).toBe("white");
  });

  it("throws on an invalid FEN", () => {
    expect(() => createAtomicPosition("not-a-fen")).toThrow(/Invalid FEN/);
  });
});

describe("moveFromUci", () => {
  it("returns null for nonsense UCI", () => {
    const position = createAtomicPosition(STARTING_FEN);
    expect(moveFromUci(position, "zz9999")).toBeNull();
  });

  it("returns a legal move for a valid UCI", () => {
    const position = createAtomicPosition(STARTING_FEN);
    const move = moveFromUci(position, "e2e4");
    expect(move).not.toBeNull();
    expect((move as { from: number; to: number }).from).toBeDefined();
  });

  it("rejects illegal moves", () => {
    const position = createAtomicPosition(STARTING_FEN);
    expect(moveFromUci(position, "e2e5")).toBeNull();
  });
});

describe("toComparableUci", () => {
  it("lowercases input by default", () => {
    const position = createAtomicPosition(STARTING_FEN);
    expect(toComparableUci(position, "E2E4")).toBe("e2e4");
  });
});

describe("parseSolutionUciLines", () => {
  it("parses a single SAN line into UCI entries", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5 2. Nf3");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.map((entry) => entry.uci)).toEqual(["e2e4", "e7e5", "g1f3"]);
  });

  it("expands variations into multiple lines", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5 (1... c5)");
    expect(lines).toHaveLength(2);
    const uciLines = lines.map((line) => line.map((entry) => entry.uci));
    expect(uciLines).toContainEqual(["e2e4", "e7e5"]);
    expect(uciLines).toContainEqual(["e2e4", "c7c5"]);
  });

  it("parses solutions that start with black's elided move number", () => {
    const lines = parseSolutionUciLines(BLACK_TO_MOVE_FEN, "1... e5 2. Nf3");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.map((entry) => entry.uci)).toEqual(["e7e5", "g1f3"]);
  });

  it("parses long black-move ellipses", () => {
    const lines = parseSolutionUciLines(BLACK_TO_MOVE_LONG_FEN, "37... e5 38. Nf3");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.map((entry) => entry.uci)).toEqual(["e7e5", "g1f3"]);
  });

  it("ignores standalone ellipsis tokens before SAN moves", () => {
    const lines = parseSolutionUciLines(BLACK_TO_MOVE_FEN, "... e5 2. Nf3");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.map((entry) => entry.uci)).toEqual(["e7e5", "g1f3"]);
  });

  it("flags moves with ? as questionable", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5? 2. Nf3");
    expect(lines[0]?.[1]?.questionable).toBe(true);
    expect(lines[0]?.[0]?.questionable).toBe(false);
  });

  it("flags mixed ?! annotations as questionable and ignores ! annotations", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4! e5?! 2. Nf3!!");
    expect(lines[0]?.map((entry) => entry.uci)).toEqual(["e2e4", "e7e5", "g1f3"]);
    expect(lines[0]?.map((entry) => entry.questionable)).toEqual([false, true, false]);
  });

  it("returns [] when the FEN is invalid", () => {
    expect(parseSolutionUciLines("garbage", "1. e4")).toEqual([]);
  });

  it("returns [] for blank or non-string solutions", () => {
    expect(parseSolutionUciLines(STARTING_FEN, "")).toEqual([]);
    expect(parseSolutionUciLines(STARTING_FEN, null)).toEqual([]);
    expect(parseSolutionUciLines(STARTING_FEN, "   ")).toEqual([]);
  });

  it("strips PGN comments and NAGs before parsing", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 {great move} $1 e5");
    expect(lines[0]?.map((entry) => entry.uci)).toEqual(["e2e4", "e7e5"]);
  });

  it("returns [] when a SAN move is illegal in the position", () => {
    expect(parseSolutionUciLines(STARTING_FEN, "1. Bxh8")).toEqual([]);
  });
});

describe("convertUciLineToSan", () => {
  it("round-trips UCI back to SAN", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5 2. Nf3 Nc6");
    const san = convertUciLineToSan(STARTING_FEN, lines[0] ?? []);
    expect(san).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  });

  it("preserves the questionable annotation", () => {
    const lines = parseSolutionUciLines(STARTING_FEN, "1. e4 e5?");
    const san = convertUciLineToSan(STARTING_FEN, lines[0] ?? []);
    expect(san).toEqual(["e4", "e5?"]);
  });

  it("returns an empty array on an invalid FEN", () => {
    expect(convertUciLineToSan("nope", [])).toEqual([]);
  });
});

describe("serializeSanLinesToPgn", () => {
  it("emits move numbers and joins variations", () => {
    const pgn = serializeSanLinesToPgn(STARTING_FEN, [["e4", "e5", "Nf3"]]);
    expect(pgn).toBe("1. e4 e5 2. Nf3");
  });

  it("returns empty for empty input", () => {
    expect(serializeSanLinesToPgn(STARTING_FEN, [])).toBe("");
  });

  it("formats variations with parentheses", () => {
    const pgn = serializeSanLinesToPgn(STARTING_FEN, [
      ["e4", "e5"],
      ["e4", "c5"],
    ]);
    expect(pgn).toContain("(1... c5)");
  });

  it("starts serialized black-to-move lines with an ellipsis", () => {
    const pgn = serializeSanLinesToPgn(BLACK_TO_MOVE_LONG_FEN, [["e5", "Nf3"]]);
    expect(pgn).toBe("37... e5 38. Nf3");
  });
});

describe("serializeUciLinesToPgn / normalizeSolutionPgn", () => {
  it("normalizeSolutionPgn round-trips SAN through UCI", () => {
    const normalized = normalizeSolutionPgn(STARTING_FEN, "1. e4 e5 2. Nf3");
    expect(normalized).toBe("1. e4 e5 2. Nf3");
  });

  it("normalizeSolutionPgn preserves black-to-move ellipsis numbering", () => {
    const normalized = normalizeSolutionPgn(BLACK_TO_MOVE_LONG_FEN, "37... e5 38. Nf3");
    expect(normalized).toBe("37... e5 38. Nf3");
  });

  it("normalizeSolutionPgn preserves PGNs containing variations", () => {
    const original = "1. e4 (1. d4) e5";
    expect(normalizeSolutionPgn(STARTING_FEN, original)).toBe(original);
  });

  it("normalizeSolutionPgn returns input unchanged when fen is missing", () => {
    expect(normalizeSolutionPgn("", "1. e4")).toBe("1. e4");
  });

  it("serializeUciLinesToPgn returns empty when there is nothing to render", () => {
    expect(serializeUciLinesToPgn(STARTING_FEN, [])).toBe("");
  });
});
