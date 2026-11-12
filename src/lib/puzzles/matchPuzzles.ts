import { z } from "zod";

import type { PuzzlePositionHistory } from "../../../shared/domain/puzzles/puzzleSubmission";
import { createPostApi } from "../api/postApi";

const matchPuzzleRequest = createPostApi("/api/puzzles/submit", {
  errorMessage: "Unable to save the match puzzle.",
});

const matchContextSchema = z.object({
  setName: z.string(),
  players: z.tuple([z.string(), z.string()]),
});

const matchPuzzleResultSchema = z.discriminatedUnion("destination", [
  z.object({
    destination: z.literal("published"),
    puzzleId: z.number().int().positive(),
    setName: z.string(),
  }),
  z.object({ destination: z.literal("review"), setName: z.string() }),
]);

export type MatchPuzzleResult = z.infer<typeof matchPuzzleResultSchema>;

export const matchPuzzleContextKey = (matchId: string) =>
  ["match-puzzle-context", matchId] as const;

export const fetchMatchPuzzleContext = (gameId: string) =>
  matchPuzzleRequest(
    { action: "match-context", gameId },
    { errorMessage: "Unable to load the match set.", schema: matchContextSchema },
  );

export const addMatchPuzzle = (
  input: PuzzlePositionHistory & {
    gameId: string;
    fen: string;
    solution: string;
    opaStyle: boolean;
    explanation: string;
    tags: string[];
  },
) =>
  matchPuzzleRequest({ action: "add-match-puzzle", ...input }, { schema: matchPuzzleResultSchema });
