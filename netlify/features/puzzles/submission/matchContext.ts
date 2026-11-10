import type { SupabaseClient } from "@supabase/supabase-js";

import { legacyMatchPuzzleSetSources } from "../../../../shared/domain/puzzles/legacyMatchPuzzleSets";
import { queryArchiveResource } from "../../../archive/queries";
import { HttpError } from "../../../platform/errors";

type MatchGame = {
  external_match_id: string;
  player_1: string;
  player_2: string;
  result: number;
  start_ts: number;
  tournament: string | null;
};

type TournamentRound = {
  tournament: string;
  bracket: string;
  round: string;
  played_on: string | null;
};

const tournamentRoundLabel = ({ bracket, round }: TournamentRound): string => {
  if (bracket === "grand_final") return round === "Reset" ? "Grand Final Reset" : "Grand Final";
  if (bracket === "losers") return `Losers Bracket, ${round}`;
  if (bracket === "qualifying" && !round.toLowerCase().includes("qualifying")) {
    return `Qualifying, ${round}`;
  }
  return round;
};

export const loadMatchPuzzleContext = async (db: SupabaseClient, gameId: string) => {
  const game = (await queryArchiveResource(
    new URLSearchParams({ resource: "game", gameId }),
  )) as MatchGame | null;
  const matchId = game?.external_match_id?.trim();
  if (!game || !matchId) throw new HttpError(404, "This game is not linked to an archived match.");

  const legacySetId =
    Number(
      Object.keys(legacyMatchPuzzleSetSources).find(
        (id) => legacyMatchPuzzleSetSources[Number(id)] === matchId,
      ),
    ) || null;
  const setQuery = db.from("puzzle_sets").select("id,event_name,source_id");
  const [sets, rounds] = await Promise.all([
    (legacySetId
      ? setQuery.or(`source_id.eq.${JSON.stringify(matchId)},id.eq.${legacySetId}`)
      : setQuery.eq("source_id", matchId)
    ).order("id"),
    db
      .from("tournament_matches")
      .select("tournament,bracket,round,played_on")
      .eq("match_id", matchId)
      .order("order")
      .order("id")
      .limit(1)
      .maybeSingle<TournamentRound>(),
  ]);
  const lookupError = sets.error ?? rounds.error;
  if (lookupError) throw new Error(`Unable to look up the match set: ${lookupError.message}`);

  const linkedSet = sets.data?.find((set) => set.source_id === matchId);
  const existingSet =
    linkedSet ?? sets.data?.find((set) => set.id === legacySetId && !set.source_id);
  const tournamentId = rounds.data?.tournament ?? game.tournament?.trim();
  let tournamentTitle = game.tournament?.trim() ?? "";
  if (!existingSet && tournamentId) {
    const { data, error } = await db
      .from("tournament_catalog")
      .select("title")
      .eq("id", tournamentId)
      .maybeSingle();
    if (error) throw new Error(`Unable to look up the tournament: ${error.message}`);
    tournamentTitle = data?.title ?? tournamentTitle;
    if (rounds.data && !tournamentTitle)
      throw new Error("Archived tournament has no catalog title.");
  }
  const round = rounds.data ? tournamentRoundLabel(rounds.data) : "";
  const tournamentName = [tournamentTitle, round].filter(Boolean).join(" ");
  const player1IsWhite = (game.result & 1) === 0;
  const archiveDate = new Date(game.start_ts);

  return {
    matchId,
    existingSetId: existingSet?.id ?? null,
    setName: existingSet?.event_name ?? (tournamentName || null),
    eventDate:
      rounds.data?.played_on ??
      (Number.isFinite(archiveDate.getTime()) ? archiveDate.toISOString().slice(0, 10) : ""),
    whitePlayer: player1IsWhite ? game.player_1 : game.player_2,
    blackPlayer: player1IsWhite ? game.player_2 : game.player_1,
    players: [game.player_1, game.player_2],
  };
};
