import { describe, expect, it } from "vitest";

import { normalizePuzzleMotifTags, puzzleMotifs } from "./puzzleMotifs";

describe("puzzle motifs", () => {
  it("defines every motif with a unique machine-readable tag", () => {
    const tags = puzzleMotifs.map((motif) => motif.tag);

    expect(puzzleMotifs).toHaveLength(35);
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
});
