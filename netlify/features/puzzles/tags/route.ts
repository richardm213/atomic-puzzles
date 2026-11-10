import { z } from "zod";

import { PUZZLE_ADMIN_USERNAME } from "../../../../shared/domain/puzzles/puzzleAdmin";
import {
  puzzleTagSchema,
  puzzleTagVoteSchema,
  puzzleTagVotesSchema,
  rewardedPuzzleTagVoteResponseSchema,
} from "../../../../shared/domain/puzzles/puzzleTagVotes";
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

const puzzleIdSchema = z.number().int().positive();
const voteSchema = z
  .object({
    puzzleId: puzzleIdSchema,
    tag: puzzleTagSchema,
    vote: puzzleTagVoteSchema,
  })
  .strict();

export const puzzleTagRoute = async (event: FunctionEvent) => {
  const isWrite = event.httpMethod === "POST";
  if (isWrite) requireSameOrigin(event.headers, "Cross-site puzzle tag votes are not allowed.");
  const input = isWrite ? parseJsonBody(event, voteSchema, "Invalid puzzle tag vote.") : null;
  const puzzleId = puzzleIdSchema.safeParse(
    input?.puzzleId ?? Number(event.queryStringParameters?.puzzleId),
  );
  if (!puzzleId.success) throw new HttpError(400, "Invalid puzzle ID.");
  const identity = await authenticateRequest(event.headers, !isWrite);
  const username = input
    ? requireUsername(identity, "Log in with Lichess to vote on puzzle tags.")
    : identity.username;
  const isAdmin = username === PUZZLE_ADMIN_USERNAME;
  const voter = isAdmin ? "admin" : username;
  const supabase = createServerSupabase("Puzzle tag voting service");
  const { data, error } = input
    ? await supabase.rpc(isAdmin ? "cast_puzzle_tag_vote" : "cast_rewarded_puzzle_tag_vote", {
        p_puzzle_id: puzzleId.data,
        p_voter: voter,
        p_tag: input.tag,
        p_vote: input.vote,
      })
    : await supabase.rpc("get_puzzle_tag_votes", {
        p_puzzle_id: puzzleId.data,
        p_voter: voter,
      });
  if (error?.code === "PT409" && input) {
    throw new HttpError(
      409,
      "Your puzzle attempt hasn’t been saved yet. Try voting again in a moment.",
    );
  }
  if (error) throw new Error(`Unable to read or update puzzle tag votes: ${error.message}`);
  if (data === null) throw new HttpError(404, "Puzzle not found.");
  return identityResponse(
    identity,
    200,
    input
      ? rewardedPuzzleTagVoteResponseSchema.parse(isAdmin ? { votes: data, coinAward: 0 } : data)
      : { votes: puzzleTagVotesSchema.parse(data) },
  );
};
