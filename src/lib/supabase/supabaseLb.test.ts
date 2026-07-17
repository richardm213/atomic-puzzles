import { describe, expect, it } from "vitest";

import {
  isoMonthStartFromMonthKey,
  lbPlayerCountKey,
  monthDateFromMonthKey,
  monthKeyFromMonthValue,
  parseLbPlayerCountRows,
} from "./supabaseLb";

describe("monthKeyFromMonthValue", () => {
  it("formats an ISO date into a `Mon YYYY` key in UTC", () => {
    expect(monthKeyFromMonthValue("2024-03-01")).toBe("Mar 2024");
    expect(monthKeyFromMonthValue("2021-09-15T12:00:00Z")).toBe("Sep 2021");
  });

  it("returns '' for falsy or invalid input", () => {
    expect(monthKeyFromMonthValue("")).toBe("");
    expect(monthKeyFromMonthValue(null)).toBe("");
    expect(monthKeyFromMonthValue("not-a-date")).toBe("");
  });
});

describe("monthDateFromMonthKey", () => {
  it("parses 'Mon YYYY' into a UTC Date pinned to the 1st", () => {
    const date = monthDateFromMonthKey("Mar 2024");
    expect(date?.toISOString()).toBe("2024-03-01T00:00:00.000Z");
  });

  it("returns null for unknown month names or non-numeric years", () => {
    expect(monthDateFromMonthKey("Smarch 2024")).toBeNull();
    expect(monthDateFromMonthKey("Mar abcd")).toBeNull();
    expect(monthDateFromMonthKey(null)).toBeNull();
  });
});

describe("isoMonthStartFromMonthKey", () => {
  it("returns the YYYY-MM-DD form of the month start", () => {
    expect(isoMonthStartFromMonthKey("Mar 2024")).toBe("2024-03-01");
  });

  it("returns '' on bad input", () => {
    expect(isoMonthStartFromMonthKey("garbage")).toBe("");
  });
});

describe("parseLbPlayerCountRows", () => {
  it("converts a batched RPC response into profile lookup keys", () => {
    expect(
      parseLbPlayerCountRows([
        { month_value: "2024-03-01", mode: "blitz", player_count: 123 },
        { month_value: "2024-03-01T00:00:00Z", mode: "BULLET", player_count: 45 },
      ]),
    ).toEqual({
      [lbPlayerCountKey("2024-03-01", "blitz")]: 123,
      [lbPlayerCountKey("2024-03-01", "bullet")]: 45,
    });
  });

  it("ignores malformed rows", () => {
    expect(
      parseLbPlayerCountRows([
        { month_value: "", mode: "blitz", player_count: 10 },
        { month_value: "2024-03-01", mode: "", player_count: 10 },
        { month_value: "2024-03-01", mode: "blitz", player_count: Number.NaN },
      ]),
    ).toEqual({});
  });
});
