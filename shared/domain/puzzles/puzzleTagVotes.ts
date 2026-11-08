import { z } from "zod";

import { isPuzzleMotifTag } from "./puzzleMotifs";

export const puzzleTagSchema = z.string().refine(isPuzzleMotifTag, "Unknown puzzle motif.");
export const puzzleTagVoteSchema = z.union([z.literal(-1), z.literal(0), z.literal(1)]);

export const puzzleTagVotesSchema = z.array(
  z.object({
    tag: puzzleTagSchema,
    up: z.number().int().nonnegative(),
    down: z.number().int().nonnegative(),
    vote: puzzleTagVoteSchema,
  }),
);
export const puzzleTagVoteResponseSchema = z.object({
  votes: puzzleTagVotesSchema,
});

export const rewardedPuzzleTagVoteResponseSchema = puzzleTagVoteResponseSchema.extend({
  coinAward: z.union([z.literal(0), z.literal(0.1), z.literal(0.25)]),
});

export type PuzzleTagVote = z.infer<typeof puzzleTagVoteSchema>;
export type PuzzleTagTally = z.infer<typeof puzzleTagVotesSchema>[number];

export const getPuzzleTagStatus = ({ up, down }: PuzzleTagTally) => {
  const net = up - down;
  return net >= 3 ? "confirmed" : net > 0 ? "unconfirmed" : "hidden";
};
