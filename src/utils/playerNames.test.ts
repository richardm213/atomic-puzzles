import { describe, expect, it } from "vitest";

import { normalizeUsername } from "./playerNames";

describe("normalizeUsername", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeUsername("  Alice  ")).toBe("alice");
    expect(normalizeUsername("BOB123")).toBe("bob123");
  });

  it("returns '' for non-string / nullish input", () => {
    expect(normalizeUsername(null)).toBe("");
    expect(normalizeUsername(undefined)).toBe("");
    expect(normalizeUsername(42)).toBe("42");
  });
});
