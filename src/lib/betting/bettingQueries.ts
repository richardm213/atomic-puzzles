import { queryOptions } from "@tanstack/react-query";

import { fetchAllPredictionPositions, fetchMarketSuggestions } from "./betting";
import { fetchBettingBootstrap } from "./bettingBootstrap";

export const bettingQueryKeys = {
  bootstrap: ["betting", "bootstrap"] as const,
  predictionPositions: ["betting", "prediction-positions"] as const,
  suggestions: ["betting", "suggestions"] as const,
};

export const bettingBootstrapQueryOptions = () =>
  queryOptions({
    queryKey: bettingQueryKeys.bootstrap,
    queryFn: fetchBettingBootstrap,
    staleTime: 10_000,
  });

export const allPredictionPositionsQueryOptions = () =>
  queryOptions({
    queryKey: bettingQueryKeys.predictionPositions,
    queryFn: fetchAllPredictionPositions,
    staleTime: 10_000,
  });

export const marketSuggestionsQueryOptions = () =>
  queryOptions({
    queryKey: bettingQueryKeys.suggestions,
    queryFn: fetchMarketSuggestions,
    staleTime: 10_000,
  });
