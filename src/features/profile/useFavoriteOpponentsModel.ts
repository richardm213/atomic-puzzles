import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { type Mode, modeLabels, modeOptions } from "../../constants/matches";
import { usePersistedState } from "../../hooks/usePersistedState";
import {
  compareFavoriteOpponentRows,
  type FavoriteOpponentRow,
  type FavoriteOpponentSort,
  type FavoriteOpponentSortDirection,
  getFavoriteOpponentAllowedMatchLimit,
  getFavoriteOpponentDefaultSortDirection,
  isFavoriteOpponentSort,
  type RankHistoryMode,
} from "./favoriteOpponents";
import { favoriteOpponentsQueryOptions } from "./profileQueries";

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
const emptyFavoriteOpponentRows: FavoriteOpponentRow[] = [];

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

  useEffect(() => {
    setPage(1);
    setDisplayCount(25);
    setExpandedKeys([]);
  }, [resetKey]);

  useEffect(() => {
    if (!availableModes.includes("wolfrandom") && mode === "wolfrandom") setMode("all");
  }, [availableModes, mode, setMode]);

  useEffect(() => {
    const allowedLimit = getFavoriteOpponentAllowedMatchLimit(mode, matchLimit);
    if (allowedLimit !== matchLimit) setMatchLimit(allowedLimit);
  }, [matchLimit, mode, setMatchLimit]);

  const favoriteOpponentsQuery = useQuery({
    ...favoriteOpponentsQueryOptions(canonicalUsername, mode, matchLimit, availableModes),
    enabled: enabled && Boolean(canonicalUsername) && availableModes.length > 0,
  });
  const rows = favoriteOpponentsQuery.data ?? emptyFavoriteOpponentRows;
  const loading = favoriteOpponentsQuery.isFetching;
  const error = favoriteOpponentsQuery.error ? String(favoriteOpponentsQuery.error) : "";

  useEffect(() => {
    setPage(1);
    setExpandedKeys([]);
  }, [canonicalUsername, matchLimit, mode]);

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
