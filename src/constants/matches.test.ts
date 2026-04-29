import { describe, expect, it } from "vitest";

import {
  createModeRecord,
  defaultMatchLengthMax,
  defaultMatchLengthMin,
  isMatchLengthWithinBounds,
  knownSourceKeys,
  matchLengthBoundsByMode,
  modeOptions,
} from "./matches";

describe("createModeRecord", () => {
  it("creates an object keyed by every mode", () => {
    const record = createModeRecord((mode) => mode.toUpperCase());
    expect(record).toEqual({ blitz: "BLITZ", bullet: "BULLET", hyperbullet: "HYPERBULLET" });
  });
});

describe("matchLengthBoundsByMode", () => {
  it("provides default bounds for every mode", () => {
    modeOptions.forEach((mode) => {
      expect(matchLengthBoundsByMode[mode]).toEqual({
        min: defaultMatchLengthMin,
        max: defaultMatchLengthMax,
      });
    });
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
    expect(knownSourceKeys.sort()).toEqual(["arena", "friend", "lobby"]);
  });
});
