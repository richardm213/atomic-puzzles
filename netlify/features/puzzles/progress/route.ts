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
  incorrectMove: z.string().trim().max(100).nullable().optional(),
  correctMove: z.string().trim().max(100).nullable().optional(),
});

export const puzzleProgressRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site puzzle-progress requests are not allowed.");
  const input = parseJsonBody(event, progressBodySchema, "Invalid puzzle progress request.");
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Your Lichess login is no longer valid.");
  const { error } = await createServerSupabase("Puzzle progress service").rpc(
    "record_first_puzzle_attempt_v2",
    {
      p_username: username,
      p_puzzle_id: input.puzzleId,
      p_puzzle_correct: input.puzzleCorrect,
      p_incorrect_move: input.puzzleCorrect ? null : input.incorrectMove || null,
      p_correct_move: input.puzzleCorrect ? input.correctMove || null : null,
    },
  );
  if (error) throw new Error(`Unable to record puzzle progress: ${error.message}`);
  return identityResponse(identity, 200, { recorded: true, username });
};
