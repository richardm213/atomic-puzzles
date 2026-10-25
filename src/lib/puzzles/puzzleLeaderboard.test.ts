import { describe, expect, it } from "vitest";

import {
  buildPuzzleLeaderboardRows,
  calculatePuzzleCorrectPercent,
  isPuzzleLeaderboardEligible,
  puzzleActivityBonus,
  puzzleTrophyLevel,
} from "./puzzleLeaderboard";

const metricRow = (
  username: string,
  rating: number,
  ratingDeviation: number,
  attempted: number,
  correct = attempted,
) => ({ username, rating, ratingDeviation, attempted, correct, averageSeconds: null });

describe("puzzleLeaderboard", () => {
  it("calculates whole-number correct percentages", () => {
    expect(calculatePuzzleCorrectPercent(6, 11)).toBe(55);
    expect(calculatePuzzleCorrectPercent(1, 8)).toBe(13);
    expect(calculatePuzzleCorrectPercent(0, 0)).toBe(0);
  });

  it("scales the activity bonus gradually toward 50 points", () => {
    expect(puzzleActivityBonus(0)).toBe(0);
    expect(puzzleActivityBonus(100)).toBe(9);
    expect(puzzleActivityBonus(500)).toBe(32);
    expect(puzzleActivityBonus(1_000)).toBe(43);
    expect(puzzleActivityBonus(100_000)).toBe(50);
  });

  it("requires 20 monthly attempts and RD below 60", () => {
    expect(isPuzzleLeaderboardEligible(metricRow("eligible", 2100, 59, 20), "monthly")).toBe(true);
    expect(isPuzzleLeaderboardEligible(metricRow("high-rd", 2200, 60, 20), "monthly")).toBe(false);
    expect(isPuzzleLeaderboardEligible(metricRow("few-attempts", 2200, 30, 19), "monthly")).toBe(
      false,
    );
  });

  it("ranks eligible monthly players by rating plus activity and leaves ineligible players unranked", () => {
    const rows = buildPuzzleLeaderboardRows(
      [
        metricRow("tied-later", 2200, 45, 22, 18),
        metricRow("leader", 2210, 50, 20, 16),
        metricRow("tied-first", 2200, 40, 20, 15),
        metricRow("ineligible", 2400, 60, 30, 25),
      ],
      "monthly",
    );

    expect(rows.find(({ username }) => username === "leader")?.rank).toBe(1);
    expect(rows.find(({ username }) => username === "tied-first")?.rank).toBe(2);
    expect(rows.find(({ username }) => username === "tied-later")?.rank).toBe(2);
    expect(rows.find(({ username }) => username === "ineligible")).toMatchObject({
      eligible: false,
      rank: null,
    });
  });

  it("lets sustained activity change rank without changing the underlying rating", () => {
    const rows = buildPuzzleLeaderboardRows(
      [metricRow("active", 2230, 40, 500), metricRow("inactive", 2250, 40, 20)],
      "monthly",
    );

    expect(rows.find(({ username }) => username === "active")).toMatchObject({
      rating: 2230,
      activityBonus: 32,
      leaderboardScore: 2262,
      rank: 1,
    });
    expect(rows.find(({ username }) => username === "inactive")?.rank).toBe(2);
  });

  it("keeps all-time rankings at 20 attempts without an RD requirement", () => {
    expect(isPuzzleLeaderboardEligible(metricRow("established", 2100, 300, 20), "all")).toBe(true);
    expect(isPuzzleLeaderboardEligible(metricRow("new", 2100, 30, 19), "all")).toBe(false);
  });

  it("awards current ranking trophies through the top 10", () => {
    expect(puzzleTrophyLevel(1)).toBe("gold");
    expect(puzzleTrophyLevel(2)).toBe("red");
    expect(puzzleTrophyLevel(3)).toBe("silver");
    expect(puzzleTrophyLevel(10)).toBe("silver");
    expect(puzzleTrophyLevel(11)).toBeNull();
    expect(puzzleTrophyLevel(null)).toBeNull();
  });

  it("uses the server-aggregated average puzzle time", () => {
    const rows = buildPuzzleLeaderboardRows(
      [{ ...metricRow("solver", 2100, 50, 20), averageSeconds: 465 }],
      "monthly",
    );

    expect(rows[0]?.averageSeconds).toBe(465);
  });
});
