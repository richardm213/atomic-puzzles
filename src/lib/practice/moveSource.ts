import { z } from "zod";

import {
  buildOpeningExplorerUrl,
  type ExplorerApiResponse,
  fetchExplorerApiResponse,
  mergeExplorerApiResponses,
} from "../../utils/openingExplorer";
import { apiRequest } from "../api/postApi";
import { atomicLegalMoveCount } from "../chess/pgn";
import {
  normalizePracticeEngineSettings,
  PRACTICE_SEARCH_LIMITS,
  type PracticeEngineSettings,
} from "./engineSettings";

export const DEFAULT_PRACTICE_MOVE_SETTINGS = {
  engine: normalizePracticeEngineSettings(null),
  opponentMode: "frequency" as const,
  playerContinuation: "engine" as const,
};

export const PRACTICE_AUTOMOVE_MIN_THINK_MS = 240;
const fetchGeneralPracticeExplorerResponse = (fen: string, signal: AbortSignal) =>
  fetchExplorerApiResponse(buildOpeningExplorerUrl({ fen, speeds: [0, 1] }), "practice", signal);

export const fetchPracticeExplorerResponse = async ({
  fen,
  opponentSource,
  opponentUsernames,
  opponentSide,
  playerContinuation,
  minGames,
  signal,
}: {
  fen: string;
  opponentSource: "general" | "player";
  opponentUsernames: string[];
  opponentSide: "white" | "black";
  playerContinuation: "general" | "engine";
  minGames: number;
  signal: AbortSignal;
}): Promise<{ response: ExplorerApiResponse }> => {
  if (opponentSource === "general") {
    return {
      response: await fetchGeneralPracticeExplorerResponse(fen, signal),
    };
  }

  const playerResponse = await Promise.all(
    opponentUsernames.map((opponentUsername) =>
      fetchExplorerApiResponse(
        buildOpeningExplorerUrl({
          fen,
          speeds: [0, 1],
          username: opponentUsername,
          color: opponentSide,
          minRating: 1700,
        }),
        "practice",
        signal,
      ),
    ),
  ).then(mergeExplorerApiResponses);

  if (
    playerContinuation === "general" &&
    playerResponse.moves.reduce((sum, move) => sum + move.games, 0) < minGames
  ) {
    return {
      response: await fetchGeneralPracticeExplorerResponse(fen, signal),
    };
  }

  return {
    response: playerResponse,
  };
};

export const practiceEngineSearchOptions = (
  fen: string,
  settings: PracticeEngineSettings,
  enabled: boolean,
) => ({
  enabled,
  debounceMs: 0,
  lineCount: Math.min(64, Math.max(1, atomicLegalMoveCount(fen))),
  plyCount: 5,
  fallbackToEngine: true,
  candidateLimit: 64,
  engineThinkTimeMs: settings.maxThinkTimeMs,
  engineMaxDepth: PRACTICE_SEARCH_LIMITS[settings.speed - 1]!.depth,
});

export const fetchRandomPracticePlayer = () =>
  apiRequest("/api/opening-explorer?randomPlayer=1", {
    errorMessage: "Could not select a random player",
    invalidMessage: "No random player is available",
    schema: z.object({ username: z.string().trim().min(1) }),
    headers: { "X-Explorer-Intent": "visible" },
  });
