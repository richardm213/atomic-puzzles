import { describe, expect, it } from "vitest";

import { normalizePuzzleMotifTags, puzzleMotifs } from "./puzzleMotifs";

describe("puzzle motifs", () => {
  it("defines every motif with a unique machine-readable tag and description", () => {
    const tags = puzzleMotifs.map((motif) => motif.tag);

    expect(puzzleMotifs).toHaveLength(35);
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags.every((tag) => /^[a-z]+(?:_[a-z]+)*$/.test(tag))).toBe(true);
    expect(puzzleMotifs.every((motif) => motif.description.trim().length > 0)).toBe(true);
    expect(
      puzzleMotifs.every((motif) => /^A (?:defensive |mating )?tactic\b/.test(motif.description)),
    ).toBe(true);
  });

  it("normalizes stored tags to unique known motifs", () => {
    expect(normalizePuzzleMotifTags(["fork", "unknown", "fork", "pin", "tempo"])).toEqual([
      "fork",
      "pin",
      "tempo",
    ]);
    expect(normalizePuzzleMotifTags("fork")).toEqual([]);
  });
});
