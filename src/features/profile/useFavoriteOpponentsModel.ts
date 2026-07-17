import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { type Mode, modeLabels, modeOptions } from "../../constants/matches";
import { usePersistedState } from "../../hooks/usePersistedState";
import { loadRawMatchesByMode, normalizeMatches } from "../../lib/matches/matchData";
import {
  compareFavoriteOpponentRows,
  type FavoriteOpponentMatch,
  favoriteOpponentPageSize,
  type FavoriteOpponentRow,
  type FavoriteOpponentSort,
  type FavoriteOpponentSortDirection,
  getFavoriteOpponentAllowedMatchLimit,
  getFavoriteOpponentDefaultSortDirection,
  getFavoriteOpponentRows,
  isFavoriteOpponentSort,
  type RankHistoryMode,
} from "./favoriteOpponents";

const preferenceKeys = {
  mode: "atomic-puzzles:profile-favorite-opponent-mode",
  matchLimit: "atomic-puzzles:profile-favorite-opponent-match-limit",
  sort: "atomic-puzzles:profile-favorite-opponent-sort",
  sortDirection: "atomic-puzzles:profile-favorite-opponent-sort-direction",
} as const;
const modeSchema = z.union([z.literal("all"), z.enum(modeOptions)]);
const matchLimitSchema = z.union([
  z.literal(250),
  z.literal(500),
  z.literal(1000),
  z.literal(1500),
  z.literal(2000),
  z.literal(5000),
]);
const sortSchema = z
  .string()
  .refine(isFavoriteOpponentSort)
  .transform((value): FavoriteOpponentSort => value);
const sortDirectionSchema = z.enum(["asc", "desc"]);

type FavoriteOpponentsModelOptions = {
  canonicalUsername: string;
  availableModes: Mode[];
  enabled: boolean;
  resetKey: string;
};

export const useFavoriteOpponentsModel = ({
  canonicalUsername,
  availableModes,
  enabled,
  resetKey,
}: FavoriteOpponentsModelOptions) => {
  const [rows, setRows] = useState<FavoriteOpponentRow[]>([]);
  const [mode, setMode] = usePersistedState<RankHistoryMode>(
    preferenceKeys.mode,
    modeSchema,
    "all",
  );
  const [matchLimit, setMatchLimit] = usePersistedState<number>(
    preferenceKeys.matchLimit,
    matchLimitSchema,
    500,
  );
  const [page, setPage] = useState(1);
  const [displayCount, setDisplayCount] = useState(25);
  const [sort, setSort] = usePersistedState<FavoriteOpponentSort>(
    preferenceKeys.sort,
    sortSchema,
    "matches",
  );
  const [sortDirection, setSortDirection] = usePersistedState<FavoriteOpponentSortDirection>(
    preferenceKeys.sortDirection,
    sortDirectionSchema,
    "desc",
  );
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [loadedQueryKey, setLoadedQueryKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);
  const queryKey = `${canonicalUsername}|${mode}|${matchLimit}`;

  useEffect(() => {
    requestIdRef.current += 1;
    setRows([]);
    setPage(1);
    setDisplayCount(25);
    setExpandedKeys([]);
    setLoadedQueryKey("");
    setLoading(false);
    setError("");
  }, [resetKey]);

  useEffect(() => {
    if (!availableModes.includes("wolfrandom") && mode === "wolfrandom") setMode("all");
  }, [availableModes, mode, setMode]);

  useEffect(() => {
    const allowedLimit = getFavoriteOpponentAllowedMatchLimit(mode, matchLimit);
    if (allowedLimit !== matchLimit) setMatchLimit(allowedLimit);
  }, [matchLimit, mode, setMatchLimit]);

  const load = useCallback(async (): Promise<void> => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const modesToLoad = mode === "all" ? availableModes : [mode];
      const matchesByMode = await Promise.all(
        modesToLoad.map(async (matchMode): Promise<FavoriteOpponentMatch[]> => {
          const matches: import("../../lib/matches/matchData").ParsedMatch[] = [];
          const maxPages = Math.ceil(matchLimit / favoriteOpponentPageSize);
          for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
            const result = await loadRawMatchesByMode(matchMode, {
              filters: { username: canonicalUsername },
              page: pageNumber,
              pageSize: favoriteOpponentPageSize,
            });
            matches.push(...result.matches);
            if (result.matches.length < favoriteOpponentPageSize) break;
          }
          return normalizeMatches(matches, canonicalUsername).map((match) => ({
            ...match,
            mode: matchMode,
          }));
        }),
      );
      if (requestId !== requestIdRef.current) return;
      const recentMatches = matchesByMode
        .flat()
        .sort((left, right) => right.startTs - left.startTs)
        .slice(0, matchLimit);
      setRows(getFavoriteOpponentRows(recentMatches));
      setPage(1);
      setExpandedKeys([]);
      setLoadedQueryKey(queryKey);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setRows([]);
      setLoadedQueryKey("");
      setError(String(loadError));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [availableModes, canonicalUsername, matchLimit, mode, queryKey]);

  useEffect(() => {
    if (!enabled || loadedQueryKey === queryKey || loading) return;
    void load();
  }, [enabled, load, loadedQueryKey, loading, queryKey]);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((left, right) =>
        compareFavoriteOpponentRows(left, right, sort, sortDirection),
      ),
    [rows, sort, sortDirection],
  );
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / Math.max(1, displayCount)));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = useMemo(() => {
    const pageStart = (currentPage - 1) * displayCount;
    return sortedRows.slice(pageStart, pageStart + displayCount);
  }, [currentPage, displayCount, sortedRows]);

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [currentPage, page]);

  const applySort = (
    nextSort: FavoriteOpponentSort,
    direction: FavoriteOpponentSortDirection = sort === nextSort
      ? sortDirection
      : getFavoriteOpponentDefaultSortDirection(nextSort),
  ): void => {
    setSort(nextSort);
    setSortDirection(direction);
    setPage(1);
  };

  const toggleOpponent = (key: string): void =>
    setExpandedKeys((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );

  return {
    rows,
    mode,
    matchLimit,
    page,
    displayCount,
    sort,
    sortDirection,
    expandedKeys,
    loading,
    error,
    visibleRows,
    currentPage,
    totalPages,
    scopeLabel: mode === "all" ? "matches overall" : `${modeLabels[mode] ?? mode} matches`,
    setMode,
    setMatchLimit,
    setPage,
    setDisplayCount,
    applySort,
    toggleOpponent,
  };
};
