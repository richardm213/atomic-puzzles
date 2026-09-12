import { describe, expect, it } from "vitest";

import { formatRankingUpdatedAt } from "./formatRankingUpdatedAt";

describe("formatRankingUpdatedAt", () => {
  it("uses the viewer's local calendar and clock with the requested format", () => {
    expect(formatRankingUpdatedAt(new Date(2026, 8, 12, 14, 50).getTime())).toBe("Sep 12 2:50 pm");
  });

  it("formats midnight and noon without zero-padding the hour", () => {
    expect(formatRankingUpdatedAt(new Date(2026, 0, 1, 0, 5).getTime())).toBe("Jan 1 12:05 am");
    expect(formatRankingUpdatedAt(new Date(2026, 0, 1, 12, 0).getTime())).toBe("Jan 1 12:00 pm");
  });

  it("hides missing or invalid timestamps instead of showing the current time", () => {
    for (const value of [null, undefined, NaN, Infinity, 1e20]) {
      expect(formatRankingUpdatedAt(value)).toBe("");
    }
  });
});
