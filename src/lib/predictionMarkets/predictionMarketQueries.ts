import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import {
  type PredictionHistoryPeriod,
  predictionPriceHistorySchema,
} from "../../../shared/domain/predictionHistory";
import { predictionTraderHistorySchema } from "../../../shared/domain/predictionTraderHistory";
import { postApi } from "../api/postApi";
import {
  fetchPredictionMarketGroups,
  fetchPredictionMarkets,
  type PredictionMarketId,
  type PredictionMarketState,
} from "./predictionMarkets";

export const predictionMarketQueryRoot = ["prediction-market"] as const;
export const predictionTraderHistoryQueryOptions = (marketId: string, username: string) =>
  queryOptions({
    queryKey: [...predictionMarketQueryRoot, "trader-history", marketId, username],
    queryFn: async () => {
      const response = await postApi(
        "/api/betting",
        { action: "exchangeTraderHistory", marketId, username },
        {
          schema: z.object({ result: predictionTraderHistorySchema }),
          errorMessage: "Unable to load transactions.",
          invalidMessage: "Invalid transaction history.",
        },
      );
      return response.result;
    },
    staleTime: 15_000,
  });
export const predictionPriceHistoryQueryOptions = (
  marketId: string,
  period: PredictionHistoryPeriod,
) =>
  queryOptions({
    queryKey: [...predictionMarketQueryRoot, "price-history", marketId, period],
    queryFn: async () => {
      const response = await postApi(
        "/api/betting",
        { action: "exchangePriceHistory", marketId, period },
        {
          schema: z.object({ result: predictionPriceHistorySchema }),
          errorMessage: "Unable to load price history.",
          invalidMessage: "The market returned invalid price history.",
        },
      );
      return response.result;
    },
    staleTime: 60_000,
  });
export const predictionMarketCatalogQueryOptions = () =>
  queryOptions({
    queryKey: [...predictionMarketQueryRoot, "catalog"] as const,
    queryFn: fetchPredictionMarketGroups,
    staleTime: 60_000,
  });
export const predictionMarketQueryKey = (marketId: PredictionMarketId) =>
  [...predictionMarketQueryRoot, marketId] as const;

export const predictionMarketBatchQueryKey = (marketIds: readonly PredictionMarketId[]) =>
  [...predictionMarketQueryRoot, "batch", [...new Set(marketIds)].sort()] as const;

export const predictionMarketBatchQueryOptions = (marketIds: readonly PredictionMarketId[]) => {
  const uniqueMarketIds = [...new Set(marketIds)].sort();
  return queryOptions({
    queryKey: predictionMarketBatchQueryKey(uniqueMarketIds),
    queryFn: ({ signal }) => fetchPredictionMarkets(uniqueMarketIds, signal),
    staleTime: 1_000,
    refetchInterval: ({ state }) => {
      const nextExpiry = Math.min(
        ...(state.data ?? []).map((market) => market.nextOrderExpiry ?? Infinity),
      );
      if (!Number.isFinite(nextExpiry)) return false;
      // The database cleanup can run after the book has already stopped accepting the order.
      return Math.max(250, Math.min(nextExpiry - Date.now() + 100, 2_147_483_647));
    },
    refetchIntervalInBackground: false,
  });
};

export const patchPredictionMarketState = (
  queryClient: QueryClient,
  state: PredictionMarketState,
) => {
  queryClient.setQueryData(predictionMarketQueryKey(state.market.id), state);
  queryClient.setQueriesData<PredictionMarketState[]>(
    { queryKey: [...predictionMarketQueryRoot, "batch"] },
    (current) =>
      current?.map((marketState) =>
        marketState.market.id === state.market.id ? state : marketState,
      ),
  );
};
