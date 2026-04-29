import { describe, expect, it } from "vitest";

import {
  buildMatchRouteParams,
  hasMatchRouteParams,
  normalizeMatchMode,
} from "./matchRoutes";

describe("normalizeMatchMode", () => {
  it("returns the mode unchanged when valid", () => {
    expect(normalizeMatchMode("blitz")).toBe("blitz");
    expect(normalizeMatchMode("BULLET")).toBe("bullet");
    expect(normalizeMatchMode("Hyperbullet")).toBe("hyperbullet");
  });

  it("returns '' for unknown modes", () => {
    expect(normalizeMatchMode("classical")).toBe("");
    expect(normalizeMatchMode("")).toBe("");
    expect(normalizeMatchMode(null)).toBe("");
  });
});

describe("buildMatchRouteParams", () => {
  it("normalizes mode and stringifies matchId", () => {
    expect(buildMatchRouteParams({ mode: "blitz", matchId: "abc123" })).toEqual({
      mode: "blitz",
      matchId: "abc123",
    });
  });

  it("returns blanks when fields are missing", () => {
    expect(buildMatchRouteParams({})).toEqual({ mode: "", matchId: "" });
    expect(buildMatchRouteParams(null)).toEqual({ mode: "", matchId: "" });
  });
});

describe("hasMatchRouteParams", () => {
  it("returns true only when both mode and matchId are present", () => {
    expect(hasMatchRouteParams({ mode: "blitz", matchId: "abc" })).toBe(true);
    expect(hasMatchRouteParams({ mode: "blitz", matchId: " " })).toBe(false);
    expect(hasMatchRouteParams({ mode: "", matchId: "abc" })).toBe(false);
    expect(hasMatchRouteParams(null)).toBe(false);
  });
});
