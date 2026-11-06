import { z } from "zod";

import {
  authenticateRequest,
  requireSameOrigin,
  requireUsername,
} from "../../../platform/authentication";
import type { FunctionEvent } from "../../../platform/defineFunction";
import { createServerSupabase } from "../../../platform/environment";
import { HttpError } from "../../../platform/errors";
import { jsonResponse } from "../../../platform/response";
import { parseJsonBody } from "../../../platform/validation";
import { PuzzleAdminRepository } from "./repository";
import { PuzzleAdminService } from "./service";

const ADMIN = "seaside_tiramisu";
const puzzleId = z.number().int().positive();
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("get"),
    puzzleId: puzzleId.optional(),
    direction: z.enum(["latest", "exact", "older", "newer"]).default("latest"),
  }),
  z.object({
    action: z.literal("update"),
    puzzleId,
    fen: z.string().trim().min(1).max(200),
    solution: z.string().trim().min(1).max(10_000),
    author: z.string().trim().min(1).max(200),
    event: z.string().trim().max(200).default(""),
    whitePlayer: z.string().trim().max(200).default(""),
    blackPlayer: z.string().trim().max(200).default(""),
    explanation: z.string().trim().max(5_000).default(""),
    opaStyle: z.boolean().default(false),
    tags: z.array(z.string()).max(30).default([]),
  }),
  z.object({ action: z.literal("delete"), puzzleId }),
  z.object({ action: z.literal("restore"), puzzleId }),
]);

export const puzzleAdminRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site puzzle administration is not allowed.");
  const input = parseJsonBody(event, bodySchema, "Invalid puzzle administration request.");
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Log in with Lichess to administer puzzles.");
  if (username !== ADMIN) throw new HttpError(403, "This page is restricted.");

  const service = new PuzzleAdminService(
    new PuzzleAdminRepository(createServerSupabase("Puzzle administration service")),
    username,
  );
  return jsonResponse(200, await service.execute(input));
};
