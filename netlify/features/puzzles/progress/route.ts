import { z } from "zod";

import {
  DAILY_PUZZLE_ATTEMPT_LIMIT_CODE,
  DAILY_PUZZLE_ATTEMPT_LIMIT_MESSAGE,
} from "../../../../shared/domain/puzzles/dailyAttemptLimit";
import { puzzleRatingEventResponseSchema } from "../../../../shared/domain/puzzles/puzzleRating";
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

const attemptBodySchema = z.object({
  puzzleId: z
    .union([z.string(), z.number()])
    .transform(String)
    .pipe(z.string().regex(/^\d{1,20}$/)),
  puzzleCorrect: z.boolean(),
  attemptDurationMs: z.number().int().nonnegative().max(3_600_000).nullable(),
  incorrectMove: z.string().trim().max(100).nullable().optional(),
  correctMove: z.string().trim().max(100).nullable().optional(),
});

const progressBodySchema = z.union([
  z.object({
    action: z.literal("markUnrated"),
    puzzleId: attemptBodySchema.shape.puzzleId,
    permanentlyUnrated: z.boolean().optional().default(true),
  }),
  z.object({
    action: z.literal("revisitOwnPuzzle"),
    puzzleId: attemptBodySchema.shape.puzzleId,
  }),
  attemptBodySchema,
]);

const attemptResultSchema = z.object({
  coinDelta: z.number(),
  rated: z.boolean(),
  unratedUntil: z.string().nullable(),
  ratingEvent: puzzleRatingEventResponseSchema.nullable(),
});

export const puzzleProgressRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site puzzle-progress requests are not allowed.");
  const input = parseJsonBody(event, progressBodySchema, "Invalid puzzle progress request.");
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Your Lichess login is no longer valid.");
  const supabase = createServerSupabase("Puzzle progress service");
  if ("action" in input && input.action === "revisitOwnPuzzle") {
    const { data, error } = await supabase.rpc("refresh_own_puzzle_cooldown", {
      p_username: username,
      p_puzzle_id: input.puzzleId,
    });
    if (error) throw new Error(`Unable to refresh puzzle cooldown: ${error.message}`);
    return identityResponse(identity, 200, { unratedUntil: data ?? null });
  }
  if ("action" in input) {
    const { error } = await supabase.rpc("set_own_puzzle_permanently_unrated", {
      p_username: username,
      p_puzzle_id: input.puzzleId,
      p_permanent: input.permanentlyUnrated,
    });
    if (error) {
      if (error.message.includes("puzzle_not_authored_by_user"))
        throw new HttpError(403, "You can only mark your own puzzles permanently unrated.");
      if (error.message.includes("puzzle_already_attempted"))
        throw new HttpError(409, "This choice is permanent after you attempt the puzzle.");
      if (error.message.includes("puzzle_already_rated"))
        throw new HttpError(409, "This puzzle already has a rated attempt.");
      throw new Error(`Unable to mark puzzle unrated: ${error.message}`);
    }
    return identityResponse(identity, 200, { permanentlyUnrated: input.permanentlyUnrated });
  }
  const { data, error } = await supabase.rpc("record_puzzle_attempt_result", {
    p_username: username,
    p_puzzle_id: input.puzzleId,
    p_puzzle_correct: input.puzzleCorrect,
    p_attempt_duration_ms: input.attemptDurationMs,
    p_incorrect_move: input.puzzleCorrect ? null : input.incorrectMove || null,
    p_correct_move: input.puzzleCorrect ? input.correctMove || null : null,
  });
  if (error) {
    if (error.message.includes("puzzle_rating_exclusion_active")) {
      throw new HttpError(
        403,
        "This puzzle is locked for your account until its unrated period ends.",
        {},
        "puzzle_rating_excluded",
      );
    }
    if (error.message.includes("daily_puzzle_attempt_limit_reached")) {
      throw new HttpError(
        429,
        DAILY_PUZZLE_ATTEMPT_LIMIT_MESSAGE,
        {},
        DAILY_PUZZLE_ATTEMPT_LIMIT_CODE,
      );
    }
    throw new Error(`Unable to record puzzle progress: ${error.message}`);
  }
  const result = attemptResultSchema.parse(data);
  return identityResponse(identity, 200, {
    recorded: true,
    ...result,
    // Keep older clients working while coinDelta is the authoritative value.
    coinAward: Math.max(0, result.coinDelta),
    username,
  });
};
