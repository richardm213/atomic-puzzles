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
import { PuzzleProgressRepository } from "./repository";
import { PuzzleProgressService } from "./service";

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
  const service = new PuzzleProgressService(
    new PuzzleProgressRepository(createServerSupabase("Puzzle progress service")),
  );
  return identityResponse(
    identity,
    200,
    await service.record(username, {
      puzzleId: input.puzzleId,
      puzzleCorrect: input.puzzleCorrect,
      incorrectMove: input.incorrectMove || null,
      correctMove: input.correctMove || null,
    }),
  );
};
