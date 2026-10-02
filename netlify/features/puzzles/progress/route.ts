import { z } from "zod";

import {
  authenticateRequest,
  identityResponse,
  requireSameOrigin,
  requireUsername,
} from "../../../platform/authentication";
import type { FunctionEvent } from "../../../platform/defineFunction";
import { createServerSupabase } from "../../../platform/environment";
import { parseJsonBody } from "../../../platform/validation";

const progressBodySchema = z.object({
  puzzleId: z
    .union([z.string(), z.number()])
    .transform(String)
    .pipe(z.string().regex(/^\d{1,20}$/)),
  puzzleCorrect: z.boolean(),
  attemptDurationMs: z.number().int().nonnegative().max(3_600_000).nullable(),
  incorrectMove: z.string().trim().max(100).nullable().optional(),
  correctMove: z.string().trim().max(100).nullable().optional(),
});

export const puzzleProgressRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site puzzle-progress requests are not allowed.");
  const input = parseJsonBody(event, progressBodySchema, "Invalid puzzle progress request.");
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Your Lichess login is no longer valid.");
  const supabase = createServerSupabase("Puzzle progress service");
  const { data: coinAward, error } = await supabase.rpc("record_first_puzzle_attempt_v2", {
    p_username: username,
    p_puzzle_id: input.puzzleId,
    p_puzzle_correct: input.puzzleCorrect,
    p_attempt_duration_ms: input.attemptDurationMs,
    p_incorrect_move: input.puzzleCorrect ? null : input.incorrectMove || null,
    p_correct_move: input.puzzleCorrect ? input.correctMove || null : null,
  });
  if (error) throw new Error(`Unable to record puzzle progress: ${error.message}`);
  const { data: ratingEvent } = await supabase
    .from("puzzle_rating_events")
    .select(
      "username,puzzle_id,attempted_at,puzzle_correct,user_rating_before,user_rating_after,user_rd_before,user_rd_after",
    )
    .eq("username", username)
    .eq("puzzle_id", Number(input.puzzleId))
    .maybeSingle();

  return identityResponse(identity, 200, {
    recorded: true,
    coinAward: Math.max(0, Number(coinAward) || 0),
    username,
    ratingEvent: ratingEvent
      ? {
          username: String(ratingEvent.username),
          puzzleId: String(ratingEvent.puzzle_id),
          attemptedAt: String(ratingEvent.attempted_at),
          puzzleCorrect: Boolean(ratingEvent.puzzle_correct),
          userRatingBefore: Number(ratingEvent.user_rating_before),
          userRatingAfter: Number(ratingEvent.user_rating_after),
          userRatingDeviationBefore: Number(ratingEvent.user_rd_before),
          userRatingDeviationAfter: Number(ratingEvent.user_rd_after),
        }
      : null,
  });
};
