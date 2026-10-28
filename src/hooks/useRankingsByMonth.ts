import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { RankingsByMode } from "../lib/rankings/rankingsByMonth";
import { rankingsForMonthQueryOptions } from "../lib/rankings/rankingsQueries";
import { getErrorMessage } from "../utils/errors";

export const useRankingsByMonth = (
  selectedMonth: string | null | undefined,
): {
  rankingsByMonth: Map<string, RankingsByMode>;
  error: string;
} => {
  const normalizedMonth = selectedMonth ?? "";
  const rankingsQuery = useQuery({
    ...rankingsForMonthQueryOptions(normalizedMonth),
    enabled: Boolean(normalizedMonth),
  });

  const rankingsByMonth = useMemo(() => {
    const rankings = new Map<string, RankingsByMode>();
    if (normalizedMonth && rankingsQuery.data) {
      rankings.set(normalizedMonth, rankingsQuery.data);
    }
    return rankings;
  }, [normalizedMonth, rankingsQuery.data]);

  const error = rankingsQuery.error
    ? getErrorMessage(rankingsQuery.error, "Failed to load leaderboard data")
    : "";

  return {
    rankingsByMonth,
    error,
  };
};
