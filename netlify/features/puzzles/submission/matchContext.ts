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
  initial_fen?: string | null;
  mode?: string;
  moves?: string[] | null;
};

type TournamentRound = {
  tournament: string;
  bracket: string;
  round: string;
  played_on: string | null;
};

type MatchPuzzleSet = { id: number; event_name: string; source_id: string | null };
type HistoricalMatchPuzzle = {
  event: string | null;
  event_name: string | null;
  puzzle_set: MatchPuzzleSet | null;
};

const findHistoricalMatchPuzzle = async (db: SupabaseClient, matchId: string, gameId: string) => {
  const { data, error } = await db
    .from("puzzles")
    .select(
      "event,event_name,puzzle_set:puzzle_sets!puzzles_puzzle_set_id_fkey(id,event_name,source_id)",
    )
    .or(
      `match_id.eq.${JSON.stringify(matchId)},and(match_id.is.null,game_id.eq.${JSON.stringify(gameId)})`,
    )
    .order("puzzle_set_id", { nullsFirst: false })
    .order("id")
    .limit(1)
    .maybeSingle<HistoricalMatchPuzzle>();
  if (error) throw new Error(`Unable to look up existing match puzzles: ${error.message}`);
  return data;
};

const tournamentRoundLabel = ({ bracket, round }: TournamentRound): string => {
  if (bracket === "grand_final") return round === "Reset" ? "Grand Final Reset" : "Grand Final";
  if (bracket === "losers") return `Losers Bracket, ${round}`;
  if (bracket === "qualifying" && !round.toLowerCase().includes("qualifying")) {
    return `Qualifying, ${round}`;
  }
  return round;
};

export type FetchMatchPuzzleGame = (gameId: string) => Promise<unknown>;

const fetchArchiveGame: FetchMatchPuzzleGame = (gameId) =>
  queryArchiveResource(new URLSearchParams({ resource: "game", gameId }));

export const loadMatchPuzzleContext = async (
  db: SupabaseClient,
  gameId: string,
  fetchGame = fetchArchiveGame,
) => {
  const game = (await fetchGame(gameId)) as MatchGame | null;
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

  const tournamentId = rounds.data?.tournament ?? game.tournament?.trim();
  const archiveDate = new Date(game.start_ts);
  const player1IsWhite = (game.result & 1) === 0;
  const matchContext = {
    matchId,
    sourceGame: game,
    tournamentMatch: Boolean(tournamentId),
    eventDate:
      rounds.data?.played_on ??
      (Number.isFinite(archiveDate.getTime()) ? archiveDate.toISOString().slice(0, 10) : ""),
    whitePlayer: player1IsWhite ? game.player_1 : game.player_2,
    blackPlayer: player1IsWhite ? game.player_2 : game.player_1,
    players: [game.player_1, game.player_2],
  };
  if (!tournamentId) {
    return { ...matchContext, existingSetId: null, setName: "", canRenameSet: false };
  }

  const linkedSet = sets.data?.find((set) => set.source_id === matchId);
  let existingSet: MatchPuzzleSet | null | undefined =
    linkedSet ?? sets.data?.find((set) => set.id === legacySetId && !set.source_id);
  const historicalPuzzle = existingSet
    ? null
    : await findHistoricalMatchPuzzle(db, matchId, gameId);
  const historicalSet = historicalPuzzle?.puzzle_set;
  let historicalSetIsShared = false;
  if (historicalSet) {
    if (historicalSet.source_id === matchId) {
      existingSet = historicalSet;
    } else if (historicalSet.source_id) {
      historicalSetIsShared = true;
    } else {
      const { data, error } = await db
        .from("puzzles")
        .select("id")
        .eq("puzzle_set_id", historicalSet.id)
        .neq("match_id", matchId)
        .limit(1);
      if (error) throw new Error(`Unable to verify the existing puzzle set: ${error.message}`);
      historicalSetIsShared = Boolean(data?.length);
      if (!historicalSetIsShared) existingSet = historicalSet;
    }
  }
  let tournamentTitle = game.tournament?.trim() ?? "";
  if (!existingSet && tournamentId) {
    const { data, error } = await db
      .from("tournament_catalog")
      .select("title")
      .eq("id", tournamentId)
      .maybeSingle();
    if (error) throw new Error(`Unable to look up the tournament: ${error.message}`);
    tournamentTitle = data?.title?.trim() || tournamentTitle || tournamentId;
  }
  const round = rounds.data ? tournamentRoundLabel(rounds.data) : "";
  const tournamentName = [tournamentTitle, round].filter(Boolean).join(" ");
  const historicalName = historicalPuzzle?.event_name?.trim() || historicalPuzzle?.event?.trim();
  const defaultName = tournamentName || historicalName || `Match ${matchId}`;
  const setName =
    existingSet?.event_name ??
    (historicalSetIsShared && !defaultName.includes(matchId)
      ? `${defaultName} · ${matchId}`
      : defaultName);
  return {
    ...matchContext,
    existingSetId: existingSet?.id ?? null,
    setName,
    canRenameSet: false,
  };
};
