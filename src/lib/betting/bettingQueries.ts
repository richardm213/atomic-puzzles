import { queryOptions } from "@tanstack/react-query";

import {
  fetchAllTournamentBets,
  fetchBettingMarkets,
  fetchMarketSuggestions,
  fetchMyTournamentBets,
} from "./betting";
import { fetchBettingBootstrap } from "./bettingBootstrap";

export const bettingQueryKeys = {
  bootstrap: ["betting", "bootstrap"] as const,
  markets: ["betting", "markets"] as const,
  bets: (username: string) => ["betting", "bets", username.toLowerCase()] as const,
  allBets: ["betting", "all-bets"] as const,
  suggestions: ["betting", "suggestions"] as const,
};

export const bettingBootstrapQueryOptions = () =>
  queryOptions({
    queryKey: bettingQueryKeys.bootstrap,
    queryFn: fetchBettingBootstrap,
    staleTime: 10_000,
  });

export const bettingMarketsQueryOptions = () =>
  queryOptions({
    queryKey: bettingQueryKeys.markets,
    queryFn: fetchBettingMarkets,
    staleTime: 15_000,
  });

export const tournamentBetsQueryOptions = (username: string) =>
  queryOptions({
    queryKey: bettingQueryKeys.bets(username),
    queryFn: fetchMyTournamentBets,
    staleTime: 10_000,
  });

export const allTournamentBetsQueryOptions = () =>
  queryOptions({
    queryKey: bettingQueryKeys.allBets,
    queryFn: fetchAllTournamentBets,
    staleTime: 10_000,
  });

export const marketSuggestionsQueryOptions = () =>
  queryOptions({
    queryKey: bettingQueryKeys.suggestions,
    queryFn: fetchMarketSuggestions,
    staleTime: 10_000,
  });
