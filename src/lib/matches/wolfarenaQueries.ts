import { queryOptions } from "@tanstack/react-query";

import { getSupabaseClient } from "../supabase/client";
import { loadSupabaseRows } from "../supabase/rows";
import type { WolfarenaTournament } from "./wolfarena";

type TournamentArchiveRow = {
  tournament_id?: string | null;
  payload?: unknown;
};

const parseWolfarenaTournament = (value: unknown): WolfarenaTournament => {
  if (!value || typeof value !== "object") {
    throw new Error("Wolfarena archive payload is missing");
  }

  const tournament = value as Partial<WolfarenaTournament>;
  if (
    tournament.id !== "wr-arena2026" ||
    tournament.title !== "Wolfarena 2026" ||
    !Array.isArray(tournament.rounds) ||
    tournament.rounds.length !== 18
  ) {
    throw new Error("Wolfarena archive payload is invalid");
  }

  return tournament as WolfarenaTournament;
};

export const wolfarenaQueryKeys = {
  archive: (tournamentId: string) => ["tournaments", "arena-archive", tournamentId] as const,
};

export const wolfarenaTournamentQueryOptions = (tournamentId: string) =>
  queryOptions({
    queryKey: wolfarenaQueryKeys.archive(tournamentId),
    queryFn: async () => {
      const rows = await loadSupabaseRows<TournamentArchiveRow>(
        "tournament_archives",
        getSupabaseClient()
          .from("tournament_archives")
          .select("tournament_id,payload")
          .eq("tournament_id", tournamentId)
          .limit(1),
      );
      return parseWolfarenaTournament(rows[0]?.payload);
    },
    staleTime: 10 * 60 * 1_000,
  });

export { parseWolfarenaTournament };
