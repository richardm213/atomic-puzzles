import { describe, expect, it } from "vitest";

import { analysisAlreadyCovered, parseGameNumberSelection } from "./batch";

describe("game analysis batch selection", () => {
  it("expands comma-delimited game numbers and ranges without duplicates", () => {
    expect(parseGameNumberSelection("1-3, 3, 6, 8, 10-12", 15)).toEqual([
      1, 2, 3, 6, 8, 10, 11, 12,
    ]);
  });

  it("uses all games when the selection is blank", () => {
    expect(parseGameNumberSelection("", 4)).toEqual([1, 2, 3, 4]);
  });

  it("rejects malformed and out-of-range selections", () => {
    expect(() => parseGameNumberSelection("3-1", 4)).toThrow("Use game numbers from 1 to 4");
    expect(() => parseGameNumberSelection("1, nope", 4)).toThrow("not a valid game number");
  });

  it("treats every existing analysis status as covered", () => {
    expect(
      (["queued", "processing", "ready", "failed"] as const).every(analysisAlreadyCovered),
    ).toBe(true);
    expect(analysisAlreadyCovered(undefined)).toBe(false);
  });
});
