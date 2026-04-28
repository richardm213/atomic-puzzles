import { describe, expect, it } from "vitest";
import {
  matchSourceFromValues,
  parseDateInputBoundary,
  sourceValueFromValues,
} from "./matchFilters";

describe("parseDateInputBoundary", () => {
  it("returns MIN_SAFE_INTEGER for blank starts", () => {
    expect(parseDateInputBoundary("", "start")).toBe(Number.MIN_SAFE_INTEGER);
    expect(parseDateInputBoundary(undefined, "start")).toBe(Number.MIN_SAFE_INTEGER);
  });

  it("returns MAX_SAFE_INTEGER for blank ends", () => {
    expect(parseDateInputBoundary("", "end")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("returns the timestamp at midnight local time for start", () => {
    const ts = parseDateInputBoundary("2024-03-15", "start");
    const date = new Date(ts);
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(15);
    expect(date.getHours()).toBe(0);
  });

  it("returns end-of-day for end", () => {
    const ts = parseDateInputBoundary("2024-03-15", "end");
    const date = new Date(ts);
    expect(date.getHours()).toBe(23);
    expect(date.getMinutes()).toBe(59);
    expect(date.getSeconds()).toBe(59);
  });

  it("returns sentinel boundaries for an unparseable input", () => {
    expect(parseDateInputBoundary("nope", "start")).toBe(Number.MIN_SAFE_INTEGER);
    expect(parseDateInputBoundary("nope", "end")).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("sourceValueFromValues", () => {
  it("returns the first non-empty value", () => {
    expect(sourceValueFromValues(undefined, null, "  ", "Arena")).toBe("Arena");
  });

  it("returns the em-dash when nothing is provided", () => {
    expect(sourceValueFromValues()).toBe("—");
    expect(sourceValueFromValues(null, "")).toBe("—");
  });
});

describe("matchSourceFromValues", () => {
  it.each([
    ["arena tournament", "arena"],
    ["Friend Game", "friend"],
    ["Lobby pool", "lobby"],
    ["something weird", "unknown"],
  ])("classifies %p as %s", (input, expected) => {
    expect(matchSourceFromValues(input)).toBe(expected);
  });

  it("returns 'unknown' for empty / nullish values", () => {
    expect(matchSourceFromValues()).toBe("unknown");
    expect(matchSourceFromValues(null, undefined, "")).toBe("unknown");
  });
});
