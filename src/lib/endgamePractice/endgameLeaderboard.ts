import { z } from "zod";

import { postApi } from "../api/postApi";
import type { EndgameCategory, EndgameMode } from "./endgamePractice";

const entrySchema = z.object({
  id: z.string(),
  player: z.string(),
  durationMs: z.number(),
  completedAt: z.string(),
});
const responseSchema = z.object({
  entries: z.array(entrySchema),
  ownBest: entrySchema.nullable(),
});
export type EndgameLeaderboardEntry = z.infer<typeof entrySchema>;

export const updateEndgameLeaderboard = (
  input: {
    action: "load" | "record";
    mode: EndgameMode;
    category: EndgameCategory;
    guestId: string;
    guestName: string;
    durationMs?: number;
  },
  signal?: AbortSignal,
) =>
  postApi("/api/endgame-practice", input, {
    errorMessage: "Unable to load endgame times.",
    invalidMessage: "The endgame leaderboard returned invalid data.",
    schema: responseSchema,
    ...(signal ? { signal } : {}),
  });
