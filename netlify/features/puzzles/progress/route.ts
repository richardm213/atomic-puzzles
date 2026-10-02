import { z } from "zod";

import { evaluatePuzzleMoves } from "../../../../shared/domain/puzzles/serverEvaluation";
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

const progressBodySchema = z.object({
  puzzleId: z
    .union([z.string(), z.number()])
    .transform(String)
    .pipe(z.string().regex(/^\d{1,20}$/)),
  moves: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/i)).min(1).max(100),
});

export const puzzleProgressRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site puzzle-progress requests are not allowed.");
  const input = parseJsonBody(event, progressBodySchema, "Invalid puzzle progress request.");
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Your Lichess login is no longer valid.");
  const supabase = createServerSupabase("Puzzle progress service");
  const { data: puzzle, error: puzzleError } = await supabase
    .from("puzzles")
    .select("fen,solution")
    .eq("id", Number(input.puzzleId))
    .maybeSingle();
  if (puzzleError) throw new Error(`Unable to verify puzzle: ${puzzleError.message}`);
  if (!puzzle?.fen || !puzzle?.solution) throw new Error("Unable to verify puzzle solution.");
  let evaluation;
  try {
    evaluation = evaluatePuzzleMoves(String(puzzle.fen), String(puzzle.solution), input.moves);
  } catch (evaluationError) {
    throw new HttpError(
      400,
      evaluationError instanceof Error ? evaluationError.message : "Invalid puzzle move history.",
    );
  }
  if (evaluation.evaluation === "retry") {
    throw new HttpError(400, "A retry move is not a completed puzzle attempt.");
  }
  const puzzleCorrect = evaluation.evaluation === "accepted" && evaluation.solved;
  const { data: coinAward, error } = await supabase.rpc("record_first_puzzle_attempt_v2", {
    p_username: username,
    p_puzzle_id: input.puzzleId,
    p_puzzle_correct: puzzleCorrect,
    p_incorrect_move: puzzleCorrect ? null : evaluation.moveLabel,
    p_correct_move: puzzleCorrect ? evaluation.moveLabel : null,
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
