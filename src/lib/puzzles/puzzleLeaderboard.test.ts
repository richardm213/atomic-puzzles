import { describe, expect, it } from "vitest";

import {
  buildPuzzleLeaderboardRows,
  calculatePuzzleScore,
  PUZZLE_CORRECT_POINTS,
  PUZZLE_INCORRECT_POINTS,
} from "./puzzleLeaderboard";

describe("puzzleLeaderboard", () => {
  it("scores correct and incorrect attempts", () => {
    expect(calculatePuzzleScore(3, 5)).toBe(3 * PUZZLE_CORRECT_POINTS + 2 * PUZZLE_INCORRECT_POINTS);
  });

  it("groups users from puzzle progress rows", () => {
    const rows = buildPuzzleLeaderboardRows([
      {
        username: "alpha",
        puzzle_id: "1",
        first_attempt_at: "2026-01-01T00:00:00.000Z",
        puzzle_correct: true,
      },
    ]);

    expect(rows).toEqual([
      { rank: 1, username: "alpha", score: 5, correct: 1, incorrect: 0, attempted: 1 },
    ]);
  });

  it("includes every progress username and ranks tied scores together", () => {
    const rows = buildPuzzleLeaderboardRows([
      {
        username: "second",
        puzzle_id: "1",
        first_attempt_at: "2026-01-01T00:00:00.000Z",
        puzzle_correct: true,
      },
      {
        username: "first",
        puzzle_id: "2",
        first_attempt_at: "2026-01-01T00:01:00.000Z",
        puzzle_correct: true,
      },
      {
        username: "third",
        puzzle_id: "3",
        first_attempt_at: "2026-01-01T00:02:00.000Z",
        puzzle_correct: false,
      },
    ]);

    expect(rows).toEqual([
      { rank: 1, username: "first", score: 5, correct: 1, incorrect: 0, attempted: 1 },
      { rank: 1, username: "second", score: 5, correct: 1, incorrect: 0, attempted: 1 },
      { rank: 3, username: "third", score: -3, correct: 0, incorrect: 1, attempted: 1 },
    ]);
  });
});
