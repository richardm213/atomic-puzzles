import { type QueryClient, queryOptions } from "@tanstack/react-query";

import { fetchMarketSuggestions, fetchPredictionPositions } from "./betting";

export const bettingQueryKeys = {
  predictionPositions: ["betting", "prediction-positions"] as const,
  strikePositions: (marketId: string) => ["betting", "strike-positions", marketId] as const,
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

export const strikePredictionPositionsQueryOptions = (marketId: string) =>
  queryOptions({
    queryKey: bettingQueryKeys.strikePositions(marketId),
    queryFn: ({ signal }) => fetchPredictionPositions([marketId], signal),
    staleTime: 30_000,
  });

export const refreshPredictionPositions = async (
  queryClient: QueryClient,
  marketIds: readonly string[],
  signal: AbortSignal,
) => {
  if (!marketIds.length || signal.aborted) return;
  const options = allPredictionPositionsQueryOptions();
  const state = queryClient.getQueryState(options.queryKey);
  // If a snapshot starts after the update, it already includes that update.
  // A snapshot already in flight can predate the update and still needs reconciliation.
  const needsScopedRefresh = state?.data !== undefined || state?.fetchStatus === "fetching";
  if (state?.data === undefined || state.fetchStatus === "fetching") {
    await queryClient.fetchQuery({ ...options, staleTime: 0 });
  }
  if (!needsScopedRefresh || signal.aborted) return;
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
