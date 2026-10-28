import { describe, expect, it } from "vitest";

import { isPuzzleEndgameMotifTag, normalizePuzzleMotifTags } from "./puzzleMotifs";

describe("puzzle motifs", () => {
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
    expect(isPuzzleEndgameMotifTag("pawn_endgame")).toBe(true);
    expect(isPuzzleEndgameMotifTag("fork")).toBe(false);
  });
});
