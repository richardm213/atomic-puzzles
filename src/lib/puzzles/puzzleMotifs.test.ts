import { describe, expect, it } from "vitest";

import {
  getMostSpecificPuzzleMotifTags,
  getPuzzleMotifAncestors,
  getPuzzleMotifTreeRows,
  isPuzzleEndgameMotifTag,
  normalizePuzzleMotifTags,
  puzzleMotifs,
} from "./puzzleMotifs";

describe("puzzle motifs", () => {
  it("accepts opening tags and treats them as more specific than Theory", () => {
    const tags = normalizePuzzleMotifTags(["theory", "theory_nh3_d4", "fork"]);

    expect(getPuzzleMotifAncestors("theory_nh3_d4")).toEqual(["theory_nh3_d4", "theory"]);
    expect(getMostSpecificPuzzleMotifTags(tags)).toEqual(["theory_nh3_d4", "fork"]);
  });

  it("normalizes stored tags to unique known motifs", () => {
    expect(
      normalizePuzzleMotifTags([
        "fork",
        "unknown",
        "fork",
        "pin",
        "tempo",
        "equal",
        "endgame_draw",
        "draw",
      ]),
    ).toEqual(["fork", "pin", "tempo", "draw"]);
    expect(normalizePuzzleMotifTags("fork")).toEqual([]);
  });

  it("recognizes endgame motif tags", () => {
    expect(isPuzzleEndgameMotifTag("endgame")).toBe(true);
    expect(isPuzzleEndgameMotifTag("threading_the_needle")).toBe(true);
    expect(isPuzzleEndgameMotifTag("pawn_endgame")).toBe(true);
    expect(isPuzzleEndgameMotifTag("fork")).toBe(false);
  });
  it("requires expansion at each level but searches collapsed children directly", () => {
    const name = (tag: string) => puzzleMotifs.find((motif) => motif.tag === tag)?.name ?? tag;
    const rows = (expanded: string[], search = "") =>
      getPuzzleMotifTreeRows(puzzleMotifs, new Set(expanded), search, name);
    expect(rows([]).some(({ motif }) => motif.tag === "prevent_knight_invasion")).toBe(false);
    expect(rows(["defensive"]).some(({ motif }) => motif.tag === "prevent_knight_invasion")).toBe(
      false,
    );
    expect(
      rows(["defensive", "prevent_invasion"]).find(
        ({ motif }) => motif.tag === "prevent_knight_invasion",
      )?.depth,
    ).toBe(2);
    expect(rows([], "prevent knight invasion").map(({ motif }) => motif.tag)).toEqual([
      "prevent_knight_invasion",
    ]);
  });
});
