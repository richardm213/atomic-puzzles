import { queryOptions } from "@tanstack/react-query";

import { fetchAllTournamentBets, fetchBettingMarkets, fetchMyTournamentBets } from "./betting";

export const bettingQueryKeys = {
  markets: ["betting", "markets"] as const,
  bets: (username: string) => ["betting", "bets", username.toLowerCase()] as const,
  allBets: ["betting", "all-bets"] as const,
};

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
