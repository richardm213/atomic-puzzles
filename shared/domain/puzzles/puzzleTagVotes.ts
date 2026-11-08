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
  // A parent withdrawal can reverse several child rewards in the same transaction.
  coinAward: z.number().finite(),
  coinDelta: z.number().finite().optional(),
});

export type PuzzleTagVote = z.infer<typeof puzzleTagVoteSchema>;
export type PuzzleTagTally = z.infer<typeof puzzleTagVotesSchema>[number];

export const puzzleTagVoteEventSchema = z.object({
  id: z.number().int().positive(),
  tag: puzzleTagSchema,
  voter: z.string().min(1),
  direction: puzzleTagVoteSchema,
  occurred_at: z.string().nullable(),
  reviewed_at: z.string().nullable(),
});

export const puzzleTagVoteEventsPageSchema = z.object({
  events: z.array(puzzleTagVoteEventSchema),
  nextBeforeId: z.number().int().positive().nullable(),
});

export const puzzleTagVoteReviewSchema = z.object({ reviewedAt: z.string() });

export const getPuzzleTagStatus = ({ up, down }: PuzzleTagTally) => {
  const net = up - down;
  return net >= 3 ? "confirmed" : net > 0 ? "unconfirmed" : "hidden";
};
