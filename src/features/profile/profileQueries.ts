import { queryOptions } from "@tanstack/react-query";

import type { Mode } from "../../constants/matches";
import {
  loadRawMatchesByMode,
  normalizeMatches,
  type PaginatedMatches,
  type ParsedMatch,
} from "../../lib/matches/matchData";
import {
  type FavoriteOpponentMatch,
  favoriteOpponentPageSize,
  getFavoriteOpponentRows,
} from "./favoriteOpponents";
import type { ProfileFilters } from "./profileFilters";
import { buildMatchFilters, isClientSidePagedSearch } from "./profileFilters";

export const profileQueryKeys = {
  all: ["profile"] as const,
  monthRanks: (username: string) => ["profile", username, "month-ranks"] as const,
  monthRankPlayerCounts: (pairs: Array<{ month: string; mode: Mode }>) =>
    ["profile", "month-rank-player-counts", pairs] as const,
  ratingsSnapshot: (username: string) => ["profile", username, "ratings-snapshot"] as const,
  matchHistory: (
    username: string,
    mode: Mode,
    filters: ProfileFilters,
    page: number,
    pageSize: number,
  ) => ["profile", username, "match-history", mode, filters, page, pageSize] as const,
  favoriteOpponents: (
    username: string,
    mode: Mode | "all",
    matchLimit: number,
    availableModes: Mode[],
  ) => ["profile", username, "favorite-opponents", mode, matchLimit, availableModes] as const,
};

export const uniqueMonthRankPairs = <T extends { monthValue: string; mode: Mode }>(
  monthRanks: T[],
): Array<{ month: string; mode: Mode }> => [
  ...new Map(
    monthRanks.map((monthRank) => [
      `${monthRank.monthValue}|${monthRank.mode}`,
      { month: monthRank.monthValue, mode: monthRank.mode },
    ]),
  ).values(),
];

export const profileMatchHistoryQueryOptions = (
  username: string,
  mode: Mode,
  filters: ProfileFilters,
  page: number,
  pageSize: number,
) =>
  queryOptions({
    queryKey: profileQueryKeys.matchHistory(username, mode, filters, page, pageSize),
    queryFn: async () => {
      const matchFilters = buildMatchFilters(username, filters);
      const useClientPaging = isClientSidePagedSearch(filters);
      let rawMatches: ParsedMatch[];
      let total: number;
      if (useClientPaging) {
        rawMatches = await loadRawMatchesByMode(mode, { filters: matchFilters });
        total = rawMatches.length;
      } else {
        const result: PaginatedMatches = await loadRawMatchesByMode(mode, {
          filters: matchFilters,
          page,
          pageSize,
        });
        rawMatches = result.matches;
        total = result.total;
      }
      const matches = normalizeMatches(rawMatches, username);
      return { matches, total: useClientPaging ? matches.length : total };
    },
    staleTime: 5 * 60 * 1_000,
  });

export const favoriteOpponentsQueryOptions = (
  username: string,
  mode: Mode | "all",
  matchLimit: number,
  availableModes: Mode[],
) =>
  queryOptions({
    queryKey: profileQueryKeys.favoriteOpponents(username, mode, matchLimit, availableModes),
    queryFn: async () => {
      const modesToLoad = mode === "all" ? availableModes : [mode];
      const matchesByMode = await Promise.all(
        modesToLoad.map(async (matchMode): Promise<FavoriteOpponentMatch[]> => {
          const matches: ParsedMatch[] = [];
          const maxPages = Math.ceil(matchLimit / favoriteOpponentPageSize);
          for (let page = 1; page <= maxPages; page += 1) {
            const result = await loadRawMatchesByMode(matchMode, {
              filters: { username },
              page,
              pageSize: favoriteOpponentPageSize,
            });
            matches.push(...result.matches);
            if (result.matches.length < favoriteOpponentPageSize) break;
          }
          return normalizeMatches(matches, username).map((match) => ({ ...match, mode: matchMode }));
        }),
      );
      return getFavoriteOpponentRows(
        matchesByMode
          .flat()
          .sort((left, right) => right.startTs - left.startTs)
          .slice(0, matchLimit),
      );
    },
    staleTime: 5 * 60 * 1_000,
  });
