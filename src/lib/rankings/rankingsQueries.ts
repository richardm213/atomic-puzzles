import { queryOptions } from "@tanstack/react-query";

import { loadRankingsForMonth } from "./rankingsByMonth";

const RANKINGS_STALE_TIME_MS = 5 * 60 * 1_000;

export const rankingQueryKeys = {
  all: ["rankings"] as const,
  month: (monthKey: string) => ["rankings", "month", monthKey] as const,
};

export const rankingsForMonthQueryOptions = (monthKey: string) =>
  queryOptions({
    queryKey: rankingQueryKeys.month(monthKey),
    queryFn: () => loadRankingsForMonth(monthKey),
    staleTime: RANKINGS_STALE_TIME_MS,
  });
