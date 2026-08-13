import { z } from "zod";

import {
  isPuzzleMotifTag,
  normalizePuzzleMotifTags,
} from "../../../../shared/domain/puzzles/puzzleMotifs";
import {
  authenticateRequest,
  requireSameOrigin,
  requireUsername,
} from "../../../platform/authentication";
import { type FunctionEvent, jsonResponse } from "../../../platform/defineFunction";
import { createServerSupabase } from "../../../platform/environment";
import { HttpError } from "../../../platform/errors";
import { parseJsonBody } from "../../../platform/validation";

const TAG_EDITOR = "seaside_tiramisu";
const updateTagsSchema = z
  .object({ puzzleId: z.number().int().positive(), tags: z.array(z.string()) })
  .refine(({ tags }) => tags.every(isPuzzleMotifTag), { message: "Unknown puzzle motif." })
  .refine(({ tags }) => new Set(tags).size === tags.length, {
    message: "Puzzle motifs must be unique.",
  });

export const puzzleTagRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site puzzle tag changes are not allowed.");
  const input = parseJsonBody(event, updateTagsSchema, "Invalid puzzle motifs.");
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Log in with Lichess to edit puzzle motifs.");
  if (username !== TAG_EDITOR) {
    throw new HttpError(403, "Only seaside_tiramisu can edit puzzle motifs.");
  }
  const tags = normalizePuzzleMotifTags(input.tags);
  const { data, error } = await createServerSupabase("Puzzle motif service")
    .from("puzzles")
    .update({ tags })
    .eq("id", input.puzzleId)
    .select("id,tags")
    .single();
  if (error) throw new Error(`Unable to update puzzle motifs: ${error.message}`);
  if (!data) throw new HttpError(404, "Puzzle not found.");
  return jsonResponse(200, {
    puzzleId: Number(data.id),
    tags: normalizePuzzleMotifTags(data.tags),
  });
};
