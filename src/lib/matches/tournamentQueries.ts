import { queryOptions } from "@tanstack/react-query";

import { getTournamentBracket, getTournamentChampion, tournamentCatalog } from "./tournaments";

export const tournamentQueryKeys = {
  all: ["tournaments"] as const,
  bracket: (tournamentId: string) => ["tournaments", "bracket", tournamentId] as const,
  champions: () => ["tournaments", "champions"] as const,
};

export const tournamentBracketQueryOptions = (tournamentId: string) =>
  queryOptions({
    queryKey: tournamentQueryKeys.bracket(tournamentId),
    queryFn: () => getTournamentBracket(tournamentId),
    staleTime: 5 * 60 * 1_000,
  });

export const tournamentChampionsQueryOptions = () =>
  queryOptions({
    queryKey: tournamentQueryKeys.champions(),
    queryFn: async () => {
      const availableTournaments = tournamentCatalog.filter(
        (tournament) => tournament.status === "available",
      );
      const championEntries = await Promise.all(
        availableTournaments.map(async (tournament) => {
          try {
            const bracket = await getTournamentBracket(tournament.id);
            return [tournament.id, getTournamentChampion(bracket)] as const;
          } catch {
            return [tournament.id, ""] as const;
          }
        }),
      );
      return Object.fromEntries(championEntries.filter(([, champion]) => champion));
    },
    staleTime: 10 * 60 * 1_000,
  });
