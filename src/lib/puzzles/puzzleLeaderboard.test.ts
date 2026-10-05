import { describe, expect, it } from "vitest";

import {
  buildPuzzleLeaderboardRows,
  calculatePuzzleCorrectPercent,
  filterPuzzleProgressRowsByPeriod,
  isPuzzleLeaderboardEligible,
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

  it("requires 20 monthly attempts and RD below 60", () => {
    expect(isPuzzleLeaderboardEligible(metricRow("eligible", 2100, 59, 20), "monthly")).toBe(true);
    expect(isPuzzleLeaderboardEligible(metricRow("high-rd", 2200, 60, 20), "monthly")).toBe(false);
    expect(isPuzzleLeaderboardEligible(metricRow("few-attempts", 2200, 30, 19), "monthly")).toBe(
      false,
    );
  });

  it("ranks eligible monthly players by rating and leaves ineligible players unranked", () => {
    const rows = buildPuzzleLeaderboardRows(
      [
        metricRow("tied-later", 2200, 45, 22, 18),
        metricRow("leader", 2300, 50, 20, 16),
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

  it("filters attempts to the selected calendar month", () => {
    const rows = [
      {
        username: "start-of-month",
        puzzle_id: "1",
        first_attempt_at: "2026-07-01T00:00:00.000Z",
        puzzle_correct: true,
        incorrect_move: null,
      },
      {
        username: "end-of-month",
        puzzle_id: "2",
        first_attempt_at: "2026-07-31T23:59:59.999Z",
        puzzle_correct: false,
        incorrect_move: "Nf3",
      },
      {
        username: "next-month",
        puzzle_id: "3",
        first_attempt_at: "2026-08-01T00:00:00.000Z",
        puzzle_correct: true,
        incorrect_move: null,
      },
    ];

    expect(filterPuzzleProgressRowsByPeriod(rows, "monthly", "2026-07")).toEqual([
      rows[0],
      rows[1],
    ]);
    expect(filterPuzzleProgressRowsByPeriod(rows, "all", "2026-07")).toBe(rows);
  });

  it("averages rated puzzle times in seconds and excludes durations above 15 minutes", () => {
    const rows = buildPuzzleLeaderboardRows(
      [metricRow("solver", 2100, 50, 20)],
      "monthly",
      [
        {
          username: "solver",
          puzzle_id: "1",
          first_attempt_at: "2026-07-01T00:00:00.000Z",
          first_attempt_duration_ms: 30_000,
          puzzle_correct: true,
          rated: true,
          incorrect_move: null,
        },
        {
          username: "solver",
          puzzle_id: "2",
          first_attempt_at: "2026-07-02T00:00:00.000Z",
          first_attempt_duration_ms: 900_000,
          puzzle_correct: true,
          rated: true,
          incorrect_move: null,
        },
        {
          username: "solver",
          puzzle_id: "3",
          first_attempt_at: "2026-07-03T00:00:00.000Z",
          first_attempt_duration_ms: 900_001,
          puzzle_correct: false,
          rated: true,
          incorrect_move: "Nf3",
        },
        {
          username: "solver",
          puzzle_id: "4",
          first_attempt_at: "2026-07-04T00:00:00.000Z",
          first_attempt_duration_ms: 1_000,
          puzzle_correct: true,
          rated: false,
          incorrect_move: null,
        },
      ],
      "2026-07",
    );

    expect(rows[0]?.averageSeconds).toBe(465);
  });
});
