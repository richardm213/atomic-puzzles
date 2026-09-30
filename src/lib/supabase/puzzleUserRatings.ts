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
};

type PuzzleUserRatingRow = {
  username?: string | null;
  rating?: number | null;
  rating_deviation?: number | null;
  attempts?: number | null;
  successes?: number | null;
  updated_at?: string | null;
  last_attempt_at?: string | null;
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
});

const puzzleRatingHistoryResponseSchema = z.object({
  events: z.array(puzzleRatingEventResponseSchema),
});

const normalizePuzzleUserRating = (row: PuzzleUserRatingRow): PuzzleUserRating => ({
  username: normalizeUsername(row.username),
  rating: Math.round(Number(row.rating) || 2000),
  ratingDeviation: Math.max(0, Math.round(Number(row.rating_deviation) || 350)),
  attempts: Math.max(0, Math.round(Number(row.attempts) || 0)),
  successes: Math.max(0, Math.round(Number(row.successes) || 0)),
  updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  lastAttemptAt: typeof row.last_attempt_at === "string" ? row.last_attempt_at : null,
});

export const fetchPuzzleUserRating = async (username: string): Promise<PuzzleUserRating | null> => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;

  const supabase = getSupabaseClient();
  const rows = await loadSupabaseRows<PuzzleUserRatingRow>(
    "puzzle_user_ratings",
    supabase
      .from("puzzle_user_ratings")
      .select("username,rating,rating_deviation,attempts,successes,updated_at,last_attempt_at")
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
      .select("username,rating,rating_deviation,attempts,successes,updated_at,last_attempt_at")
      .order("rating", { ascending: false }),
  );

  return rows.map(normalizePuzzleUserRating).filter((row) => row.username);
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
  }));
};
