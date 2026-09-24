import { useEffect, useRef, useState } from "react";

import type {
  OpeningDatabaseGame,
  OpeningDatabaseMove,
} from "../components/OpeningDatabaseDisplay/OpeningDatabaseDisplay";
import { toOpeningDatabaseGame, toOpeningDatabaseMove } from "../utils/openingDatabaseDisplay";
import type { ExplorerApiResponse, ExplorerRequestNavigation } from "../utils/openingExplorer";

export type OpeningExplorerStatus = "idle" | "loading" | "ready" | "error";

export type OpeningExplorerRequest = {
  response: ExplorerApiResponse;
};

type OpeningExplorerState = {
  moves: OpeningDatabaseMove[];
  recentGames: OpeningDatabaseGame[];
  response: ExplorerApiResponse | null;
  status: OpeningExplorerStatus;
  error: string;
};

type UseOpeningExplorerOptions = {
  enabled?: boolean;
  fen: string;
  playerColor: "white" | "black";
  showPerformance: boolean;
  request: (
    signal: AbortSignal,
    navigation: ExplorerRequestNavigation,
  ) => Promise<OpeningExplorerRequest> | null;
  // Must include the position and every request filter, not just the FEN.
  cacheKey?: string | undefined;
  debounceMs?: number;
  timeoutMs?: number;
  timeoutMessage?: string;
  errorMessage?: string;
};

const CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 128;

const emptyState = (status: OpeningExplorerStatus): OpeningExplorerState => ({
  moves: [],
  recentGames: [],
  response: null,
  status,
  error: "",
});

export const useOpeningExplorer = ({
  enabled = true,
  fen,
  playerColor,
  showPerformance,
  request,
  cacheKey,
  debounceMs = 0,
  timeoutMs = 15_000,
  timeoutMessage = "Opening explorer took too long to respond.",
  errorMessage = "Opening explorer failed",
}: UseOpeningExplorerOptions): OpeningExplorerState => {
  const cacheRef = useRef(new Map<string, { result: OpeningExplorerRequest; expiresAt: number }>());
  const lastChangeAtRef = useRef<number | null>(null);
  const navigationRef = useRef<ExplorerRequestNavigation | null>(null);
  const [state, setState] = useState<OpeningExplorerState>(() => emptyState("idle"));

  useEffect(() => {
    if (!enabled) {
      lastChangeAtRef.current = null;
      setState(emptyState("idle"));
      return;
    }

    const controller = new AbortController();
    let timeout: number | undefined;
    let scheduled: number | undefined;
    const now = Date.now();
    const rapidNavigation =
      lastChangeAtRef.current !== null && now - lastChangeAtRef.current < debounceMs;
    lastChangeAtRef.current = now;

    const showResult = ({ response }: OpeningExplorerRequest) => {
      setState({
        moves: response.moves.map((move) =>
          toOpeningDatabaseMove(move, fen, { showPerformance, playerColor }),
        ),
        recentGames: response.recentGames.map((game) => toOpeningDatabaseGame(game, fen)),
        response,
        status: "ready",
        error: "",
      });
    };

    const cached = cacheKey ? cacheRef.current.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > now) {
      // Refresh insertion order for bounded LRU eviction, not the expiry time.
      cacheRef.current.delete(cacheKey!);
      cacheRef.current.set(cacheKey!, cached);
      showResult(cached.result);
      return;
    }
    if (cacheKey) cacheRef.current.delete(cacheKey);
    setState(emptyState("loading"));

    const run = async () => {
      try {
        navigationRef.current ??= { session: crypto.randomUUID(), sequence: 0 };
        navigationRef.current.sequence += 1;
        const pendingRequest = request(controller.signal, { ...navigationRef.current });
        if (!pendingRequest) {
          setState(emptyState("ready"));
          return;
        }
        // The timeout starts when fetching, not during the navigation debounce.
        timeout = window.setTimeout(() => {
          controller.abort();
          setState({ ...emptyState("error"), error: timeoutMessage });
        }, timeoutMs);
        const result = await pendingRequest;
        // Also guard callbacks that ignore AbortSignal or resolve during cleanup.
        if (controller.signal.aborted) return;
        if (cacheKey) {
          cacheRef.current.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
          if (cacheRef.current.size > MAX_CACHE_ENTRIES) {
            const oldest = cacheRef.current.keys().next().value;
            if (oldest !== undefined) cacheRef.current.delete(oldest);
          }
        }
        showResult(result);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        setState({
          ...emptyState("error"),
          error: error instanceof Error ? error.message : errorMessage,
        });
      } finally {
        window.clearTimeout(timeout);
      }
    };

    // Leading + trailing debounce: isolated moves fetch immediately; a burst
    // fetches only its final position after a short pause. Never delay the board.
    if (rapidNavigation) scheduled = window.setTimeout(() => void run(), debounceMs);
    else void run();

    return () => {
      window.clearTimeout(scheduled);
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [
    cacheKey,
    debounceMs,
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
