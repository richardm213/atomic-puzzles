import { queryOptions } from "@tanstack/react-query";

import { fetchAllPredictionPositions, fetchMarketSuggestions } from "./betting";

export const bettingQueryKeys = {
  predictionPositions: ["betting", "prediction-positions"] as const,
  suggestions: ["betting", "suggestions"] as const,
};

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
