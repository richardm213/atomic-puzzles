import { z } from "zod";

import { normalizeUsername } from "../../utils/playerNames";
import { postApi } from "../api/postApi";
import { getSupabaseClient } from "./client";
import { fetchAllSupabaseRows, loadSupabaseRows } from "./rows";

export type PuzzleUserRating = {
  username: string;
  rating: number;
  ratingDeviation: number;
  attempts: number;
  successes: number;
  updatedAt: string | null;
  lastAttemptAt: string | null;
  timedAttempts: number;
  totalDurationMs: number;
  averageTimeSeconds: number | null;
};

export type PuzzleRatingEvent = {
  username: string;
  puzzleId: string;
  attemptedAt: string;
  puzzleCorrect: boolean;
  userRatingBefore: number;
  userRatingAfter: number;
  userRatingChange: number;
  userRatingDeviationBefore: number;
  userRatingDeviationAfter: number;
  puzzleRatingBefore: number;
  puzzleRatingAfter: number;
  puzzleRatingChange: number;
};

export type PuzzleLeaderboardMetricRow = {
  username: string;
  rating: number;
  ratingDeviation: number;
  attempted: number;
  correct: number;
  averageSeconds: number | null;
};

export type PuzzleRankingTrophyRow = Omit<PuzzleLeaderboardMetricRow, "averageSeconds"> & {
  month: string;
  rank: number;
  eligible: true;
};

type PuzzleUserRatingRow = {
  username?: string | null;
  rating?: number | null;
  rating_deviation?: number | null;
  attempts?: number | null;
  successes?: number | null;
  updated_at?: string | null;
  last_attempt_at?: string | null;
  timed_attempts?: number | null;
  total_duration_ms?: number | null;
  average_time_seconds?: number | null;
};

const puzzleRatingEventResponseSchema = z.object({
  username: z.string(),
  puzzleId: z.string(),
  attemptedAt: z.string(),
  puzzleCorrect: z.boolean(),
  userRatingBefore: z.number(),
  userRatingAfter: z.number(),
  userRatingDeviationBefore: z.number(),
  userRatingDeviationAfter: z.number(),
  puzzleRatingBefore: z.number(),
  puzzleRatingAfter: z.number(),
});

const puzzleRatingHistoryResponseSchema = z.object({
  events: z.array(puzzleRatingEventResponseSchema),
});

const puzzleLeaderboardResponseSchema = z.object({
  rows: z.array(
    z.object({
      username: z.string(),
      rating: z.number(),
      ratingDeviation: z.number(),
      attempted: z.number(),
      correct: z.number(),
      averageSeconds: z.number().nullable(),
    }),
  ),
});

const puzzleRankingTrophiesResponseSchema = z.object({
  rows: z.array(
    z.object({
      username: z.string(),
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      rank: z.number().int().min(1).max(10),
      eligible: z.literal(true),
      rating: z.number(),
      ratingDeviation: z.number(),
      attempted: z.number(),
      correct: z.number(),
    }),
  ),
});

const normalizePuzzleUserRating = (row: PuzzleUserRatingRow): PuzzleUserRating => ({
  username: normalizeUsername(row.username),
  rating: Math.round(Number(row.rating) || 2000),
  ratingDeviation: Math.max(0, Math.round(Number(row.rating_deviation) || 350)),
  attempts: Math.max(0, Math.round(Number(row.attempts) || 0)),
  successes: Math.max(0, Math.round(Number(row.successes) || 0)),
  updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  lastAttemptAt: typeof row.last_attempt_at === "string" ? row.last_attempt_at : null,
  timedAttempts: Math.max(0, Math.round(Number(row.timed_attempts) || 0)),
  totalDurationMs: Math.max(0, Math.round(Number(row.total_duration_ms) || 0)),
  averageTimeSeconds:
    typeof row.average_time_seconds === "number"
      ? Math.max(0, Math.round(row.average_time_seconds))
      : null,
});

export const fetchPuzzleUserRating = async (username: string): Promise<PuzzleUserRating | null> => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;

  const supabase = getSupabaseClient();
  const rows = await loadSupabaseRows<PuzzleUserRatingRow>(
    "puzzle_user_ratings",
    supabase
      .from("puzzle_user_ratings")
      .select(
        "username,rating,rating_deviation,attempts,successes,updated_at,last_attempt_at,timed_attempts,total_duration_ms,average_time_seconds",
      )
      .eq("username", normalizedUsername)
      .limit(1),
  );
  const row = rows[0];
  if (!row) return null;

  return normalizePuzzleUserRating(row);
};

export const fetchAllPuzzleUserRatings = async (): Promise<PuzzleUserRating[]> => {
  const supabase = getSupabaseClient();
  const rows = await fetchAllSupabaseRows<PuzzleUserRatingRow>("puzzle_user_ratings", () =>
    supabase
      .from("puzzle_user_ratings")
      .select(
        "username,rating,rating_deviation,attempts,successes,updated_at,last_attempt_at,timed_attempts,total_duration_ms,average_time_seconds",
      )
      .order("rating", { ascending: false }),
  );

  return rows.map(normalizePuzzleUserRating).filter((row) => row.username);
};

export const fetchPuzzleLeaderboard = async (
  period: "monthly" | "all",
  month: string,
): Promise<PuzzleLeaderboardMetricRow[]> => {
  const result = await postApi(
    "/api/puzzles/rating",
    { action: "leaderboard", period, ...(period === "monthly" ? { month } : {}) },
    {
      schema: puzzleLeaderboardResponseSchema,
      errorMessage: "Unable to load puzzle rankings.",
      invalidMessage: "The puzzle rankings service returned invalid data.",
    },
  );
  return result.rows.map((row) => ({
    username: normalizeUsername(row.username),
    rating: Math.round(row.rating),
    ratingDeviation: Math.max(0, Math.round(row.ratingDeviation)),
    attempted: Math.max(0, Math.round(row.attempted)),
    correct: Math.max(0, Math.round(row.correct)),
    averageSeconds:
      typeof row.averageSeconds === "number" ? Math.max(0, Math.round(row.averageSeconds)) : null,
  }));
};

export const fetchPuzzleRankingTrophies = async (): Promise<PuzzleRankingTrophyRow[]> => {
  const result = await postApi(
    "/api/puzzles/rating",
    { action: "trophies" },
    {
      schema: puzzleRankingTrophiesResponseSchema,
      errorMessage: "Unable to load puzzle ranking trophies.",
      invalidMessage: "The puzzle ranking trophy service returned invalid data.",
    },
  );
  return result.rows.map((row) => ({ ...row, username: normalizeUsername(row.username) }));
};

export const fetchPuzzleRatingEventsForUsername = async (
  username: string,
): Promise<PuzzleRatingEvent[]> => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return [];

  const result = await postApi(
    "/api/puzzles/rating",
    { action: "history", username: normalizedUsername },
    {
      schema: puzzleRatingHistoryResponseSchema,
      errorMessage: "Unable to load puzzle rating history.",
      invalidMessage: "Unable to load puzzle rating history: the server returned invalid data.",
    },
  );

  return result.events.map((event) => ({
    ...event,
    username: normalizeUsername(event.username),
    userRatingChange: event.userRatingAfter - event.userRatingBefore,
    puzzleRatingChange: event.puzzleRatingAfter - event.puzzleRatingBefore,
  }));
};
