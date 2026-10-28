import { type QueryClient, queryOptions } from "@tanstack/react-query";

import {
  fetchPredictionMarket,
  fetchPredictionMarketGroups,
  fetchPredictionMarkets,
  type PredictionMarketId,
  type PredictionMarketState,
} from "./predictionMarkets";

export const predictionMarketQueryRoot = ["prediction-market"] as const;
export const predictionMarketCatalogQueryOptions = () =>
  queryOptions({
    queryKey: [...predictionMarketQueryRoot, "catalog"] as const,
    queryFn: fetchPredictionMarketGroups,
    staleTime: 60_000,
  });
export const predictionMarketQueryKey = (marketId: PredictionMarketId) =>
  [...predictionMarketQueryRoot, marketId] as const;

export const predictionMarketQueryOptions = (marketId: PredictionMarketId) =>
  queryOptions({
    queryKey: predictionMarketQueryKey(marketId),
    queryFn: () => fetchPredictionMarket(marketId),
    staleTime: 1_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

export const predictionMarketBatchQueryKey = (marketIds: readonly PredictionMarketId[]) =>
  [...predictionMarketQueryRoot, "batch", [...new Set(marketIds)].sort()] as const;

export const predictionMarketBatchQueryOptions = (marketIds: readonly PredictionMarketId[]) => {
  const uniqueMarketIds = [...new Set(marketIds)].sort();
  return queryOptions({
    queryKey: predictionMarketBatchQueryKey(uniqueMarketIds),
    queryFn: () => fetchPredictionMarkets(uniqueMarketIds),
    staleTime: 1_000,
    refetchInterval: 30_000,
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
