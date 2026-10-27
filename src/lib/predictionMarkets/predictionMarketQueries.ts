import { queryOptions } from "@tanstack/react-query";

import { fetchPredictionMarket, type PredictionMarketId } from "./predictionMarkets";

export const predictionMarketQueryRoot = ["prediction-market"] as const;
export const predictionMarketQueryKey = (marketId: PredictionMarketId) =>
  [...predictionMarketQueryRoot, marketId] as const;

export const predictionMarketQueryOptions = (marketId: PredictionMarketId) =>
  queryOptions({
    queryKey: predictionMarketQueryKey(marketId),
    queryFn: () => fetchPredictionMarket(marketId),
    staleTime: 3_000,
    refetchInterval: 5_000,
  });
