import { z } from "zod";

import {
  authenticateRequest,
  requireSameOrigin,
  requireUsername,
} from "../../../platform/authentication";
import type { FunctionEvent } from "../../../platform/defineFunction";
import { createServerSupabase } from "../../../platform/environment";
import { HttpError } from "../../../platform/errors";
import { jsonResponse } from "../../../platform/response";
import { parseJsonBody } from "../../../platform/validation";

const RATING_EDITOR = "seaside_tiramisu";
const ratingRequestSchema = z.union([
  z.object({ action: z.literal("history"), username: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal("trophies") }),
  z.object({
    action: z.literal("leaderboard"),
    period: z.enum(["monthly", "all"]),
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
  }),
  z.object({ action: z.literal("refresh") }),
  z.object({
    puzzleId: z.number().int().positive(),
    level: z.number().int().min(1).max(5),
  }),
]);

const serializeRatingEvent = (row: Record<string, unknown>) => ({
  username: String(row.username ?? ""),
  puzzleId: String(row.puzzle_id ?? ""),
  attemptedAt: String(row.attempted_at ?? ""),
  puzzleCorrect: Boolean(row.puzzle_correct),
  userRatingBefore: Number(row.user_rating_before),
  userRatingAfter: Number(row.user_rating_after),
  userRatingDeviationBefore: Number(row.user_rd_before),
  userRatingDeviationAfter: Number(row.user_rd_after),
  puzzleRatingBefore: Number(row.puzzle_rating_before),
  puzzleRatingAfter: Number(row.puzzle_rating_after),
});

const loadLeaderboardRows = async (period: "monthly" | "all", month: string | undefined) => {
  if (period === "monthly" && !month) {
    throw new HttpError(400, "Choose a month for monthly puzzle rankings.");
  }
  const supabase = createServerSupabase("Puzzle leaderboard service");
  const [{ data: rows, error }, { data: months, error: monthsError }] = await Promise.all([
    supabase.rpc("get_puzzle_leaderboard", {
      p_period: period,
      p_month: period === "monthly" ? month : null,
    }),
    supabase.rpc("get_puzzle_leaderboard_months"),
  ]);
  if (error) throw new Error(`Unable to load puzzle rankings: ${error.message}`);
  if (monthsError) throw new Error(`Unable to load puzzle ranking months: ${monthsError.message}`);

  return {
    rows: (rows ?? []).map((row: Record<string, unknown>) => ({
      username: String(row.username ?? "")
        .trim()
        .toLowerCase(),
      rating: Number(row.rating),
      ratingDeviation: Number(row.rating_deviation),
      attempted: Number(row.attempted),
      correct: Number(row.correct),
      activityAttempts: Number(row.activity_attempts),
      averageSeconds: row.average_seconds === null ? null : Number(row.average_seconds),
    })),
    months: (months ?? [])
      .map((row: Record<string, unknown>) => String(row.month ?? ""))
      .filter(Boolean),
  };
};

const loadPuzzleRankingTrophies = async () => {
  const supabase = createServerSupabase("Puzzle ranking trophy service");
  const { data, error } = await supabase.rpc("get_puzzle_ranking_trophies");
  if (error) throw new Error(`Unable to load puzzle ranking trophies: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    username: String(row.username ?? "")
      .trim()
      .toLowerCase(),
    month: String(row.month ?? ""),
    rank: Number(row.rank),
    eligible: Boolean(row.eligible),
    rating: Number(row.rating),
    ratingDeviation: Number(row.rating_deviation),
    attempted: Number(row.attempted),
    correct: Number(row.correct),
  }));
};

export const puzzleRatingRoute = async (event: FunctionEvent) => {
  const input = parseJsonBody(event, ratingRequestSchema, "Invalid puzzle rating request.");
  if ("action" in input && input.action === "leaderboard") {
    return jsonResponse(200, await loadLeaderboardRows(input.period, input.month));
  }
  if ("action" in input && input.action === "history") {
    const normalizedUsername = input.username.trim().toLocaleLowerCase();
    const supabase = createServerSupabase("Puzzle rating history service");
    const events: Record<string, unknown>[] = [];
    const pageSize = 1_000;

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("puzzle_rating_events")
        .select(
          "username,puzzle_id,attempted_at,puzzle_correct,user_rating_before,user_rating_after,user_rd_before,user_rd_after,puzzle_rating_before,puzzle_rating_after",
        )
        .eq("username", normalizedUsername)
        .order("attempted_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`Unable to load puzzle rating history: ${error.message}`);
      const page = (data ?? []) as Record<string, unknown>[];
      events.push(...page);
      if (page.length < pageSize) break;
    }

    return jsonResponse(200, { events: events.map(serializeRatingEvent) });
  }

  if ("action" in input && input.action === "trophies") {
    return jsonResponse(200, { rows: await loadPuzzleRankingTrophies() });
  }

  requireSameOrigin(event.headers, "Cross-site puzzle rating changes are not allowed.");
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Log in with Lichess to edit puzzle ratings.");
  if (username !== RATING_EDITOR) {
    throw new HttpError(403, "Only seaside_tiramisu can edit puzzle ratings.");
  }

  if ("action" in input) {
    const supabase = createServerSupabase("Puzzle rating refresh service");
    const { error: provisionalLevelError } = await supabase
      .from("puzzle_ratings")
      .update({ computed_level: 3 })
      .lt("attempts", 4)
      .is("human_level", null);
    if (provisionalLevelError) {
      throw new Error(
        `Unable to reset provisional puzzle levels: ${provisionalLevelError.message}`,
      );
    }

    const { error } = await supabase.rpc("rebuild_puzzle_ratings_from_history");
    if (error) throw new Error(`Unable to refresh puzzle ratings: ${error.message}`);
    return jsonResponse(200, { refreshed: true });
  }

  // Changing a puzzle's V grade only updates that puzzle's manual seed. Player
  // history stays frozen until the explicit refresh action replays all attempts.
  const { data, error } = await createServerSupabase("Puzzle rating service")
    .rpc("set_human_puzzle_level", {
      p_puzzle_id: input.puzzleId,
      p_username: username,
      p_level: input.level,
    })
    .single();

  if (error) throw new Error(`Unable to update puzzle rating: ${error.message}`);
  if (!data) throw new HttpError(404, "Puzzle not found.");
  const row = data as {
    puzzle_id: unknown;
    level: unknown;
    rating: unknown;
    rating_deviation: unknown;
    attempts: unknown;
    successes: unknown;
    source: unknown;
    updated_at: unknown;
  };

  return jsonResponse(200, {
    puzzleId: Number(row.puzzle_id),
    level: Number(row.level),
    rating: Number(row.rating),
    ratingDeviation: Number(row.rating_deviation),
    attempts: Number(row.attempts),
    successes: Number(row.successes),
    source: row.source,
    updatedAt: row.updated_at,
  });
};
