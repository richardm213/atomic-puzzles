import { describe, expect, it } from "vitest";

import {
  buildPuzzleLeaderboardRows,
  calculatePuzzleCorrectPercent,
  calculatePuzzleScore,
  PUZZLE_CORRECT_POINTS,
  PUZZLE_INCORRECT_POINTS,
} from "./puzzleLeaderboard";

describe("puzzleLeaderboard", () => {
  it("scores correct and incorrect attempts", () => {
    expect(calculatePuzzleScore(3, 5)).toBe(3 * PUZZLE_CORRECT_POINTS + 2 * PUZZLE_INCORRECT_POINTS);
  });

  it("calculates whole-number correct percentages", () => {
    expect(calculatePuzzleCorrectPercent(6, 11)).toBe(55);
    expect(calculatePuzzleCorrectPercent(1, 8)).toBe(13);
    expect(calculatePuzzleCorrectPercent(0, 0)).toBe(0);
  });

  it("groups users from puzzle progress rows", () => {
    const rows = buildPuzzleLeaderboardRows([
      {
        username: "alpha",
        puzzle_id: "1",
        first_attempt_at: "2026-01-01T00:00:00.000Z",
        puzzle_correct: true,
        incorrect_move: null,
      },
    ]);

    expect(rows).toEqual([
      {
        rank: 1,
        username: "alpha",
        score: 5,
        correct: 1,
        incorrect: 0,
        percentCorrect: 100,
        attempted: 1,
      },
    ]);
  });

  it("includes every progress username and ranks tied scores together", () => {
    const rows = buildPuzzleLeaderboardRows([
      {
        username: "second",
        puzzle_id: "1",
        first_attempt_at: "2026-01-01T00:00:00.000Z",
        puzzle_correct: true,
        incorrect_move: null,
      },
      {
        username: "first",
        puzzle_id: "2",
        first_attempt_at: "2026-01-01T00:01:00.000Z",
        puzzle_correct: true,
        incorrect_move: null,
      },
      {
        username: "third",
        puzzle_id: "3",
        first_attempt_at: "2026-01-01T00:02:00.000Z",
        puzzle_correct: false,
        incorrect_move: "2. Nf3+",
      },
    ]);

    expect(rows).toEqual([
      {
        rank: 1,
        username: "first",
        score: 5,
        correct: 1,
        incorrect: 0,
        percentCorrect: 100,
        attempted: 1,
      },
      {
        rank: 1,
        username: "second",
        score: 5,
        correct: 1,
        incorrect: 0,
        percentCorrect: 100,
        attempted: 1,
      },
      {
        rank: 3,
        username: "third",
        score: -3,
        correct: 0,
        incorrect: 1,
        percentCorrect: 0,
        attempted: 1,
      },
    ]);
  });
});
