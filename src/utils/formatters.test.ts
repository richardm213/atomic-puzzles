import { describe, expect, it } from "vitest";

import {
  formatCalendarDate,
  formatLocalDateTime,
  formatOpponentWithRating,
  formatScore,
  formatSignedDecimal,
} from "./formatters";

describe("formatSignedDecimal", () => {
  it("rounds to one decimal place", () => {
    expect(formatSignedDecimal(2.34)).toBe("+2.3");
    expect(formatSignedDecimal(-0.05)).toBe("0");
  });

  it("prefixes positives with +", () => {
    expect(formatSignedDecimal(1)).toBe("+1");
  });

  it("does not prefix negatives or zero", () => {
    expect(formatSignedDecimal(-3.2)).toBe("-3.2");
    expect(formatSignedDecimal(0)).toBe("0");
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
  it("renders the local date and lower-cased am/pm time", () => {
    const result = formatLocalDateTime("2024-03-15T14:30:00Z");
    expect(result).toMatch(/(am|pm)$/);
  });
});

describe("formatScore", () => {
  it("returns the numeric stringification", () => {
    expect(formatScore(2.5)).toBe("2.5");
    expect(formatScore("3")).toBe("3");
  });
});

describe("formatOpponentWithRating", () => {
  it("formats username and rating in parentheses", () => {
    expect(formatOpponentWithRating("alice", 1500)).toBe("alice (1500)");
  });
});
