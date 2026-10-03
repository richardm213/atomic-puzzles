import { z } from "zod";

import { rankPuzzleLeaderboardMetrics } from "../../../../shared/domain/puzzles/puzzleLeaderboard";
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
});

const pageThrough = async (
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>,
  label: string,
): Promise<Record<string, unknown>[]> => {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1_000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw new Error(`Unable to load ${label}: ${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
};

const nextUtcMonth = (month: string): string => {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
};

const loadLeaderboardRows = async (period: "monthly" | "all", month: string | undefined) => {
  const supabase = createServerSupabase("Puzzle leaderboard service");
  if (period === "all") {
    const rows = await pageThrough(
      (from, to) =>
        supabase
          .from("puzzle_user_ratings")
          .select("username,rating,rating_deviation,attempts,successes")
          .order("rating", { ascending: false })
          .range(from, to),
      "all-time puzzle rankings",
    );
    return rows.map((row) => ({
      username: String(row.username ?? ""),
      rating: Number(row.rating),
      ratingDeviation: Number(row.rating_deviation),
      attempted: Number(row.attempts),
      correct: Number(row.successes),
    }));
  }

  if (!month) throw new HttpError(400, "Choose a month for monthly puzzle rankings.");
  const start = `${month}-01T00:00:00.000Z`;
  const end = `${nextUtcMonth(month)}-01T00:00:00.000Z`;
  const events = await pageThrough(
    (from, to) =>
      supabase
        .from("puzzle_rating_events")
        .select("username,attempted_at,puzzle_correct,user_rating_after,user_rd_after")
        .gte("attempted_at", start)
        .lt("attempted_at", end)
        .order("attempted_at", { ascending: true })
        .range(from, to),
    "monthly puzzle rankings",
  );
  const players = new Map<
    string,
    {
      username: string;
      rating: number;
      ratingDeviation: number;
      attempted: number;
      correct: number;
    }
  >();
  events.forEach((event) => {
    const username = String(event.username ?? "")
      .trim()
      .toLowerCase();
    if (!username) return;
    const row = players.get(username) ?? {
      username,
      rating: 2000,
      ratingDeviation: 350,
      attempted: 0,
      correct: 0,
    };
    row.attempted += 1;
    if (event.puzzle_correct) row.correct += 1;
    row.rating = Number(event.user_rating_after);
    row.ratingDeviation = Number(event.user_rd_after);
    players.set(username, row);
  });
  return [...players.values()];
};

const loadPuzzleRankingTrophies = async () => {
  const supabase = createServerSupabase("Puzzle ranking trophy service");
  const events = await pageThrough(
    (from, to) =>
      supabase
        .from("puzzle_rating_events")
        .select("username,attempted_at,puzzle_correct,user_rating_after,user_rd_after")
        .order("attempted_at", { ascending: true })
        .range(from, to),
    "puzzle ranking trophy history",
  );
  const months = new Map<
    string,
    Map<
      string,
      {
        username: string;
        rating: number;
        ratingDeviation: number;
        attempted: number;
        correct: number;
      }
    >
  >();

  events.forEach((event) => {
    const attemptedAt = new Date(String(event.attempted_at ?? ""));
    const username = String(event.username ?? "")
      .trim()
      .toLowerCase();
    if (Number.isNaN(attemptedAt.getTime()) || !username) return;
    const month = attemptedAt.toISOString().slice(0, 7);
    const players = months.get(month) ?? new Map();
    const row = players.get(username) ?? {
      username,
      rating: 2000,
      ratingDeviation: 350,
      attempted: 0,
      correct: 0,
    };
    row.attempted += 1;
    if (event.puzzle_correct) row.correct += 1;
    row.rating = Number(event.user_rating_after);
    row.ratingDeviation = Number(event.user_rd_after);
    players.set(username, row);
    months.set(month, players);
  });

  return [...months.entries()].flatMap(([month, players]) =>
    rankPuzzleLeaderboardMetrics([...players.values()], "monthly")
      .filter((row) => row.eligible && row.rank !== null && row.rank <= 10)
      .map((row) => ({ ...row, month })),
  );
};

export const puzzleRatingRoute = async (event: FunctionEvent) => {
  const input = parseJsonBody(event, ratingRequestSchema, "Invalid puzzle rating request.");
  if ("action" in input && input.action === "leaderboard") {
    return jsonResponse(200, {
      rows: await loadLeaderboardRows(input.period, input.month),
    });
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
          "username,puzzle_id,attempted_at,puzzle_correct,user_rating_before,user_rating_after,user_rd_before,user_rd_after",
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
