import { describe, expect, it } from "vitest";
import { matchupToSlug, parseMatchupSlug } from "./h2hRoutes";

describe("matchupToSlug", () => {
  it("produces a `<a>-vs-<b>` slug with URL-encoded names", () => {
    expect(matchupToSlug("alice", "bob")).toBe("alice-vs-bob");
  });

  it("URL-encodes special characters", () => {
    expect(matchupToSlug("a/b", "c d")).toBe("a%2Fb-vs-c%20d");
  });
});

describe("parseMatchupSlug", () => {
  it("round-trips matchups produced by matchupToSlug", () => {
    expect(parseMatchupSlug("alice-vs-bob")).toEqual({ player1: "alice", player2: "bob" });
    expect(parseMatchupSlug("a%2Fb-vs-c%20d")).toEqual({ player1: "a/b", player2: "c d" });
  });

  it("returns null when the separator is missing or sides are blank", () => {
    expect(parseMatchupSlug("")).toBeNull();
    expect(parseMatchupSlug("alice")).toBeNull();
    expect(parseMatchupSlug("-vs-bob")).toBeNull();
    expect(parseMatchupSlug("alice-vs-")).toBeNull();
    expect(parseMatchupSlug(null)).toBeNull();
  });

  it("returns null when one of the sides is invalid URL encoding", () => {
    expect(parseMatchupSlug("%E0%A4%A-vs-bob")).toBeNull();
  });
});
