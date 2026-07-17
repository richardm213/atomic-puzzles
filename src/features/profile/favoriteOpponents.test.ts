import { describe, expect, it } from "vitest";

import {
  compareFavoriteOpponentRows,
  type FavoriteOpponentMatch,
  getFavoriteOpponentAllowedMatchLimit,
  getFavoriteOpponentRows,
} from "./favoriteOpponents";

const match = (
  opponent: string,
  overrides: Partial<FavoriteOpponentMatch> = {},
): FavoriteOpponentMatch => ({
  matchId: `${opponent}-match`,
  startTs: 100,
  timeControl: "3+0",
  opponent,
  score: "2-1",
  playerScore: 2,
  opponentScore: 1,
  ratingChange: 5,
  rdChange: -1,
  beforeRating: 1900,
  beforeRd: 50,
  afterRating: 1905,
  afterRd: 49,
  opponentBeforeRating: 2000,
  opponentAfterRating: 1995,
  opponentBeforeRd: 50,
  opponentAfterRd: 49,
  gameCount: 3,
  firstGameId: `${opponent}-game`,
  clinchingGameId: "",
  games: [],
  sourceValue: "lichess",
  sourceKey: "arena",
  mode: "bullet",
  ...overrides,
});

describe("favorite opponent model", () => {
  it("aggregates aliases case-insensitively and chooses the most-played time control", () => {
    const rows = getFavoriteOpponentRows([
      match("Opponent", { startTs: 100, timeControl: "3+0" }),
      match("opponent", {
        startTs: 200,
        timeControl: "1+0",
        playerScore: 1,
        opponentScore: 1,
        gameCount: 2,
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      opponent: "Opponent",
      matchCount: 2,
      gameCount: 5,
      playerScore: 3,
      opponentScore: 2,
      favoriteTimeControl: "3+0",
      favoriteTimeControlCount: 3,
      mostRecentTs: 200,
    });
  });

  it("excludes unreliable rating changes and sorts deterministically", () => {
    const [alpha, beta] = getFavoriteOpponentRows([
      match("Alpha", { ratingChange: 20, beforeRd: 100 }),
      match("Beta", { ratingChange: 3, beforeRd: 40, startTs: 200 }),
    ]).sort((left, right) => compareFavoriteOpponentRows(left, right, "ratingGain", "desc"));

    expect(alpha!.opponent).toBe("Beta");
    expect(alpha!.ratingChange).toBe(3);
    expect(beta!.ratedMatchCount).toBe(0);
  });

  it("clamps a stored sample size to the selected mode's allowed values", () => {
    expect(getFavoriteOpponentAllowedMatchLimit("all", 5000)).toBe(2000);
    expect(getFavoriteOpponentAllowedMatchLimit("bullet", 5000)).toBe(5000);
    expect(getFavoriteOpponentAllowedMatchLimit("bullet", Number.NaN)).toBe(500);
  });
});
