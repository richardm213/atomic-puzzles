import { appAssetPath } from "./appAssetPath";

export type ExplorerApiMove = {
  uci: string;
  games: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  avgOpponentRating: number | null;
};

export type ExplorerApiGame = {
  uci: string;
  gameId: string;
  playedAt: number;
  playedOn: number;
  white: string | null;
  black: string | null;
  whiteRating: number | null;
  blackRating: number | null;
  winner: 0 | 1 | 2;
};

export type ExplorerApiPositionLeader = {
  username: string;
  games: number;
};

export type ExplorerApiPositionLeaders = {
  lastMoveColor: 0 | 1;
  totalGames: number;
  leaders: ExplorerApiPositionLeader[];
};

export type ExplorerApiResponse = {
  positionLeaders?: ExplorerApiPositionLeaders | null;
  moves: ExplorerApiMove[];
  recentGames: ExplorerApiGame[];
};

export type OpeningExplorerUrlOptions = {
  part?: "moves" | "leaders";
  fen: string;
  speeds: readonly number[];
  startDate?: string;
  endDate?: string;
  username?: string;
  color?: "white" | "black";
  minRating?: number;
  opponent?: string;
};

export const buildOpeningExplorerUrl = ({
  part,
  fen,
  speeds,
  startDate = "",
  endDate = "",
  username = "",
  color,
  minRating,
  opponent = "",
}: OpeningExplorerUrlOptions): string => {
  const params = new URLSearchParams({ fen, speeds: speeds.join(",") });
  if (part) params.set("part", part);
  if (/^\d{4}-\d{2}$/.test(startDate)) params.set("startDate", startDate);
  if (/^\d{4}-\d{2}$/.test(endDate)) params.set("endDate", endDate);

  const player = username.trim();
  if (player) {
    params.set("username", player);
    if (color) params.set("color", color);
    if (Number.isFinite(minRating)) params.set("minRating", String(minRating));
    if (opponent.trim()) params.set("opponent", opponent.trim());
  }

  return `${appAssetPath("/api/opening-explorer")}?${params.toString()}`;
};

const inFlightExplorerRequests = new Map<string, Promise<ExplorerApiResponse>>();

const parseExplorerApiResponse = async (
  response: Response,
  explorerApiUrl: string,
): Promise<ExplorerApiResponse> => {
  const text = await response.text();
  let body: unknown = null;

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    const returnedHtml = text.trimStart().startsWith("<!doctype") || text.includes("<html");
    throw new Error(
      returnedHtml
        ? `Opening explorer API returned the app page from ${window.location.origin}${explorerApiUrl}. Hard-refresh the page.`
        : `Opening explorer returned invalid JSON from ${explorerApiUrl}.`,
    );
  }

  if (!response.ok) {
    const errorBody = body as { error?: string } | null;
    throw new Error(errorBody?.error ?? "Opening explorer is unavailable");
  }

  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray((body as Partial<ExplorerApiResponse>).moves)
  ) {
    throw new Error("Opening explorer returned an unexpected response.");
  }

  return {
    ...(body as ExplorerApiResponse),
    recentGames: Array.isArray((body as Partial<ExplorerApiResponse>).recentGames)
      ? (body as ExplorerApiResponse).recentGames
      : [],
  };
};

export type ExplorerRequestNavigation = { session: string; sequence: number };

export const fetchExplorerApiResponse = (
  explorerApiUrl: string,
  intent: "practice" | "visible",
  signal?: AbortSignal,
  navigation?: ExplorerRequestNavigation,
): Promise<ExplorerApiResponse> => {
  // Cancellable requests belong to their caller: never share their lifetime with
  // another consumer (including a remount after React StrictMode cleanup).
  if (signal) {
    return fetch(explorerApiUrl, {
      headers: {
        "X-Explorer-Intent": intent,
        ...(navigation
          ? {
              "X-Explorer-Session": navigation.session,
              "X-Explorer-Sequence": String(navigation.sequence),
            }
          : {}),
      },
      signal,
    }).then((response) => parseExplorerApiResponse(response, explorerApiUrl));
  }
  const cacheKey = `${intent}:${explorerApiUrl}`;
  const existingRequest = inFlightExplorerRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const promise = fetch(explorerApiUrl, {
    headers: {
      "X-Explorer-Intent": intent,
    },
  })
    .then((response) => parseExplorerApiResponse(response, explorerApiUrl))
    .finally(() => {
      if (inFlightExplorerRequests.get(cacheKey) === promise) {
        inFlightExplorerRequests.delete(cacheKey);
      }
    });

  inFlightExplorerRequests.set(cacheKey, promise);
  return promise;
};

export const mergeExplorerApiResponses = (
  responses: ExplorerApiResponse[],
): ExplorerApiResponse => {
  const movesByUci = new Map<
    string,
    ExplorerApiMove & {
      avgOpponentRatingGames: number;
      avgOpponentRatingTotal: number;
    }
  >();

  for (const response of responses) {
    for (const move of response.moves) {
      const current = movesByUci.get(move.uci) ?? {
        uci: move.uci,
        games: 0,
        whiteWins: 0,
        draws: 0,
        blackWins: 0,
        avgOpponentRating: null,
        avgOpponentRatingGames: 0,
        avgOpponentRatingTotal: 0,
      };

      current.games += move.games;
      current.whiteWins += move.whiteWins;
      current.draws += move.draws;
      current.blackWins += move.blackWins;

      if (move.avgOpponentRating !== null && move.games > 0) {
        current.avgOpponentRatingGames += move.games;
        current.avgOpponentRatingTotal += move.avgOpponentRating * move.games;
      }

      movesByUci.set(move.uci, current);
    }
  }

  return {
    moves: Array.from(movesByUci.values())
      .map(({ avgOpponentRatingGames, avgOpponentRatingTotal, ...move }) => ({
        ...move,
        avgOpponentRating:
          avgOpponentRatingGames > 0
            ? Math.round(avgOpponentRatingTotal / avgOpponentRatingGames)
            : null,
      }))
      .sort((a, b) => b.games - a.games),
    recentGames: responses.flatMap((response) => response.recentGames),
  };
};
