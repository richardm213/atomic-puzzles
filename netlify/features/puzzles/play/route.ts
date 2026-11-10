import { z } from "zod";

import {
  DAILY_PUZZLE_ATTEMPT_LIMIT,
  utcDayBounds,
} from "../../../../shared/domain/puzzles/dailyAttemptLimit";
import { puzzleContextFromGameHistory } from "../../../../shared/domain/puzzles/gameHistory";
import { PUZZLE_ADMIN_USERNAME } from "../../../../shared/domain/puzzles/puzzleAdmin";
import {
  authenticateRequest,
  identityResponse,
  requireSameOrigin,
  requireUsername,
} from "../../../platform/authentication";
import type { FunctionEvent } from "../../../platform/defineFunction";
import { createServerSupabase } from "../../../platform/environment";
import { HttpError } from "../../../platform/errors";
import { parseJsonBody } from "../../../platform/validation";

const puzzleIdSchema = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(z.string().regex(/^\d{1,20}$/));

const detailsBodySchema = z.object({
  puzzleIds: z.array(puzzleIdSchema).min(1).max(12),
  activePuzzleId: puzzleIdSchema.nullable().optional(),
  testMode: z.boolean().optional(),
});

const PUZZLE_SET_FIELDS = "id,event_name,event_date,players,source_id";
const PUZZLE_SET_RELATION = `puzzle_set:puzzle_sets!puzzles_puzzle_set_id_fkey(${PUZZLE_SET_FIELDS})`;
const PUZZLE_SET_MEMBERSHIP_RELATION = `puzzle_set_memberships(puzzle_set_id,puzzle_set:puzzle_sets(${PUZZLE_SET_FIELDS}))`;
const PUZZLE_RATING_RELATION =
  "rating_state:puzzle_ratings!puzzle_ratings_puzzle_id_fkey(rating,rating_deviation,attempts,successes,computed_level,human_level,human_rated_by,human_rated_at,updated_at)";
const DETAIL_COLUMNS =
  `id,fen,solution,author,created_at,players,puzzle_set_id,${PUZZLE_SET_RELATION},` +
  "game_moves,position_moves,game_initial_fen," +
  `${PUZZLE_SET_MEMBERSHIP_RELATION},white_player,black_player,explanation,tags,opa_style,` +
  PUZZLE_RATING_RELATION;

type PuzzleDetailRow = Parameters<typeof puzzleContextFromGameHistory>[0] & Record<string, unknown>;

const isSequentialBatch = (ids: number[]): boolean => {
  const sorted = [...ids].sort((left, right) => left - right);
  return (
    sorted.length > 1 && sorted.every((id, index) => index === 0 || id === sorted[index - 1]! + 1)
  );
};

export const puzzlePlayRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site puzzle requests are not allowed.");
  const input = parseJsonBody(event, detailsBodySchema, "Invalid puzzle details request.");
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Log in with Lichess to solve puzzles.");
  if (input.testMode && username !== PUZZLE_ADMIN_USERNAME) {
    throw new HttpError(403, "Puzzle testing is restricted.");
  }
  const puzzleIds = [...new Set(input.puzzleIds.map(Number))];
  // Older clients treated the first ID as active. Explicit null means prefetch only.
  const activePuzzleId =
    input.activePuzzleId === undefined
      ? puzzleIds[0]
      : input.activePuzzleId === null
        ? null
        : Number(input.activePuzzleId);
  if (activePuzzleId != null && !puzzleIds.includes(activePuzzleId)) {
    throw new HttpError(400, "The active puzzle must be part of the request.");
  }

  // Authentication is enforced above. Log the request shape as an additional
  // signal for distinguishing genuine prefetches from account-based enumeration.
  console.info("Puzzle details request", {
    count: puzzleIds.length,
    sequential: isSequentialBatch(puzzleIds),
    requestId: event.headers?.["x-nf-request-id"] ?? event.headers?.["X-Nf-Request-Id"] ?? "",
  });

  const supabase = createServerSupabase("Puzzle play service");
  let allowedPuzzleIds = puzzleIds;
  let blockedPuzzleIds: number[] = [];
  if (!input.testMode) {
    const { start, end } = utcDayBounds();
    const [dailyAttempts, exclusions] = await Promise.all([
      supabase
        .from("puzzle_progress")
        .select("puzzle_id", { count: "exact", head: true })
        .eq("username", username)
        .gte("first_attempt_at", start)
        .lt("first_attempt_at", end),
      supabase.rpc("get_locked_puzzle_ids", {
        p_username: username,
        p_puzzle_ids: puzzleIds.map(String),
      }),
    ]);
    const { count: dailyAttemptCount, error: dailyAttemptError } = dailyAttempts;
    if (dailyAttemptError) {
      throw new Error(`Unable to check daily puzzle attempts: ${dailyAttemptError.message}`);
    }
    if (exclusions.error) {
      throw new Error(`Unable to check puzzle access: ${exclusions.error.message}`);
    }
    const lockedPuzzles = (exclusions.data ?? []) as { puzzle_id: string; expires_at: string }[];
    const requestedLock = lockedPuzzles.find((row) => row.puzzle_id === String(activePuzzleId));
    if (requestedLock) {
      const until = new Date(requestedLock.expires_at).toLocaleString("en-US", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "UTC",
      });
      throw new HttpError(
        403,
        `This puzzle is locked for your account until ${until} UTC.`,
        {},
        "puzzle_rating_excluded",
      );
    }
    const lockedIds = new Set(lockedPuzzles.map((row) => row.puzzle_id));
    allowedPuzzleIds = puzzleIds.filter((id) => !lockedIds.has(String(id)));

    if ((dailyAttemptCount ?? 0) >= DAILY_PUZZLE_ATTEMPT_LIMIT) {
      const { data: attemptedRows, error: attemptedError } = await supabase
        .from("puzzle_progress")
        .select("puzzle_id")
        .eq("username", username)
        .in("puzzle_id", puzzleIds.map(String));
      if (attemptedError) {
        throw new Error(`Unable to check previous puzzle attempts: ${attemptedError.message}`);
      }

      const attemptedIds = new Set(
        (Array.isArray(attemptedRows) ? attemptedRows : []).map((row) => String(row.puzzle_id)),
      );
      allowedPuzzleIds = allowedPuzzleIds.filter((puzzleId) => attemptedIds.has(String(puzzleId)));
      blockedPuzzleIds = puzzleIds.filter((puzzleId) => !attemptedIds.has(String(puzzleId)));
    }
  }

  const { data, error } = allowedPuzzleIds.length
    ? await supabase
        .from("puzzles")
        .select(DETAIL_COLUMNS)
        .in("id", allowedPuzzleIds)
        .is("deleted_at", null)
    : { data: [], error: null };
  if (error) throw new Error(`Unable to load puzzles: ${error.message}`);
  const rows = (Array.isArray(data) ? data : []) as unknown as PuzzleDetailRow[];

  return identityResponse(identity, 200, {
    // Do not expose the source continuation: it can give away the solution.
    puzzles: rows.map(({ game_moves, position_moves, game_initial_fen, ...puzzle }) => ({
      ...puzzle,
      ...puzzleContextFromGameHistory({
        fen: puzzle.fen,
        game_moves,
        position_moves,
        game_initial_fen,
      }),
    })),
    blockedPuzzleIds,
    dailyLimitReached: blockedPuzzleIds.length > 0,
  });
};
