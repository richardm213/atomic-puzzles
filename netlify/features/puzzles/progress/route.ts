import { z } from "zod";

import {
  DAILY_PUZZLE_ATTEMPT_LIMIT_CODE,
  DAILY_PUZZLE_ATTEMPT_LIMIT_MESSAGE,
} from "../../../../shared/domain/puzzles/dailyAttemptLimit";
import { puzzleGradingStateSchema } from "../../../../shared/domain/puzzles/puzzleGrading";
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
  attempt: z
    .object({
      id: z.uuid(),
      pgn: z.string().trim().min(1).max(16000),
      recordProgress: z.boolean().optional(),
      runId: z.uuid().nullable().optional(),
      resigned: z.boolean().optional(),
    })
    .optional(),
});

const progressBodySchema = z.union([
  z.object({ action: z.literal("gradingState"), puzzleId: attemptBodySchema.shape.puzzleId }),
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
  duplicate: z.boolean().optional(),
  graded: z.boolean().optional(),
  grading: puzzleGradingStateSchema.optional(),
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
  if ("action" in input && input.action === "gradingState") {
    const { data, error } = await supabase.rpc("get_puzzle_grading_state", {
      p_username: username,
      p_puzzle_id: input.puzzleId,
    });
    if (error) throw new Error(`Unable to check grading eligibility: ${error.message}`);
    return identityResponse(identity, 200, puzzleGradingStateSchema.parse(data));
  }
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
  const progressArgs = {
    p_username: username,
    p_puzzle_id: input.puzzleId,
    p_attempt_duration_ms: input.attemptDurationMs,
    p_incorrect_move: input.puzzleCorrect ? null : input.incorrectMove || null,
    p_correct_move: input.puzzleCorrect ? input.correctMove || null : null,
  };
  const { data, error } = input.attempt
    ? await supabase.rpc("submit_puzzle_run_attempt", {
        ...progressArgs,
        p_attempt_id: input.attempt.id,
        p_attempt_pgn: input.attempt.pgn,
        p_run_id: input.attempt.runId ?? null,
        p_outcome: input.attempt.resigned
          ? "resigned"
          : input.puzzleCorrect
            ? "correct"
            : "incorrect",
      })
    : await supabase.rpc("record_puzzle_attempt_result", {
        ...progressArgs,
        p_puzzle_correct: input.puzzleCorrect,
      });
  if (error) {
    if (error.message.includes("puzzle_run_finished")) {
      throw new HttpError(
        409,
        "This run has ended. Reload the puzzle to start another.",
        {},
        "puzzle_run_finished",
      );
    }
    if (error.message.includes("puzzle_resignation_requires_move")) {
      throw new HttpError(409, "Submit a move before resigning.");
    }
    if (error.message.includes("puzzle_attempt_id_conflict")) {
      throw new HttpError(409, "This attempt identifier was already used.");
    }
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
