import { queryOptions } from "@tanstack/react-query";

import { fetchCoinSummary, fetchRedemptionHistory } from "./coins";

export const coinQueryKeys = {
  summary: (username: string) => ["coins", "summary", username] as const,
  redemptionHistory: (username: string) => ["coins", "redemption-history", username] as const,
};

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
