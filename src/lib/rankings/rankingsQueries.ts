import { queryOptions } from "@tanstack/react-query";

import { loadRankingsForMonth } from "./rankingsByMonth";

const RANKINGS_STALE_TIME_MS = 5 * 60 * 1_000;

export const rankingsForMonthQueryOptions = (monthKey: string) =>
  queryOptions({
    queryKey: ["rankings", "month", monthKey] as const,
    queryFn: () => loadRankingsForMonth(monthKey),
    staleTime: RANKINGS_STALE_TIME_MS,
  });
