import { z } from "zod";

export const voteValueSchema = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
export type VoteValue = z.infer<typeof voteValueSchema>;
