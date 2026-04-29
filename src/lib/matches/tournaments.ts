import { cachedRequest } from "../../utils/requestCache";
import { getSupabaseClient } from "../supabase/supabaseClient";
import { fetchAllSupabaseRows } from "../supabase/supabaseRows";

export type TournamentMeta = {
  id: string;
  title: string;
  year: number;
  status: "available" | "pending";
};

export type TournamentMatch = {
  tournament: string;
  bracket: string;
  round: string;
  order: number;
  id: string;
  match_id: string;
  p1: string;
  p2: string;
  s1: number;
  s2: number;
  winner_to: string;
  loser_to: string;
};

export type TournamentRound = {
  roundName: string;
  matches: TournamentMatch[];
};

export type TournamentBracketStage = {
  key: string;
  label: string;
  rounds: TournamentRound[];
};

export type TournamentBracket = TournamentMeta & {
  matches: TournamentMatch[];
  stages: TournamentBracketStage[];
  byKey: Map<string, TournamentMatch>;
  seedMap: Record<string, number>;
  countryMap: Record<string, string>;
};

type TournamentMatchRowFromDb = {
  tournament?: string | null;
  bracket?: string | null;
  round?: string | null;
  order?: number | string | null;
  id?: string | null;
  match_id?: string | null;
  p1?: string | null;
  p2?: string | null;
  s1?: number | string | null;
  s2?: number | string | null;
  winner_to?: string | null;
  loser_to?: string | null;
};

const TOURNAMENT_MATCHES_TABLE = "tournament_matches";
const PLAYER_COUNTRIES_TABLE = "player_countries";
const TOURNAMENT_SEEDS_TABLE = "tournament_seeds";

const TOURNAMENT_MATCHES_SELECT_COLUMNS =
  "tournament,bracket,round,order,id,match_id,p1,p2,s1,s2,winner_to,loser_to";
const PLAYER_COUNTRIES_SELECT_COLUMNS = "player_name,country_code";
const TOURNAMENT_SEEDS_SELECT_COLUMNS = "tournament,player_name,seed";

const tournamentMatchesCache = new Map<string, Promise<TournamentMatch[]>>();
const playerCountriesCache = new Map<string, Promise<Record<string, string>>>();
const tournamentSeedsCache = new Map<string, Promise<Record<string, number>>>();
const tournamentBracketCache = new Map<string, Promise<TournamentBracket | null>>();

const tournaments: TournamentMeta[] = [
  { id: "awc2025", title: "AWC 2025", year: 2025, status: "available" },
  { id: "awc2024", title: "AWC 2024", year: 2024, status: "available" },
  { id: "awc2023", title: "AWC 2023", year: 2023, status: "available" },
  { id: "awc2022", title: "AWC 2022", year: 2022, status: "available" },
  { id: "awc2021", title: "AWC 2021", year: 2021, status: "available" },
  { id: "awc2020", title: "AWC 2020", year: 2020, status: "pending" },
  { id: "awc2019", title: "AWC 2019", year: 2019, status: "pending" },
  { id: "awc2018", title: "AWC 2018", year: 2018, status: "pending" },
  { id: "awc2017", title: "AWC 2017", year: 2017, status: "pending" },
  { id: "awc2016", title: "AWC 2016", year: 2016, status: "pending" },
];

const roundDisplayOrder: Record<string, string[]> = {
  main: [
    "Round of 64",
    "Round of 32",
    "Round of 16",
    "Quarterfinals",
    "Semifinals",
    "Finals",
    "Grand Final",
    "Grand Final Reset",
  ],
  losers: ["Round 1", "Round 2", "Round 3", "Round 4", "Round 5", "Final"],
  grand_final: ["Set 1", "Reset"],
};

const bracketLabels: Record<string, string> = {
  main: "Main Bracket",
  losers: "Losers Bracket",
  grand_final: "Grand Final",
};

const bracketPriority = (bracketKey: string): number => {
  if (bracketKey === "main") return 0;
  if (bracketKey === "losers") return 1;
  if (bracketKey === "grand_final") return 2;
  return 100;
};

const getBracketLabel = (bracketKey: string): string => bracketLabels[bracketKey] ?? bracketKey;

const getRoundIndex = (bracketKey: string, roundName: string): number => {
  const orderedRounds = roundDisplayOrder[bracketKey] ?? [];
  const index = orderedRounds.indexOf(roundName);
  return index >= 0 ? index : 999;
};

const getBracketRounds = (bracketKey: string, matches: TournamentMatch[]): string[] => {
  const configured = roundDisplayOrder[bracketKey];
  if (configured) return configured;

  return Array.from(
    new Set(
      matches
        .filter((match) => match.bracket === bracketKey)
        .sort(
          (left, right) =>
            getRoundIndex(bracketKey, left.round) - getRoundIndex(bracketKey, right.round),
        )
        .map((match) => match.round),
    ),
  );
};

