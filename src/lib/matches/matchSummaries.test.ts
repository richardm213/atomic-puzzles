import { describe, expect, it } from "vitest";

import {
  ratingsForPlayers,
  sourceKeyFromMatch,
  sourceValueFromMatch,
  summarizeMatchGames,
} from "./matchSummaries";

describe("summarizeMatchGames", () => {
  it("counts wins, losses, and draws across the match", () => {
    const summary = summarizeMatchGames(
      [
        { id: "g1", white: "alice", black: "bob", winner: "white" },
        { id: "g2", white: "bob", black: "alice", winner: "white" },
        { id: "g3", white: "alice", black: "bob", winner: "draw" },
      ],
      "alice",
      "bob",
    );

    expect(summary.scoreA).toBe(1.5);
    expect(summary.scoreB).toBe(1.5);
    expect(summary.playerAWins).toBe(1);
    expect(summary.playerBWins).toBe(1);
    expect(summary.draws).toBe(1);
    expect(summary.mappedGames).toHaveLength(3);
    expect(summary.mappedGames[0]?.scoreAAfter).toBe(1);
    expect(summary.mappedGames[1]?.scoreBAfter).toBe(1);
    expect(summary.mappedGames[2]?.scoreAAfter).toBe(1.5);
  });

  it("uses '—' as a fallback game id when one is missing", () => {
    const summary = summarizeMatchGames(
      [{ id: undefined as unknown as string, white: "alice", black: "bob", winner: "draw" }],
      "alice",
      "bob",
    );
    expect(summary.mappedGames[0]?.id).toBe("—");
  });
});

describe("sourceValueFromMatch / sourceKeyFromMatch", () => {
  it("prefers values from the first game over the match", () => {
    expect(
      sourceValueFromMatch({ source: "Lobby" }, { source: "Friend" }),
    ).toBe("Friend");
  });

  it("normalizes a source key to a known bucket", () => {
    expect(sourceKeyFromMatch({}, { match_source: "ARENA" })).toBe("arena");
    expect(sourceKeyFromMatch({ source: "Friend" }, undefined)).toBe("friend");
  });

  it("falls back to 'unknown' when nothing is recognizable", () => {
    expect(sourceKeyFromMatch({}, undefined)).toBe("unknown");
  });
});

describe("ratingsForPlayers", () => {
  it("pulls before/after rating + RD pairs from the match", () => {
    const result = ratingsForPlayers(
      {
        ratings: {
          alice: { before_rating: 1500, after_rating: 1520, before_rd: 60, after_rd: 55 },
          bob: { before_rating: 1400, after_rating: 1380, before_rd: 70, after_rd: 75 },
        },
      },
      ["alice", "bob"],
      "alice",
      "bob",
    );

    expect(result).toEqual({
      playerABeforeRating: 1500,
      playerAAfterRating: 1520,
      playerABeforeRd: 60,
      playerAAfterRd: 55,
      playerBBeforeRating: 1400,
      playerBAfterRating: 1380,
      playerBBeforeRd: 70,
      playerBAfterRd: 75,
    });
  });

  it("returns NaN-laden numbers when ratings are missing", () => {
    const result = ratingsForPlayers({}, ["alice", "bob"], "alice", "bob");
    expect(Number.isNaN(result.playerABeforeRating)).toBe(true);
    expect(Number.isNaN(result.playerBAfterRd)).toBe(true);
  });
});
