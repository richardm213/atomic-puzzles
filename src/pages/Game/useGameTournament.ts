import { useQuery } from "@tanstack/react-query";

import type { ArchiveGame } from "../../lib/archive/games";
import { loadRawMatchById } from "../../lib/matches/data";
import { getTournamentMatchLocation } from "../../lib/matches/tournaments";

export const useGameTournament = (game: ArchiveGame) => {
  const locationQuery = useQuery({
    queryKey: ["tournament-match-location", game.external_match_id],
    queryFn: () => getTournamentMatchLocation(game.external_match_id),
    enabled: Boolean(game.external_match_id),
    staleTime: 10 * 60 * 1_000,
  });
  const tournamentLocation = locationQuery.data ?? null;
  const matchQuery = useQuery({
    queryKey: ["games", "match-crosstable", game.external_match_id],
    queryFn: () => loadRawMatchById(game.external_match_id),
    enabled: Boolean((tournamentLocation || game.tournament) && game.external_match_id),
    staleTime: 10 * 60 * 1_000,
  });
  return {
    tournamentLocation,
    match: matchQuery.data,
    isTournament: Boolean(tournamentLocation || game.tournament || matchQuery.data?.tournament_id),
  };
};
