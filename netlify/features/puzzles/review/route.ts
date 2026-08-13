import { z } from "zod";

import {
  authenticateRequest,
  requireSameOrigin,
  requireUsername,
} from "../../../platform/authentication";
import { type FunctionEvent, jsonResponse } from "../../../platform/defineFunction";
import { createServerSupabase } from "../../../platform/environment";
import { HttpError } from "../../../platform/errors";
import { parseJsonBody } from "../../../platform/validation";
import { PuzzleReviewRepository } from "./repository";
import { PuzzleReviewService } from "./service";

const REVIEWER = "seaside_tiramisu";
const puzzleFieldsSchema = z.object({
  fen: z.string().trim().min(1).max(200),
  solution: z.string().trim().min(1).max(10_000),
  event: z.string().trim().max(200).default(""),
  explanation: z.string().trim().max(5_000),
  author: z.string().trim().min(1).max(200),
});
const reviewBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("reject"), id: z.number().int().positive() }),
  z.object({
    action: z.literal("approve"),
    id: z.number().int().positive(),
    puzzleId: z.number().int().positive(),
  }),
  puzzleFieldsSchema.extend({ action: z.literal("update"), id: z.number().int().positive() }),
]);

export const puzzleReviewRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site puzzle reviews are not allowed.");
  const input = parseJsonBody(event, reviewBodySchema, "Invalid review action.");
  if (input.action !== "list") {
    const identity = await authenticateRequest(event.headers);
    const username = requireUsername(identity, "Log in with Lichess to review puzzles.");
    if (username !== REVIEWER) throw new HttpError(403, "This review queue is restricted.");
  }
  const service = new PuzzleReviewService(
    () => new PuzzleReviewRepository(createServerSupabase("Puzzle review service")),
    REVIEWER,
  );
  return jsonResponse(200, await service.execute(input));
};
