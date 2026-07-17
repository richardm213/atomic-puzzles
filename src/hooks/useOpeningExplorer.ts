import { useEffect, useRef, useState } from "react";

import type {
  OpeningDatabaseGame,
  OpeningDatabaseMove,
} from "../components/OpeningDatabaseDisplay/OpeningDatabaseDisplay";
import { toOpeningDatabaseGame, toOpeningDatabaseMove } from "../utils/openingDatabaseDisplay";
import type { ExplorerApiResponse } from "../utils/openingExplorer";

export type OpeningExplorerStatus = "idle" | "loading" | "ready" | "error";

export type OpeningExplorerRequest = {
  response: ExplorerApiResponse;
  usedGeneralFallback?: boolean;
};

type OpeningExplorerState = {
  moves: OpeningDatabaseMove[];
  recentGames: OpeningDatabaseGame[];
  response: ExplorerApiResponse | null;
  status: OpeningExplorerStatus;
  error: string;
  usedGeneralFallback: boolean;
};

type UseOpeningExplorerOptions = {
  enabled?: boolean;
  fen: string;
  playerColor: "white" | "black";
  showPerformance: boolean;
  request: () => Promise<OpeningExplorerRequest> | null;
  timeoutMs?: number;
  timeoutMessage?: string;
  errorMessage?: string;
};

const emptyState = (status: OpeningExplorerStatus): OpeningExplorerState => ({
  moves: [],
  recentGames: [],
  response: null,
  status,
  error: "",
  usedGeneralFallback: false,
});

export const useOpeningExplorer = ({
  enabled = true,
  fen,
  playerColor,
  showPerformance,
  request,
  timeoutMs = 15_000,
  timeoutMessage = "Opening explorer took too long to respond.",
  errorMessage = "Opening explorer failed",
}: UseOpeningExplorerOptions): OpeningExplorerState => {
  const requestIdRef = useRef(0);
  const [state, setState] = useState<OpeningExplorerState>(() => emptyState("idle"));

  useEffect(() => {
    if (!enabled) return;

    const requestId = ++requestIdRef.current;
    const pendingRequest = request();
    if (!pendingRequest) {
      setState(emptyState("ready"));
      return;
    }

    let timedOut = false;
    setState(emptyState("loading"));
    const timeout = window.setTimeout(() => {
      timedOut = true;
      if (requestId === requestIdRef.current) {
        setState({ ...emptyState("error"), error: timeoutMessage });
      }
    }, timeoutMs);

    void pendingRequest
      .then(({ response, usedGeneralFallback = false }) => {
        if (timedOut || requestId !== requestIdRef.current) return;
        setState({
          moves: response.moves.map((move) =>
            toOpeningDatabaseMove(move, fen, { showPerformance, playerColor }),
          ),
          recentGames: response.recentGames.map((game) => toOpeningDatabaseGame(game, fen)),
          response,
          status: "ready",
          error: "",
          usedGeneralFallback,
        });
      })
      .catch((error: unknown) => {
        if (timedOut || requestId !== requestIdRef.current) return;
        setState({
          ...emptyState("error"),
          error: error instanceof Error ? error.message : errorMessage,
        });
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      if (requestId === requestIdRef.current) requestIdRef.current += 1;
    };
  }, [
    enabled,
    errorMessage,
    fen,
    playerColor,
    request,
    showPerformance,
    timeoutMessage,
    timeoutMs,
  ]);

  return state;
};
