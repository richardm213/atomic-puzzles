import { describe, expect, it } from "vitest";

import { normalizeMatches } from "./matchData";

const baseMatch = {
  match_id: "abcdef1234",
  start_ts: 1_700_000_000_000,
  time_control: "180+0",
  source: "arena",
  players: ["alice", "bob"],
  games: [
    { id: "g1", white: "alice", black: "bob", winner: "w" },
    { id: "g2", white: "bob", black: "alice", winner: "w" },
    { id: "g3", white: "alice", black: "bob", winner: "d" },
  ],
  ratings: {
    alice: { before_rating: 1500, after_rating: 1495, before_rd: 60, after_rd: 60 },
    bob: { before_rating: 1400, after_rating: 1405, before_rd: 70, after_rd: 70 },
  },
};

describe("normalizeMatches", () => {
  it("returns matches sorted newest-first", () => {
    const older = { ...baseMatch, match_id: "older", start_ts: 1_600_000_000_000 };
    const newer = { ...baseMatch, match_id: "newer", start_ts: 1_700_000_000_000 };
    const matches = normalizeMatches([older, newer], "alice");
    expect(matches[0]?.matchId).toBe("newer");
    expect(matches[1]?.matchId).toBe("older");
  });

  it("filters out matches the player did not participate in", () => {
    const irrelevant = { ...baseMatch, players: ["carol", "dave"] };
    const matches = normalizeMatches([irrelevant], "alice");
    expect(matches).toEqual([]);
  });

  it("computes player and opponent scores from the player's perspective", () => {
    const matches = normalizeMatches([baseMatch], "alice");
    const match = matches[0];
    expect(match?.opponent).toBe("bob");
    // alice won g1 (white), lost g2 (black), drew g3 → 1.5 - 1.5
    expect(match?.playerScore).toBe(1.5);
    expect(match?.opponentScore).toBe(1.5);
    expect(match?.score).toBe("1.5-1.5");
    expect(match?.gameCount).toBe(3);
  });

  it("computes per-game running scores in the player's perspective", () => {
    const matches = normalizeMatches([baseMatch], "alice");
    const games = matches[0]?.games ?? [];
    expect(games[0]?.playerScoreAfter).toBe(1);
    expect(games[0]?.opponentScoreAfter).toBe(0);
    expect(games[1]?.playerScoreAfter).toBe(1);
    expect(games[1]?.opponentScoreAfter).toBe(1);
    expect(games[2]?.playerScoreAfter).toBe(1.5);
    expect(games[2]?.opponentScoreAfter).toBe(1.5);
  });

  it("derives rating and RD deltas for the player and opponent", () => {
    const matches = normalizeMatches([baseMatch], "alice");
    const match = matches[0];
    expect(match?.beforeRating).toBe(1500);
    expect(match?.afterRating).toBe(1495);
    expect(match?.ratingChange).toBe(-5);
    expect(match?.opponentBeforeRating).toBe(1400);
    expect(match?.opponentAfterRating).toBe(1405);
  });

  it("identifies the clinching game when the player has clinched", () => {
    // alice wins three in a row (clinch after game 2 in a 3-game match)
    const winningMatch = {
      ...baseMatch,
      games: [
        { id: "g1", white: "alice", black: "bob", winner: "w" },
        { id: "g2", white: "bob", black: "alice", winner: "b" },
        { id: "g3", white: "alice", black: "bob", winner: "w" },
      ],
    };
    const matches = normalizeMatches([winningMatch], "alice");
    expect(matches[0]?.playerScore).toBe(3);
    expect(matches[0]?.clinchingGameId).toBe("g2");
  });

  it("falls back to the first game id when there is no clinching game", () => {
    const matches = normalizeMatches([baseMatch], "alice");
    expect(matches[0]?.firstGameId).toBe("g1");
    expect(matches[0]?.clinchingGameId).toBe("g1");
  });

  it("handles non-array input by returning []", () => {
    expect(normalizeMatches(null, "alice")).toEqual([]);
    expect(normalizeMatches(undefined, "alice")).toEqual([]);
  });
});
