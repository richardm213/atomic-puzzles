import { z } from "zod";

import { postApi } from "../api/postApi";

const badgeStatsSchema = z.object({
  attempted: z.number(),
  correct: z.number(),
  created: z.number(),
  blitz: z.number(),
  bullet: z.number(),
  hyperbullet: z.number(),
});

const badgeDefinitionSchema = z.object({
  key: z.string(),
  category: z.enum(["attempted", "correct", "created", "blitz", "bullet", "hyperbullet"]),
  threshold: z.number(),
  name: z.string(),
  description: z.string(),
  tier: z.enum(["meteorite", "moon", "planet", "sun", "eclipse", "nova", "black_hole"]),
  tierName: z.string(),
  tierLevel: z.number(),
  iconKey: z.enum(["attempted", "correct", "created", "blitz", "bullet", "hyperbullet"]),
});

const badgeSummarySchema = z.object({
  username: z.string(),
  stats: badgeStatsSchema,
  tiers: z.array(
    z.object({
      key: z.enum(["meteorite", "moon", "planet", "sun", "eclipse", "nova", "black_hole"]),
      name: z.string(),
      rank: z.number(),
      description: z.string(),
    }),
  ),
  catalog: z.array(badgeDefinitionSchema),
  earned: z.array(
    z.object({
      badgeKey: z.string(),
      earnedAt: z.string(),
    }),
  ),
});

export type BadgeSummary = z.infer<typeof badgeSummarySchema>;

export const fetchBadgeSummary = (username: string): Promise<BadgeSummary> =>
  postApi(
    "/api/badges",
    { username },
    {
      schema: badgeSummarySchema,
      errorMessage: "Unable to load achievements.",
      invalidMessage: "The achievement service returned invalid data.",
    },
  );
