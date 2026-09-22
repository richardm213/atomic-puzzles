import { queryOptions } from "@tanstack/react-query";

import { getSupabaseClient } from "../supabase/client";
import { loadSupabaseRows } from "../supabase/rows";
import { fetchTournamentCatalog, getTournamentBracket } from "./tournaments";

export const tournamentQueryKeys = {
  all: ["tournaments"] as const,
  catalog: () => ["tournaments", "catalog"] as const,
  bracket: (tournamentId: string) => ["tournaments", "bracket", tournamentId] as const,
  champions: () => ["tournaments", "champions"] as const,
};

export const tournamentCatalogQueryOptions = () =>
  queryOptions({
    queryKey: tournamentQueryKeys.catalog(),
    queryFn: fetchTournamentCatalog,
    staleTime: 10 * 60 * 1_000,
  });

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
      const rows = await loadSupabaseRows<{
        tournament_id?: string | null;
        player_name?: string | null;
      }>(
        "tournament_winners",
        getSupabaseClient().from("tournament_winners").select("tournament_id,player_name"),
      );
      return Object.fromEntries(
        rows
          .map((row) => [
            String(row?.tournament_id ?? "").trim(),
            String(row?.player_name ?? "").trim(),
          ])
          .filter(([tournamentId, champion]) => tournamentId && champion),
      );
    },
    staleTime: 10 * 60 * 1_000,
  });
