import { describe, expect, it } from "vitest";

import { scoreToneClass } from "./matchPresentation";

describe("scoreToneClass", () => {
  it("returns ' winner' when the score wins", () => {
    expect(scoreToneClass(2, 1)).toBe(" winner");
  });

  it("returns ' loser' when the score loses", () => {
    expect(scoreToneClass(0, 1)).toBe(" loser");
  });

  it("returns '' on a draw", () => {
    expect(scoreToneClass(1, 1)).toBe("");
  });

  it("coerces strings to numbers", () => {
    expect(scoreToneClass("3", "2")).toBe(" winner");
  });
});
