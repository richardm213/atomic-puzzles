import type { PuzzleProgressWithUsernameRow } from "../../types/supabase";
import { normalizeUsername } from "../../utils/playerNames";

export const PUZZLE_CORRECT_POINTS = 5;
export const PUZZLE_INCORRECT_POINTS = -3;

export type PuzzleLeaderboardRow = {
  rank: number;
  username: string;
  score: number;
  correct: number;
  incorrect: number;
  attempted: number;
};

type PuzzleLeaderboardAccumulator = Omit<PuzzleLeaderboardRow, "rank">;

export const calculatePuzzleScore = (correct: number, attempted: number): number => {
  const normalizedCorrect = Math.max(0, Math.floor(Number(correct)) || 0);
  const normalizedAttempted = Math.max(normalizedCorrect, Math.floor(Number(attempted)) || 0);
  const incorrect = normalizedAttempted - normalizedCorrect;

  return normalizedCorrect * PUZZLE_CORRECT_POINTS + incorrect * PUZZLE_INCORRECT_POINTS;
};

const rankPuzzleLeaderboardRows = (
  rows: PuzzleLeaderboardAccumulator[],
): PuzzleLeaderboardRow[] => {
  let previousScore: number | null = null;
  let previousRank = 0;

  return rows
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      if (left.correct !== right.correct) return right.correct - left.correct;
      if (left.attempted !== right.attempted) return left.attempted - right.attempted;
      return left.username.localeCompare(right.username);
    })
    .map((row, index) => {
      const rank = previousScore === row.score ? previousRank : index + 1;
      previousScore = row.score;
      previousRank = rank;

      return {
        rank,
        ...row,
      };
    });
};

export const buildPuzzleLeaderboardRows = (
  progressRows: PuzzleProgressWithUsernameRow[],
): PuzzleLeaderboardRow[] => {
  const rowsByUsername = new Map<string, PuzzleLeaderboardAccumulator>();

  progressRows.forEach((row) => {
    const username = normalizeUsername(row?.username);
    if (!username) return;

    const existing = rowsByUsername.get(username) ?? {
      username,
      score: 0,
      correct: 0,
      incorrect: 0,
      attempted: 0,
    };

    existing.attempted += 1;
    if (row?.puzzle_correct) {
      existing.correct += 1;
    } else {
      existing.incorrect += 1;
    }
    existing.score = calculatePuzzleScore(existing.correct, existing.attempted);
    rowsByUsername.set(username, existing);
  });

  return rankPuzzleLeaderboardRows([...rowsByUsername.values()]);
};
