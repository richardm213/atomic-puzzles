import { queryOptions } from "@tanstack/react-query";

import {
  fetchCoinRankings,
  fetchCoinSummary,
  fetchCoinTransactions,
  fetchRedemptionHistory,
} from "./coins";

export const coinQueryKeys = {
  rankings: ["coins", "rankings"] as const,
  transactions: (reasons: string[], page: number) =>
    ["coins", "transactions", page, ...reasons] as const,
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
  page: number,
) =>
  queryOptions({
    queryKey: coinQueryKeys.transactions(reasons ?? [], page),
    queryFn: () => fetchCoinTransactions(reasons, page),
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
