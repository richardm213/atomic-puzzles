import { queryOptions } from "@tanstack/react-query";

import { fetchArchiveJson } from "../archive/client";
import { loadRankingsForMonth } from "./rankingsByMonth";
import { loadRankingsForYear } from "./rankingsByYear";

const RANKINGS_STALE_TIME_MS = 5 * 60 * 1_000;

export const rankingQueryKeys = {
  all: ["rankings"] as const,
  month: (monthKey: string) => ["rankings", "month", monthKey] as const,
  year: (year: number) => ["rankings", "year", year] as const,
};

export const rankingsForMonthQueryOptions = (monthKey: string) =>
  queryOptions({
    queryKey: rankingQueryKeys.month(monthKey),
    queryFn: () => loadRankingsForMonth(monthKey),
    staleTime: RANKINGS_STALE_TIME_MS,
  });

export const rankingsForYearQueryOptions = (year: number) =>
  queryOptions({
    queryKey: rankingQueryKeys.year(year),
    queryFn: () => loadRankingsForYear(year),
    staleTime: RANKINGS_STALE_TIME_MS,
  });

export const latestRankingMatchQueryOptions = () =>
  queryOptions({
    queryKey: [...rankingQueryKeys.all, "latest-match"] as const,
    queryFn: () =>
      fetchArchiveJson<{ start_ts: number | null }>(
        new URLSearchParams({ resource: "latest_match" }),
      ),
    staleTime: RANKINGS_STALE_TIME_MS,
  });
