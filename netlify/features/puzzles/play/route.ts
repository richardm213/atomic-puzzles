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

const puzzleIdSchema = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(z.string().regex(/^\d{1,20}$/));

const detailsBodySchema = z.object({
  puzzleIds: z.array(puzzleIdSchema).min(1).max(12),
});

const PUZZLE_SET_FIELDS = "id,event_name,event_date,players,source_id";
const PUZZLE_SET_RELATION = `puzzle_set:puzzle_sets!puzzles_puzzle_set_id_fkey(${PUZZLE_SET_FIELDS})`;
const PUZZLE_SET_MEMBERSHIP_RELATION = `puzzle_set_memberships(puzzle_set_id,puzzle_set:puzzle_sets(${PUZZLE_SET_FIELDS}))`;
const PUZZLE_RATING_RELATION =
  "rating_state:puzzle_ratings!puzzle_ratings_puzzle_id_fkey(rating,rating_deviation,attempts,successes,computed_level,human_level,human_rated_by,human_rated_at,updated_at)";
const DETAIL_COLUMNS =
  `id,fen,solution,author,created_at,players,puzzle_set_id,${PUZZLE_SET_RELATION},` +
  `${PUZZLE_SET_MEMBERSHIP_RELATION},white_player,black_player,explanation,tags,opa_style,` +
  PUZZLE_RATING_RELATION;

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
  requireUsername(identity, "Log in with Lichess to solve puzzles.");
  const puzzleIds = [...new Set(input.puzzleIds.map(Number))];

  // Authentication is enforced above. Log the request shape as an additional
  // signal for distinguishing genuine prefetches from account-based enumeration.
  console.info("Puzzle details request", {
    count: puzzleIds.length,
    sequential: isSequentialBatch(puzzleIds),
    requestId: event.headers?.["x-nf-request-id"] ?? event.headers?.["X-Nf-Request-Id"] ?? "",
  });

  const supabase = createServerSupabase("Puzzle play service");
  const { data, error } = await supabase.from("puzzles").select(DETAIL_COLUMNS).in("id", puzzleIds);
  if (error) throw new Error(`Unable to load puzzles: ${error.message}`);

  return identityResponse(identity, 200, { puzzles: Array.isArray(data) ? data : [] });
};
