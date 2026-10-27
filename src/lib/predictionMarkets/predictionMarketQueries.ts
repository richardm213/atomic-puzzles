import { queryOptions } from "@tanstack/react-query";

import { fetchPredictionMarket, NATSO_BAN_MARKET_ID } from "./predictionMarkets";

export const predictionMarketQueryKey = ["prediction-market", NATSO_BAN_MARKET_ID] as const;

export const predictionMarketQueryOptions = () =>
  queryOptions({
    queryKey: predictionMarketQueryKey,
    queryFn: fetchPredictionMarket,
    staleTime: 3_000,
    refetchInterval: 5_000,
  });
