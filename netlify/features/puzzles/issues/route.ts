import { z } from "zod";

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
import { PuzzleIssueRepository } from "./repository";

const REVIEWER = "seaside_tiramisu";
const categorySchema = z.enum(["missing_alternate_solution", "incorrect_solution", "other"]);
const issueBodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      puzzleId: z.number().int().positive(),
      category: categorySchema,
      details: z.string().trim().max(2_000).default(""),
    })
    .superRefine((input, context) => {
      if (input.category === "other" && !input.details) {
        context.addIssue({ code: "custom", path: ["details"], message: "Describe the issue." });
      }
    }),
  z.object({ action: z.literal("list") }),
  z.object({
    action: z.literal("setStatus"),
    id: z.number().int().positive(),
    status: z.enum(["open", "resolved", "dismissed"]),
  }),
]);

export const puzzleIssueRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site puzzle issue requests are not allowed.");
  const input = parseJsonBody(event, issueBodySchema, "Invalid puzzle issue request.");
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Log in with Lichess to report puzzle issues.");
  if (input.action !== "create" && username !== REVIEWER) {
    throw new HttpError(403, "Puzzle issue review is restricted.");
  }
  const repository = new PuzzleIssueRepository(createServerSupabase("Puzzle issue service"));

  if (input.action === "create") {
    if (!(await repository.hasAttemptedPuzzle(username, input.puzzleId))) {
      throw new HttpError(403, "Attempt this puzzle before reporting an issue.");
    }
    const issue = await repository.create({
      puzzleId: input.puzzleId,
      reporterUsername: username,
      category: input.category,
      details: input.details,
    });
    return identityResponse(identity, 201, { issue });
  }

  if (input.action === "list") {
    return identityResponse(identity, 200, { issues: await repository.list() });
  }
  return identityResponse(identity, 200, {
    issue: await repository.setStatus(input.id, input.status, username),
  });
};
