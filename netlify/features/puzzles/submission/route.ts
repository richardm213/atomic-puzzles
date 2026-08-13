import { z } from "zod";

import {
  authenticateRequest,
  requireSameOrigin,
  requireUsername,
} from "../../../platform/authentication";
import { type FunctionEvent, jsonResponse } from "../../../platform/defineFunction";
import { createServerSupabase } from "../../../platform/environment";
import { parseJsonBody } from "../../../platform/validation";
import { PuzzleSubmissionRepository } from "./repository";
import { PuzzleSubmissionService } from "./service";

const submissionBodySchema = z.object({
  fen: z.string().trim().min(1).max(200),
  solution: z.string().trim().min(1).max(10_000),
  event: z.string().trim().max(200).default(""),
  explanation: z.string().trim().max(5_000),
});

export const puzzleSubmissionRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site puzzle submissions are not allowed.");
  const input = parseJsonBody(event, submissionBodySchema, "Invalid puzzle submission.");
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Log in with Lichess to submit a puzzle.");
  const service = new PuzzleSubmissionService(
    new PuzzleSubmissionRepository(createServerSupabase("Puzzle submission service")),
  );
  return jsonResponse(201, await service.submit(username, input));
};
