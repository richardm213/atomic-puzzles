import { describe, expect, it } from "vitest";

import { isPuzzleEndgameMotifTag, normalizePuzzleMotifTags, puzzleMotifs } from "./puzzleMotifs";

describe("puzzle motifs", () => {
  it("defines every motif with a unique machine-readable tag", () => {
    const tags = puzzleMotifs.map((motif) => motif.tag);

    expect(puzzleMotifs).toHaveLength(36);
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags.every((tag) => /^[a-z]+(?:_[a-z]+)*$/.test(tag))).toBe(true);
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

  it("places pawn endgames beneath the endgame motif", () => {
    expect(puzzleMotifs.find((motif) => motif.tag === "pawn_endgame")).toMatchObject({
      name: "Pawn endgame",
      parentTag: "endgame",
    });
    expect(isPuzzleEndgameMotifTag("endgame")).toBe(true);
    expect(isPuzzleEndgameMotifTag("pawn_endgame")).toBe(true);
    expect(isPuzzleEndgameMotifTag("fork")).toBe(false);
  });
});
