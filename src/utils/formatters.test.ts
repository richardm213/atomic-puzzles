import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatCalendarDate,
  formatGameCount,
  formatLocalDateTime,
  formatOpponentWithRating,
  formatSignedDecimal,
} from "./formatters";

describe("formatSignedDecimal", () => {
  it.each([
    [2.34, "+2.3"],
    [-0.05, "0"],
    [1, "+1"],
    [-3.2, "-3.2"],
    [0, "0"],
  ])("formats %s as %s", (value, expected) => {
    expect(formatSignedDecimal(value)).toBe(expected);
  });
});

describe("formatCalendarDate", () => {
  it("returns a `Mon DD, YYYY` US-locale string in UTC", () => {
    expect(formatCalendarDate("2024-03-15")).toBe("Mar 15, 2024");
  });

  it("returns '' for falsy / unparseable inputs", () => {
    expect(formatCalendarDate(null)).toBe("");
    expect(formatCalendarDate(undefined)).toBe("");
    expect(formatCalendarDate("garbage")).toBe("");
  });
});

describe("formatLocalDateTime", () => {
  afterEach(() => vi.useRealTimers());

  it("omits the year only for dates in the current local year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 6, 1, 12));

    expect(formatLocalDateTime(new Date(2024, 2, 15, 14, 30))).toBe("Mar 15 2:30 pm");
    expect(formatLocalDateTime(new Date(2023, 2, 15, 14, 30))).toBe("Mar 15, 2023 2:30 pm");
  });
});

describe("formatGameCount", () => {
  it.each([
    [999, "999"],
    [1_000, "1k"],
    [9_999, "10k"],
    [10_000, "10k"],
    [999_000, "999k"],
    [1_000_000, "1M"],
    [9_999_999, "10M"],
    [10_000_000, "10M"],
  ])("formats %s games as %s", (games, expected) => {
    expect(formatGameCount(games)).toBe(expected);
  });
});

describe("formatOpponentWithRating", () => {
  it("formats username and rating in parentheses", () => {
    expect(formatOpponentWithRating("alice", 1500)).toBe("alice (1500)");
  });
});
