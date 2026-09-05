import { queryOptions } from "@tanstack/react-query";

import { type Mode, modeOptions } from "../../constants/matches";
import type { MatchFilters } from "../archive/matches";
import { fetchPlayerRatingsRows } from "../archive/ratings";
import { resolveUsernameInputs } from "../users/usernameSearch";
import { loadRawMatchesByMode } from "./data";
import { getTournamentMatchLocation } from "./tournaments";

const MATCH_STALE_TIME_MS = 5 * 60 * 1_000;

export const matchQueryKeys = {
  all: ["matches"] as const,
  detail: (mode: Mode | "", matchId: string) => ["matches", "detail", mode, matchId] as const,
  recent: (mode: Mode, filters: MatchFilters, page: number, pageSize: number) =>
    ["matches", "recent", mode, filters, page, pageSize] as const,
  h2h: (player1: string, player2: string) => ["matches", "h2h", player1, player2] as const,
};

export const matchDetailQueryOptions = (mode: Mode | "", matchId: string) =>
  queryOptions({
    queryKey: matchQueryKeys.detail(mode, matchId),
    queryFn: async () => {
      if (!mode || !matchId) throw new Error("Invalid match key.");
      const [matches, tournamentLocation] = await Promise.all([
        loadRawMatchesByMode(mode, { filters: { matchId } }),
        getTournamentMatchLocation(matchId).catch(() => null),
      ]);
      const match = matches[0];
      if (!match) throw new Error("Match not found.");
      return { match, tournamentLocation };
    },
    staleTime: 10 * 60 * 1_000,
  });

export const recentMatchesPageQueryOptions = (
  mode: Mode,
  filters: MatchFilters,
  page: number,
  pageSize: number,
) =>
  queryOptions({
    queryKey: matchQueryKeys.recent(mode, filters, page, pageSize),
    queryFn: () => loadRawMatchesByMode(mode, { filters, page, pageSize }),
    staleTime: 30_000,
  });

export const h2hMatchupQueryOptions = (player1: string, player2: string) =>
  queryOptions({
    queryKey: matchQueryKeys.h2h(player1, player2),
    queryFn: async () => {
      const [resolvedPlayer1 = "", resolvedPlayer2 = ""] = await resolveUsernameInputs([
        player1,
        player2,
      ]);
      const [matchesByMode, player1Ratings, player2Ratings] = await Promise.all([
        Promise.all(
          modeOptions.map((mode) =>
            loadRawMatchesByMode(mode, {
              filters: { usernamePair: [resolvedPlayer1, resolvedPlayer2] },
            }),
          ),
        ),
        fetchPlayerRatingsRows({ username: resolvedPlayer1 }),
        fetchPlayerRatingsRows({ username: resolvedPlayer2 }),
      ]);
      return {
        matchesByMode,
        player1Ratings,
        player2Ratings,
        resolvedPlayer1,
        resolvedPlayer2,
      };
    },
    staleTime: MATCH_STALE_TIME_MS,
  });
