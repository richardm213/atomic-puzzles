import { type QueryClient, queryOptions } from "@tanstack/react-query";

import {
  type CoinSummary,
  fetchCoinRankings,
  fetchCoinSummary,
  fetchCoinTransactions,
  fetchRedemptionHistory,
} from "./coins";

export const coinQueryKeys = {
  rankings: ["coins", "rankings"] as const,
  transactions: (reasons: string[], page: number, username: string) =>
    ["coins", "transactions", username, page, ...reasons] as const,
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
  username: string,
) =>
  queryOptions({
    queryKey: coinQueryKeys.transactions(reasons ?? [], page, username),
    queryFn: () => fetchCoinTransactions(reasons, page, username),
    staleTime: 30_000,
  });

export const coinSummaryQueryOptions = (username: string) =>
  queryOptions({
    queryKey: coinQueryKeys.summary(username),
    queryFn: fetchCoinSummary,
    staleTime: 15_000,
  });

export const updateCachedCoinBalance = (
  queryClient: QueryClient,
  username: string,
  balance: number,
): void => {
  queryClient.setQueryData<CoinSummary>(coinQueryKeys.summary(username), (current) =>
    current ? { ...current, balance } : current,
  );
};

export const redemptionHistoryQueryOptions = (username: string) =>
  queryOptions({
    queryKey: coinQueryKeys.redemptionHistory(username),
    queryFn: fetchRedemptionHistory,
    staleTime: 15_000,
  });
