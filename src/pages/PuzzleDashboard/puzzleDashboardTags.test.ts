import { describe, expect, it } from "vitest";

import type { PuzzleMotif } from "../../lib/puzzles/puzzleMotifs";
import { entryMatchesSelectedTags, filterAvailablePuzzleMotifs } from "./puzzleDashboardTags";

const motifs: PuzzleMotif[] = [
  { tag: "fork", name: "Fork", description: "" },
  { tag: "king_walk", name: "King walk", description: "" },
  { tag: "rook_mate", name: "Rook mate", description: "" },
];

describe("puzzle dashboard tag filters", () => {
  it("requires an entry to have every selected tag", () => {
    expect(entryMatchesSelectedTags(["fork", "rook_mate"], ["fork", "rook_mate"])).toBe(true);
    expect(entryMatchesSelectedTags(["fork"], ["fork", "rook_mate"])).toBe(false);
    expect(entryMatchesSelectedTags([], [])).toBe(true);
  });

  it("searches tag names and normalized tag identifiers", () => {
    expect(filterAvailablePuzzleMotifs(motifs, [], "walk").map((motif) => motif.tag)).toEqual([
      "king_walk",
    ]);
    expect(filterAvailablePuzzleMotifs(motifs, [], "rook ma").map((motif) => motif.tag)).toEqual([
      "rook_mate",
    ]);
  });

  it("removes already-selected tags from the available results", () => {
    expect(filterAvailablePuzzleMotifs(motifs, ["fork"], "").map((motif) => motif.tag)).toEqual([
      "king_walk",
      "rook_mate",
    ]);
  });
});
