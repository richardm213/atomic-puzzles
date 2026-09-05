import { describe, expect, it } from "vitest";

import {
  findRatingDataForPlayer,
  normalizedGamesFromMatch,
  normalizedPlayersFromMatch,
  normalizedRatingsFromMatch,
  parseTimeControlParts,
  parseWinnerFromPerspective,
  winnerToFullWord,
} from "./transforms";

describe("winnerToFullWord", () => {
  it.each([
    ["w", "white"],
    ["b", "black"],
    ["d", "draw"],
    ["W", "white"],
  ])("expands %s into %s", (input, expected) => {
    expect(winnerToFullWord(input)).toBe(expected);
  });

  it("passes through already-spelled-out winners", () => {
    expect(winnerToFullWord("white")).toBe("white");
  });

  it("returns empty string for falsy input", () => {
    expect(winnerToFullWord("")).toBe("");
    expect(winnerToFullWord(null)).toBe("");
    expect(winnerToFullWord(undefined)).toBe("");
  });
});

describe("normalizedPlayersFromMatch", () => {
  it("reads `players` first", () => {
    expect(normalizedPlayersFromMatch({ players: ["a", "b"] })).toEqual(["a", "b"]);
  });

  it("returns [] when players are absent", () => {
    expect(normalizedPlayersFromMatch({})).toEqual([]);
    expect(normalizedPlayersFromMatch(null)).toEqual([]);
  });
});

describe("normalizedGamesFromMatch", () => {
  it("normalizes object games", () => {
    const result = normalizedGamesFromMatch({
      games: [{ id: "g1", white: "alice", black: "bob", winner: "w" }],
    });
    expect(result).toEqual([{ id: "g1", white: "alice", black: "bob", winner: "white" }]);
  });

  it("falls back to em-dash when there's no id", () => {
    const result = normalizedGamesFromMatch({ games: [{ white: "alice" }] });
    expect(result[0]?.id).toBe("—");
  });

  it("returns [] when there are no games", () => {
    expect(normalizedGamesFromMatch({})).toEqual([]);
  });
});

describe("normalizedRatingsFromMatch", () => {
  it("reads expanded ratings", () => {
    const result = normalizedRatingsFromMatch({
      ratings: {
        alice: { before_rating: 1500, after_rating: 1510, before_rd: null, after_rd: null },
        bob: { before_rating: 1400, after_rating: 1390, before_rd: 50, after_rd: 60 },
      },
    });
    expect(result).toMatchObject({
      alice: { before_rating: 1500, after_rating: 1510 },
      bob: { before_rating: 1400, after_rating: 1390, before_rd: 50, after_rd: 60 },
    });
  });

  it("returns {} for an empty match", () => {
    expect(normalizedRatingsFromMatch({})).toEqual({});
  });
});

describe("findRatingDataForPlayer", () => {
  const ratings = {
    Alice: { before_rating: 1500, after_rating: 1510, before_rd: 60, after_rd: 50 },
  } as const;

  it("returns the entry when keys match exactly", () => {
    expect(findRatingDataForPlayer(ratings, "Alice")?.before_rating).toBe(1500);
  });

  it("falls back to a case-insensitive lookup", () => {
    expect(findRatingDataForPlayer(ratings, "alice")?.after_rating).toBe(1510);
  });

  it("returns null when nothing matches", () => {
    expect(findRatingDataForPlayer(ratings, "nobody")).toBeNull();
    expect(findRatingDataForPlayer(null, "alice")).toBeNull();
  });
});

describe("parseWinnerFromPerspective", () => {
  it("returns 'win' when the user played white and won", () => {
    expect(parseWinnerFromPerspective({ white: "Alice", black: "Bob", winner: "w" }, "alice")).toBe(
      "win",
    );
  });

  it("returns 'loss' when the user lost as black", () => {
    expect(parseWinnerFromPerspective({ white: "Alice", black: "Bob", winner: "w" }, "bob")).toBe(
      "loss",
    );
  });

  it("returns 'draw' for a drawn game", () => {
    expect(parseWinnerFromPerspective({ white: "Alice", black: "Bob", winner: "d" }, "alice")).toBe(
      "draw",
    );
  });
});

describe("parseTimeControlParts", () => {
  it("splits the standard initial+increment notation", () => {
    expect(parseTimeControlParts("180+0")).toEqual({ initial: "180", increment: "0" });
    expect(parseTimeControlParts("60+1")).toEqual({ initial: "60", increment: "1" });
  });

  it.each([undefined, null, "", "60", "60+", "fast+1"])(
    "rejects an absent or malformed time control (%s)",
    (value) => {
      expect(parseTimeControlParts(value)).toEqual({ initial: "", increment: "" });
    },
  );

  it("normalizes numeric parts without leaking padded values into filters", () => {
    expect(parseTimeControlParts("060+01")).toEqual({ initial: "60", increment: "1" });
  });
});
