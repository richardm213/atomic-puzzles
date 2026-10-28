import { describe, expect, it } from "vitest";

import { isMatchLengthWithinBounds } from "./matches";

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
