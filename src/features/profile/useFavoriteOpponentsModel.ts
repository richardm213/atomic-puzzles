import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type Mode, modeLabels } from "../../constants/matches";
import { loadRawMatchesByMode, normalizeMatches } from "../../lib/matches/matchData";
import {
  compareFavoriteOpponentRows,
  type FavoriteOpponentMatch,
  favoriteOpponentPageSize,
  type FavoriteOpponentRow,
  type FavoriteOpponentSort,
  type FavoriteOpponentSortDirection,
  getFavoriteOpponentDefaultSortDirection,
  getFavoriteOpponentRows,
  getStoredFavoriteOpponentMatchLimit,
  getStoredFavoriteOpponentMode,
  getStoredFavoriteOpponentSort,
  getStoredFavoriteOpponentSortDirection,
  type RankHistoryMode,
  setStoredFavoriteOpponentSort,
  setStoredFavoriteOpponentSortDirection,
} from "./favoriteOpponents";

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
  const [mode, setMode] = useState<RankHistoryMode>(getStoredFavoriteOpponentMode);
  const [matchLimit, setMatchLimit] = useState(() =>
    getStoredFavoriteOpponentMatchLimit(getStoredFavoriteOpponentMode()),
  );
  const [page, setPage] = useState(1);
  const [displayCount, setDisplayCount] = useState(25);
  const [sort, setSort] = useState<FavoriteOpponentSort>(getStoredFavoriteOpponentSort);
  const [sortDirection, setSortDirection] = useState<FavoriteOpponentSortDirection>(
    getStoredFavoriteOpponentSortDirection,
  );
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [loadedQueryKey, setLoadedQueryKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);
  const queryKey = `${canonicalUsername}|${mode}|${matchLimit}`;

  useEffect(() => {
    requestIdRef.current += 1;
    const storedMode = getStoredFavoriteOpponentMode();
    setRows([]);
    setMode(storedMode);
    setMatchLimit(getStoredFavoriteOpponentMatchLimit(storedMode));
    setPage(1);
    setDisplayCount(25);
    setSort(getStoredFavoriteOpponentSort());
    setSortDirection(getStoredFavoriteOpponentSortDirection());
    setExpandedKeys([]);
    setLoadedQueryKey("");
    setLoading(false);
    setError("");
  }, [resetKey]);

  useEffect(() => {
    if (!availableModes.includes("wolfrandom") && mode === "wolfrandom") setMode("all");
  }, [availableModes, mode]);

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
    setStoredFavoriteOpponentSort(nextSort);
    setStoredFavoriteOpponentSortDirection(direction);
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