const normalizeMatchRow = (row: TournamentMatchRowFromDb): TournamentMatch => ({
  tournament: String(row?.tournament ?? "").trim(),
  bracket: String(row?.bracket ?? "").trim(),
  round: String(row?.round ?? "").trim(),
  order: Number(row?.order),
  id: String(row?.id ?? "").trim(),
  match_id: String(row?.match_id ?? "").trim(),
  p1: String(row?.p1 ?? "").trim(),
  p2: String(row?.p2 ?? "").trim(),
  s1: Number(row?.s1),
  s2: Number(row?.s2),
  winner_to: String(row?.winner_to ?? "").trim(),
  loser_to: String(row?.loser_to ?? "").trim(),
});

const winnerName = (match: TournamentMatch): string => {
  if (Number(match.s1) > Number(match.s2)) return match.p1;
  if (Number(match.s2) > Number(match.s1)) return match.p2;
  return "";
};

const addImplicitByeMatches = (matches: TournamentMatch[]): TournamentMatch[] => {
  const augmented = [...matches];
  const mainRounds = roundDisplayOrder["main"] ?? [];
  const byeSourceRound = "Round of 64";
  const byeDestinationRound = "Round of 32";

  for (let roundIndex = 1; roundIndex < mainRounds.length; roundIndex += 1) {
    const currentRound = mainRounds[roundIndex];
    const previousRound = mainRounds[roundIndex - 1];

    if (previousRound !== byeSourceRound || currentRound !== byeDestinationRound) continue;

    const currentMatches = augmented.filter(
      (match) => match.bracket === "main" && match.round === currentRound,
    );

    if (!currentMatches.length) continue;

    currentMatches.forEach((currentMatch) => {
      const feederMatches = augmented.filter(
        (match) =>
          match.bracket === "main" &&
          match.round === previousRound &&
          match.winner_to === currentMatch.id,
      );

      if (feederMatches.length !== 1) return;
      const feeder = feederMatches[0]!;

      const feederWinner = winnerName(feeder);
      if (
        !feederWinner ||
        (feederWinner !== currentMatch.p1 && feederWinner !== currentMatch.p2)
      )
        return;

      const missingPlayer = feederWinner === currentMatch.p1 ? currentMatch.p2 : currentMatch.p1;
      if (!missingPlayer || missingPlayer.toLowerCase() === "bye") return;

      const syntheticId = `${currentMatch.id}-bye`;
      if (augmented.some((match) => match.id === syntheticId)) return;

      const missingPlayerIsSecond = missingPlayer === currentMatch.p2;

      augmented.push({
        tournament: currentMatch.tournament,
        bracket: "main",
        round: previousRound,
        order: feederWinner === currentMatch.p1 ? feeder.order + 0.1 : feeder.order - 0.1,
        id: syntheticId,
        match_id: "",
        p1: missingPlayerIsSecond ? "bye" : missingPlayer,
        p2: missingPlayerIsSecond ? missingPlayer : "bye",
        s1: missingPlayerIsSecond ? 0 : 1,
        s2: missingPlayerIsSecond ? 1 : 0,
        winner_to: currentMatch.id,
        loser_to: "",
      });
    });
  }

  return augmented;
};

const fetchTournamentMatchRows = async (tournamentId: string): Promise<TournamentMatch[]> =>
  cachedRequest(tournamentMatchesCache, ["tournamentMatches", tournamentId], async () => {
    const supabase = getSupabaseClient();
    const buildQuery = () =>
      supabase
        .from(TOURNAMENT_MATCHES_TABLE)
        .select(TOURNAMENT_MATCHES_SELECT_COLUMNS)
        .eq("tournament", tournamentId);

    const rows = await fetchAllSupabaseRows<TournamentMatchRowFromDb>(
      TOURNAMENT_MATCHES_TABLE,
      buildQuery,
    );
    return rows.map(normalizeMatchRow);
  });

const fetchPlayerCountryMap = async (): Promise<Record<string, string>> =>
  cachedRequest(playerCountriesCache, ["playerCountries"], async () => {
    const supabase = getSupabaseClient();
    const buildQuery = () =>
      supabase.from(PLAYER_COUNTRIES_TABLE).select(PLAYER_COUNTRIES_SELECT_COLUMNS);

    const rows = await fetchAllSupabaseRows<{
      player_name?: string | null;
      country_code?: string | null;
    }>(PLAYER_COUNTRIES_TABLE, buildQuery);
    return rows.reduce<Record<string, string>>((accumulator, row) => {
      const playerName = String(row?.player_name ?? "")
        .trim()
        .toLowerCase();
      const countryCode = String(row?.country_code ?? "")
        .trim()
        .toUpperCase();
      if (!playerName || !countryCode) return accumulator;
      accumulator[playerName] = countryCode;
      return accumulator;
    }, {});
  });

