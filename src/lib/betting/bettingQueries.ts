import { type QueryClient, queryOptions } from "@tanstack/react-query";

import { fetchPredictionPositions, fetchMarketSuggestions } from "./betting";

export const bettingQueryKeys = {
  predictionPositions: ["betting", "prediction-positions"] as const,
  suggestions: ["betting", "suggestions"] as const,
};

export const allPredictionPositionsQueryOptions = () =>
  queryOptions({
    queryKey: bettingQueryKeys.predictionPositions,
    queryFn: ({ signal }) => fetchPredictionPositions(undefined, signal),
    staleTime: 10_000,
    // The version feed reconciles history while the betting page is mounted.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

export const refreshPredictionPositions = async (
  queryClient: QueryClient,
  marketIds: readonly string[],
  signal: AbortSignal,
) => {
  const options = allPredictionPositionsQueryOptions();
  const state = queryClient.getQueryState(options.queryKey);
  if (state?.data === undefined || state.fetchStatus === "fetching") {
    await queryClient.fetchQuery({ ...options, staleTime: 0 });
  }
  if (signal.aborted) return;
  const scoped = new Set(marketIds);
  const updates = await Promise.all(
    Array.from({ length: Math.ceil(marketIds.length / 100) }, (_, index) =>
      fetchPredictionPositions(marketIds.slice(index * 100, (index + 1) * 100), signal),
    ),
  );
  if (signal.aborted) return;
  queryClient.setQueryData(options.queryKey, (previous) => ({
    positions: [
      ...(previous?.positions ?? []).filter((position) => !scoped.has(position.marketId)),
      ...updates.flatMap((update) => update.positions),
    ],
    markets: [
      ...(previous?.markets ?? []).filter((market) => !scoped.has(market.id)),
      ...updates.flatMap((update) => update.markets),
    ],
  }));
};

export const marketSuggestionsQueryOptions = () =>
  queryOptions({
    queryKey: bettingQueryKeys.suggestions,
    queryFn: fetchMarketSuggestions,
    staleTime: 10_000,
  });
