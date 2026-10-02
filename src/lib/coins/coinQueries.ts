import { queryOptions } from "@tanstack/react-query";

import {
  fetchCoinRankings,
  fetchCoinSummary,
  fetchCoinTransactions,
  fetchRedemptionHistory,
} from "./coins";

export const coinQueryKeys = {
  rankings: ["coins", "rankings"] as const,
  transactions: (reasons: string[]) => ["coins", "transactions", ...reasons] as const,
  summary: (username: string) => ["coins", "summary", username] as const,
  redemptionHistory: (username: string) => ["coins", "redemption-history", username] as const,
};

export const coinRankingsQueryOptions = () =>
  queryOptions({
    queryKey: coinQueryKeys.rankings,
    queryFn: fetchCoinRankings,
    staleTime: 30_000,
  });

export const coinTransactionsQueryOptions = (
  reasons: Parameters<typeof fetchCoinTransactions>[0],
) =>
  queryOptions({
    queryKey: coinQueryKeys.transactions(reasons ?? []),
    queryFn: () => fetchCoinTransactions(reasons),
    staleTime: 30_000,
  });

export const coinSummaryQueryOptions = (username: string) =>
  queryOptions({
    queryKey: coinQueryKeys.summary(username),
    queryFn: fetchCoinSummary,
    staleTime: 15_000,
  });

export const redemptionHistoryQueryOptions = (username: string) =>
  queryOptions({
    queryKey: coinQueryKeys.redemptionHistory(username),
    queryFn: fetchRedemptionHistory,
    staleTime: 15_000,
  });