const fetchTournamentSeedMap = async (tournamentId: string): Promise<Record<string, number>> =>
  cachedRequest(tournamentSeedsCache, ["tournamentSeeds", tournamentId], async () => {
    const supabase = getSupabaseClient();
    const buildQuery = () =>
      supabase
        .from(TOURNAMENT_SEEDS_TABLE)
        .select(TOURNAMENT_SEEDS_SELECT_COLUMNS)
        .eq("tournament", tournamentId);

    const rows = await fetchAllSupabaseRows<{
      player_name?: string | null;
      seed?: number | string | null;
    }>(TOURNAMENT_SEEDS_TABLE, buildQuery);
    return rows.reduce<Record<string, number>>((accumulator, row) => {
      const playerName = String(row?.player_name ?? "")
        .trim()
        .toLowerCase();
      const seed = Number(row?.seed);
      if (!playerName || !Number.isFinite(seed)) return accumulator;
      accumulator[playerName] = seed;
      return accumulator;
    }, {});
  });

export const tournamentCatalog: readonly TournamentMeta[] = tournaments;

export const getAdjacentTournamentMetas = (
  tournamentId: string,
): { previous: TournamentMeta | null; next: TournamentMeta | null } => {
  const ordered = [...tournaments].sort((left, right) => right.year - left.year);
  const index = ordered.findIndex((entry) => entry.id === tournamentId);

  if (index < 0) {
    return {
      previous: null,
      next: null,
    };
  }

  return {
    previous: ordered[index + 1] ?? null,
    next: ordered[index - 1] ?? null,
  };
};

export const getTournamentMeta = (tournamentId: string): TournamentMeta | null =>
  tournaments.find((entry) => entry.id === tournamentId) ?? null;

export const getTournamentChampion = (
  bracket: { matches?: TournamentMatch[] } | null | undefined,
): string => {
  if (!bracket || !Array.isArray(bracket.matches)) return "";

  const championshipMatch =
    bracket.matches.find((match) => match.bracket === "grand_final" && match.round === "Reset") ??
    bracket.matches.find((match) => match.bracket === "grand_final" && match.round === "Set 1") ??
    bracket.matches.find((match) => match.bracket === "main" && match.round === "Finals");

  if (!championshipMatch) return "";
  return winnerName(championshipMatch);
};

export const getTournamentBracket = async (
  tournamentId: string,
): Promise<TournamentBracket | null> =>
  cachedRequest(tournamentBracketCache, ["tournamentBracket", tournamentId], async () => {
    const meta = getTournamentMeta(tournamentId);
    if (!meta) return null;

    const [rawMatches, countryMap, seedMap] = await Promise.all([
      fetchTournamentMatchRows(tournamentId),
      fetchPlayerCountryMap(),
      fetchTournamentSeedMap(tournamentId),
    ]);

    const matches = addImplicitByeMatches(rawMatches).sort(
      (left, right) =>
        bracketPriority(left.bracket) - bracketPriority(right.bracket) ||
        getRoundIndex(left.bracket, left.round) - getRoundIndex(right.bracket, right.round) ||
        left.order - right.order,
    );

    if (!matches.length) return null;

    const byId = new Map<string, TournamentMatch>(matches.map((match) => [match.id, match]));
    const championshipMatches = matches
      .filter((match) => match.bracket === "grand_final")
      .map(
        (match): TournamentMatch => ({
          ...match,
          bracket: "main",
          round: match.round === "Set 1" ? "Grand Final" : "Grand Final Reset",
        }),
      );

    const bracketKeys = Array.from(new Set(matches.map((match) => match.bracket))).sort(
      (left, right) => bracketPriority(left) - bracketPriority(right) || left.localeCompare(right),
    );

    const brackets = bracketKeys
      .map((bracketKey): TournamentBracketStage | null => {
        const rounds = getBracketRounds(bracketKey, matches)
          .map((roundName): TournamentRound | null => {
            const roundMatches = matches
              .filter((match) => match.bracket === bracketKey && match.round === roundName)
              .sort((left, right) => left.order - right.order);

            if (!roundMatches.length) return null;

            return {
              roundName,
              matches: roundMatches,
            };
          })
          .filter((round): round is TournamentRound => round !== null);

        if (!rounds.length) return null;

        return {
          key: bracketKey,
          label: getBracketLabel(bracketKey),
          rounds,
        };
      })
      .filter((bracket): bracket is TournamentBracketStage => bracket !== null);

    const mainBracket = brackets.find((bracket) => bracket.key === "main");

    if (mainBracket && championshipMatches.length) {
      championshipMatches.forEach((match) => {
        const existingRound = mainBracket.rounds.find((round) => round.roundName === match.round);
        if (existingRound) {
          existingRound.matches.push(match);
          existingRound.matches.sort((left, right) => left.order - right.order);
          return;
        }

        mainBracket.rounds.push({
          roundName: match.round,
          matches: [match],
        });
      });

      mainBracket.rounds.sort(
        (left, right) =>
          getRoundIndex("main", left.roundName) - getRoundIndex("main", right.roundName),
      );
    }

    return {
      ...meta,
      matches,
      stages: brackets.filter((bracket) => bracket.key !== "grand_final"),
      byKey: byId,
      seedMap,
      countryMap,
    };
  });
