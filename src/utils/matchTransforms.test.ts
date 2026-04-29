import { describe, expect, it } from "vitest";

import {
  findRatingDataForPlayer,
  normalizedGamesFromMatch,
  normalizedPlayersFromMatch,
  normalizedRatingsFromMatch,
  parseTimeControlParts,
  parseWinnerFromPerspective,
  winnerToFullWord,
} from "./matchTransforms";

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

  it("falls back to compact `p`", () => {
    expect(normalizedPlayersFromMatch({ p: ["x", "y"] })).toEqual(["x", "y"]);
  });

  it("returns [] when neither shape is present", () => {
    expect(normalizedPlayersFromMatch({})).toEqual([]);
    expect(normalizedPlayersFromMatch(null)).toEqual([]);
  });
});

describe("normalizedGamesFromMatch", () => {
  const players = ["alice", "bob"];

  it("normalizes object games", () => {
    const result = normalizedGamesFromMatch(
      {
        games: [{ id: "g1", white: "alice", black: "bob", winner: "w" }],
      },
      players,
    );
    expect(result).toEqual([{ id: "g1", white: "alice", black: "bob", winner: "white" }]);
  });

  it("normalizes compact (array) games using player indices", () => {
    // Order is [id, whiteRef, blackRef, winnerRef] — so [0, 1, "w"] →
    // white=alice (index 0), black=bob (index 1), winner=white.
    const result = normalizedGamesFromMatch(
      {
        g: [["g1", 0, 1, "w"]],
      },
      players,
    );
    expect(result[0]?.white).toBe("alice");
    expect(result[0]?.black).toBe("bob");
    expect(result[0]?.winner).toBe("white");
  });

  it("falls back to em-dash when there's no id", () => {
    const result = normalizedGamesFromMatch({ games: [{ white: "alice" }] }, players);
    expect(result[0]?.id).toBe("—");
  });

  it("returns [] when there are no games", () => {
    expect(normalizedGamesFromMatch({}, players)).toEqual([]);
  });
});

describe("normalizedRatingsFromMatch", () => {
  it("merges expanded `ratings` with compact `ratings_compact`", () => {
    const result = normalizedRatingsFromMatch(
      {
        ratings: {
          alice: { before_rating: 1500, after_rating: 1510, before_rd: null, after_rd: null },
        },
        u: [["bob", 1400, 1390, 50, 60]],
      },
      ["alice", "bob"],
    );
    expect(result).toMatchObject({
      alice: { before_rating: 1500, after_rating: 1510 },
      bob: { before_rating: 1400, after_rating: 1390, before_rd: 50, after_rd: 60 },
    });
  });

  it("returns {} for an empty match", () => {
    expect(normalizedRatingsFromMatch({}, [])).toEqual({});
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
    expect(
      parseWinnerFromPerspective({ white: "Alice", black: "Bob", winner: "w" }, "alice"),
    ).toBe("win");
  });

  it("returns 'loss' when the user lost as black", () => {
    expect(
      parseWinnerFromPerspective({ white: "Alice", black: "Bob", winner: "w" }, "bob"),
    ).toBe("loss");
  });

  it("returns 'draw' for a drawn game", () => {
    expect(
      parseWinnerFromPerspective({ white: "Alice", black: "Bob", winner: "d" }, "alice"),
    ).toBe("draw");
  });
});

describe("parseTimeControlParts", () => {
  it("splits the standard initial+increment notation", () => {
    expect(parseTimeControlParts("180+0")).toEqual({ initial: "180", increment: "0" });
    expect(parseTimeControlParts("60+1")).toEqual({ initial: "60", increment: "1" });
  });

  it("returns NaN for the increment when only an initial number is given", () => {
    // Empty string splits to [""], so initial=Number("")=0 and increment=NaN.
    expect(parseTimeControlParts(undefined)).toEqual({ initial: "0", increment: "NaN" });
  });
});
