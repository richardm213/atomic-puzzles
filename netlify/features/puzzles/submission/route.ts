import { z } from "zod";

import { isPuzzleMotifTag } from "../../../../shared/domain/puzzles/puzzleMotifs";
import {
  authenticateRequest,
  requireSameOrigin,
  requireUsername,
} from "../../../platform/authentication";
import type { FunctionEvent } from "../../../platform/defineFunction";
import { createServerSupabase } from "../../../platform/environment";
import { jsonResponse } from "../../../platform/response";
import { parseJsonBody } from "../../../platform/validation";
import { loadMatchPuzzleContext } from "./matchContext";
import { PuzzleSubmissionRepository } from "./repository";
import { PuzzleSubmissionService } from "./service";

const singleSubmissionSchema = z.object({
  fen: z.string().trim().min(1).max(200),
  solution: z.string().trim().min(1).max(10_000),
  event: z.string().trim().max(200).default(""),
  whitePlayer: z.string().trim().max(200).default(""),
  blackPlayer: z.string().trim().max(200).default(""),
  explanation: z.string().trim().max(5_000),
  opaStyle: z.boolean().default(false),
  author: z.string().trim().max(200).default(""),
  tags: z
    .array(z.string())
    .max(30)
    .refine((tags) => tags.every(isPuzzleMotifTag), {
      message: "Unknown puzzle motif.",
    })
    .default([]),
});

const submissionBodySchema = z.union([
  z.object({ action: z.literal("match-context"), gameId: z.string().trim().min(1).max(128) }),
  singleSubmissionSchema.extend({
    action: z.literal("add-match-puzzle"),
    gameId: z.string().trim().min(1).max(128),
    matchName: z.string().trim().max(100).default(""),
    allowDifferentStartMove: z.boolean().optional(),
  }),
  singleSubmissionSchema.extend({
    action: z.never().optional(),
    allowDifferentStartMove: z.boolean().optional(),
  }),
  z.object({
    action: z.never().optional(),
    submissions: z.array(singleSubmissionSchema).min(1).max(100),
    allowDifferentStartMove: z.boolean().optional(),
  }),
]);

export const puzzleSubmissionRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site puzzle submissions are not allowed.");
  const input = parseJsonBody(event, submissionBodySchema, "Invalid puzzle submission.");
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Log in with Lichess to submit a puzzle.");
  const db = createServerSupabase("Puzzle submission service");
  const service = new PuzzleSubmissionService(new PuzzleSubmissionRepository(db));
  if (input.action) {
    const context = await loadMatchPuzzleContext(db, input.gameId);
    if (input.action === "match-context") {
      return jsonResponse(200, { setName: context.setName, players: context.players });
    }
    return jsonResponse(201, await service.submitMatchPuzzle(username, input, context));
  }
  return jsonResponse(
    201,
    "submissions" in input
      ? await service.submitBatch(
          username,
          input.submissions,
          input.allowDifferentStartMove ?? false,
        )
      : await service.submit(username, input, input.allowDifferentStartMove ?? false),
  );
};
