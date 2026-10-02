import { z } from "zod";

import { evaluatePuzzleMoves } from "../../../../shared/domain/puzzles/serverEvaluation";
import { authenticateRequest, identityResponse, requireSameOrigin } from "../../../platform/authentication";
import type { FunctionEvent } from "../../../platform/defineFunction";
import { createServerSupabase } from "../../../platform/environment";
import { HttpError } from "../../../platform/errors";
import { parseJsonBody } from "../../../platform/validation";

const puzzleId = z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d{1,20}$/));
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("details"), puzzleIds: z.array(puzzleId).min(1).max(12) }),
  z.object({
    action: z.literal("evaluate"),
    puzzleId,
    moves: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/i)).min(1).max(100),
  }),
  z.object({ action: z.literal("reveal"), puzzleId }),
]);

const DETAIL_COLUMNS =
  "id,fen,author,players,puzzle_set_id,white_player,black_player,explanation,tags,opa_style," +
  "puzzle_set:puzzle_sets!puzzles_puzzle_set_id_fkey(id,event_name,event_date,players,source_id)," +
  "puzzle_set_memberships(puzzle_set_id,puzzle_set:puzzle_sets(id,event_name,event_date,players,source_id))," +
  "rating_state:puzzle_ratings!puzzle_ratings_puzzle_id_fkey(rating,rating_deviation,attempts,successes,computed_level,human_level,human_rated_by,human_rated_at,updated_at)";

export const puzzlePlayRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site puzzle requests are not allowed.");
  const input = parseJsonBody(event, bodySchema, "Invalid puzzle request.");
  const identity = await authenticateRequest(event.headers, true);
  const supabase = createServerSupabase("Puzzle play service");

  if (input.action === "details") {
    const ids = [...new Set(input.puzzleIds.map(Number))];
    const { data, error } = await supabase.from("puzzles").select(DETAIL_COLUMNS).in("id", ids);
    if (error) throw new Error(`Unable to load puzzles: ${error.message}`);
    const rows = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];
    const puzzles = rows.map(({ solution: _solution, ...row }) => row);
    return identityResponse(identity, 200, { puzzles });
  }

  const { data: puzzle, error } = await supabase
    .from("puzzles")
    .select("id,fen,solution")
    .eq("id", Number(input.puzzleId))
    .maybeSingle();
  if (error) throw new Error(`Unable to load puzzle: ${error.message}`);
  if (!puzzle?.fen || !puzzle?.solution) throw new HttpError(404, "Puzzle is unavailable.");

  if (input.action === "evaluate") {
    let result;
    try {
      result = evaluatePuzzleMoves(String(puzzle.fen), String(puzzle.solution), input.moves);
    } catch (evaluationError) {
      throw new HttpError(
        400,
        evaluationError instanceof Error ? evaluationError.message : "Invalid puzzle move.",
      );
    }
    const resolved = result.evaluation === "wrong" || result.solved;
    return identityResponse(identity, 200, {
      ...result,
      solution: resolved ? String(puzzle.solution) : null,
    });
  }

  if (!identity.username) throw new HttpError(401, "Attempt this puzzle before viewing its solution.");
  const { data: attempt, error: attemptError } = await supabase
    .from("puzzle_progress")
    .select("puzzle_id")
    .eq("username", identity.username)
    .eq("puzzle_id", Number(input.puzzleId))
    .maybeSingle();
  if (attemptError) throw new Error(`Unable to verify puzzle attempt: ${attemptError.message}`);
  if (!attempt) throw new HttpError(403, "Attempt this puzzle before viewing its solution.");
  return identityResponse(identity, 200, { solution: String(puzzle.solution) });
};
