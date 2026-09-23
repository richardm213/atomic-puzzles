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

const EXPLANATION_ADMIN = "seaside_tiramisu";
const updateExplanationSchema = z.object({
  puzzleId: z.number().int().positive(),
  explanation: z.string().trim().max(5_000),
});

const normalizeUsername = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase();

export const puzzleExplanationRoute = async (event: FunctionEvent) => {
  requireSameOrigin(event.headers, "Cross-site puzzle explanation changes are not allowed.");
  const input = parseJsonBody(event, updateExplanationSchema, "Invalid puzzle explanation.");
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Log in with Lichess to edit puzzle explanations.");
  const supabase = createServerSupabase("Puzzle explanation service");

  const { data: puzzle, error: lookupError } = await supabase
    .from("puzzles")
    .select("id,author")
    .eq("id", input.puzzleId)
    .single();
  if (lookupError || !puzzle) throw new HttpError(404, "Puzzle not found.");

  const normalizedUsername = normalizeUsername(username);
  const isAuthor = normalizedUsername === normalizeUsername(puzzle.author);
  if (!isAuthor && normalizedUsername !== EXPLANATION_ADMIN) {
    throw new HttpError(
      403,
      "Only the puzzle author or seaside_tiramisu can edit this explanation.",
    );
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("puzzle_progress")
    .select("puzzle_id")
    .eq("username", normalizedUsername)
    .eq("puzzle_id", String(input.puzzleId))
    .maybeSingle();
  if (attemptError) {
    throw new Error(`Unable to verify puzzle progress: ${attemptError.message}`);
  }
  if (!attempt) {
    throw new HttpError(403, "Attempt this puzzle before editing its explanation.");
  }

  const { data, error } = await supabase
    .from("puzzles")
    .update({ explanation: input.explanation })
    .eq("id", input.puzzleId)
    .select("id,explanation")
    .single();
  if (error) throw new Error(`Unable to update puzzle explanation: ${error.message}`);
  if (!data) throw new HttpError(404, "Puzzle not found.");

  return jsonResponse(200, {
    puzzleId: Number(data.id),
    explanation: String(data.explanation ?? "").trim(),
  });
};
