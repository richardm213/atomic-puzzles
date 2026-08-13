import { describe, expect, it } from "vitest";

import {
  createModeRecord,
  isMatchLengthWithinBounds,
  knownSourceKeys,
  rankingEligibilityByMode,
} from "./matches";

describe("createModeRecord", () => {
  it("creates an object keyed by every mode", () => {
    const record = createModeRecord((mode) => mode.toUpperCase());
    expect(record).toEqual({
      blitz: "BLITZ",
      bullet: "BULLET",
      hyperbullet: "HYPERBULLET",
      wolfrandom: "WOLFRANDOM",
    });
  });
});

describe("rankingEligibilityByMode", () => {
  it("requires Wolfrandom RD below 80", () => {
    expect(rankingEligibilityByMode.wolfrandom).toEqual({ minGames: 10, maxRd: 80 });
  });
});

describe("isMatchLengthWithinBounds", () => {
  it("rejects games shorter than the minimum", () => {
    expect(isMatchLengthWithinBounds(2, 5, 20, 50)).toBe(false);
  });

  it("treats max >= boundsMax as no upper bound", () => {
    expect(isMatchLengthWithinBounds(100, 1, 50, 50)).toBe(true);
    expect(isMatchLengthWithinBounds(0, 1, 50, 50)).toBe(false);
  });

  it("clamps to inclusive [min, max] when max < boundsMax", () => {
    expect(isMatchLengthWithinBounds(10, 5, 12, 50)).toBe(true);
    expect(isMatchLengthWithinBounds(13, 5, 12, 50)).toBe(false);
  });
});

describe("knownSourceKeys", () => {
  it("matches the keys of defaultSourceFilters", () => {
    expect(knownSourceKeys.sort()).toEqual(["arena", "chesscom", "friend", "lobby", "swiss"]);
  });
});
