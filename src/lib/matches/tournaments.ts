import type { Mode } from "../../constants/matches";
import { cachedRequest } from "../../utils/requestCache";
import { getSupabaseClient } from "../supabase/supabaseClient";
import { fetchAllSupabaseRows, loadSupabaseRows } from "../supabase/supabaseRows";

export type TournamentMeta = {
  id: string;
  title: string;
  headingTitle?: string;
  year: number;
  status: "available" | "pending";
  matchMode?: Mode;
  hideStartRoundControls?: boolean;
  completeMainBracketFromRound?: string;
  trophyAssetPath?: string;
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

export type TournamentMatchLocation = {
  tournament: TournamentMeta;
  match: TournamentMatch;
  roundLabel: string;
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
const tournamentMatchLocationCache = new Map<string, Promise<TournamentMatchLocation | null>>();
const playerCountriesCache = new Map<string, Promise<Record<string, string>>>();
const tournamentSeedsCache = new Map<string, Promise<Record<string, number>>>();
const tournamentBracketCache = new Map<string, Promise<TournamentBracket | null>>();

type CsvRow = Record<string, string>;

const trophyAssetPaths = {
  ahc: "/images/awc-trophies/atomic-hyper-championship.png",
  awc: "/images/awc-trophies/awc.png",
  ccac: "/images/awc-trophies/chesscomatomic.png",
} as const;

const availableTournament = (meta: Omit<TournamentMeta, "status">): TournamentMeta => ({
  ...meta,
  status: "available",
});

const awcTournament = (year: number): TournamentMeta =>
  availableTournament({
    id: `awc${year}`,
    title: `AWC ${year}`,
    year,
    trophyAssetPath: trophyAssetPaths.awc,
  });

const tournaments: TournamentMeta[] = [
  availableTournament({
    id: "ahc2026",
    title: "AHC 2026",
    headingTitle: "Atomic Hyper Championship 2026",
    year: 2026,
    matchMode: "hyperbullet",
    completeMainBracketFromRound: "Round of 32",
    trophyAssetPath: trophyAssetPaths.ahc,
  }),
  availableTournament({
    id: "ccac2026",
    title: "CCAC 2026",
    headingTitle: "Chess.com Atomic Championship 2026",
    year: 2026,
    hideStartRoundControls: true,
    trophyAssetPath: trophyAssetPaths.ccac,
  }),
  ...[2025, 2024, 2023, 2022, 2021].map(awcTournament),
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
  losers: [
    "Round 1",
    "Quarterfinals",
    "Round 2",
    "Semifinal",
    "Round 3",
    "Round 4",
    "Round 5",
    "Final",
  ],
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

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      currentValue += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  values.push(currentValue.trim());
  return values;
};

const parseCsvRows = (csv: string): CsvRow[] => {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const [headerLine, ...dataLines] = lines;
  if (!headerLine) return [];

  const headers = parseCsvLine(headerLine);
  return dataLines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
};

const shouldUseLocalTournamentCsv = (): boolean => import.meta.env.DEV;

const fetchLocalTournamentCsv = async (fileName: string): Promise<string> => {
  const response = await fetch(`/data/tournaments/${fileName}`);
  if (!response.ok) {
    throw new Error(`Unable to load local tournament CSV: ${fileName}`);
  }
  return response.text();
};

const fetchLocalTournamentRows = async (tournamentId: string): Promise<TournamentMatch[]> => {
  const tournamentMatchesCsv = await fetchLocalTournamentCsv("tournament_matches.csv");

  return parseCsvRows(tournamentMatchesCsv)
    .filter((row) => row.tournament === tournamentId)
    .map(normalizeMatchRow);
};

const fetchLocalTournamentRowsByMatchId = async (matchId: string): Promise<TournamentMatch[]> => {
  const tournamentMatchesCsv = await fetchLocalTournamentCsv("tournament_matches.csv");

  return parseCsvRows(tournamentMatchesCsv)
    .filter((row) => String(row.match_id ?? "").trim() === matchId)
    .map(normalizeMatchRow);
};

const fetchLocalPlayerCountryMap = async (): Promise<Record<string, string>> => {
  const playerCountriesCsv = await fetchLocalTournamentCsv("player-countries.csv");

  return parseCsvRows(playerCountriesCsv).reduce<Record<string, string>>((accumulator, row) => {
    const playerName = String(row.player_name ?? "")
      .trim()
      .toLowerCase();
    const countryCode = String(row.country_code ?? "")
      .trim()
      .toUpperCase();
    if (!playerName || !countryCode) return accumulator;
    accumulator[playerName] = countryCode;
    return accumulator;
  }, {});
};

const fetchLocalTournamentSeedMap = async (
  tournamentId: string,
): Promise<Record<string, number>> => {
  const tournamentSeedsCsv = await fetchLocalTournamentCsv("tournament-seeds.csv");

  return parseCsvRows(tournamentSeedsCsv)
    .filter((row) => row.tournament === tournamentId)
    .reduce<Record<string, number>>((accumulator, row) => {
      const playerName = String(row.player_name ?? "")
        .trim()
        .toLowerCase();
      const seed = Number(row.seed);
      if (!playerName || !Number.isFinite(seed)) return accumulator;
      accumulator[playerName] = seed;
      return accumulator;
    }, {});
};

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
      if (!feederWinner || (feederWinner !== currentMatch.p1 && feederWinner !== currentMatch.p2))
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

const emptyTournamentMatch = (
  sourceMatch: TournamentMatch,
  roundName: string,
  order: number,
): TournamentMatch => ({
  tournament: sourceMatch.tournament,
  bracket: sourceMatch.bracket,
  round: roundName,
  order,
  id: `${sourceMatch.tournament}-${roundName.toLowerCase().replaceAll(" ", "-")}-m${order}`,
  match_id: "",
  p1: "",
  p2: "",
  s1: 0,
  s2: 0,
  winner_to: "",
  loser_to: "",
});

const addEmptyMainBracketRounds = (
  matches: TournamentMatch[],
  startRoundName: string | undefined,
): TournamentMatch[] => {
  if (!startRoundName) return matches;

  const augmented = matches.map((match) => ({ ...match }));
  const mainRounds = roundDisplayOrder["main"] ?? [];
  const startRoundIndex = mainRounds.indexOf(startRoundName);
  if (startRoundIndex < 0) return augmented;

  for (let roundIndex = startRoundIndex; roundIndex < mainRounds.length - 1; roundIndex += 1) {
    const roundName = mainRounds[roundIndex]!;
    const nextRoundName = mainRounds[roundIndex + 1]!;
    const roundMatches = augmented
      .filter((match) => match.bracket === "main" && match.round === roundName)
      .sort((left, right) => left.order - right.order);

    if (roundMatches.length <= 1) break;

    const expectedNextMatchCount = Math.ceil(roundMatches.length / 2);
    const nextRoundMatches = augmented
      .filter((match) => match.bracket === "main" && match.round === nextRoundName)
      .sort((left, right) => left.order - right.order);

    while (nextRoundMatches.length < expectedNextMatchCount) {
      const sourceMatch = roundMatches[nextRoundMatches.length * 2] ?? roundMatches[0];
      if (!sourceMatch) break;

      const nextMatch = emptyTournamentMatch(
        sourceMatch,
        nextRoundName,
        nextRoundMatches.length + 1,
      );
      nextRoundMatches.push(nextMatch);
      augmented.push(nextMatch);
    }

    roundMatches.forEach((match, matchIndex) => {
      const nextMatch = nextRoundMatches[Math.floor(matchIndex / 2)];
      if (!nextMatch) return;

      if (!match.winner_to) {
        match.winner_to = nextMatch.id;
      }

      const winner = winnerName(match);
      if (!winner) return;

      const targetPlayerKey = matchIndex % 2 === 0 ? "p1" : "p2";
      if (!nextMatch[targetPlayerKey]) {
        nextMatch[targetPlayerKey] = winner;
      }
    });
  }

  return augmented;
};

const fetchTournamentMatchRows = async (tournamentId: string): Promise<TournamentMatch[]> =>
  cachedRequest(tournamentMatchesCache, ["tournamentMatches", tournamentId], async () => {
    if (shouldUseLocalTournamentCsv()) {
      return fetchLocalTournamentRows(tournamentId);
    }

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
    if (shouldUseLocalTournamentCsv()) {
      return fetchLocalPlayerCountryMap();
    }

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
    if (shouldUseLocalTournamentCsv()) {
      return fetchLocalTournamentSeedMap(tournamentId);
    }

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

const getTournamentRoundLabel = (match: TournamentMatch): string => {
  if (match.bracket === "grand_final") {
    return match.round === "Reset" ? "Grand Final Reset" : "Grand Final";
  }

  const bracketLabel = getBracketLabel(match.bracket);
  if (!bracketLabel || match.bracket === "main") return match.round;
  return `${bracketLabel}, ${match.round}`;
};

const compareTournamentMatchesByBracketOrder = (
  left: TournamentMatch,
  right: TournamentMatch,
): number =>
  left.order - right.order ||
  bracketPriority(left.bracket) - bracketPriority(right.bracket) ||
  getRoundIndex(left.bracket, left.round) - getRoundIndex(right.bracket, right.round) ||
  left.id.localeCompare(right.id);

export const getTournamentMatchLocation = async (
  matchId: string,
): Promise<TournamentMatchLocation | null> => {
  const normalizedMatchId = String(matchId || "").trim();
  if (!normalizedMatchId) return null;

  return cachedRequest(
    tournamentMatchLocationCache,
    ["tournamentMatchLocation", normalizedMatchId],
    async () => {
      const rows = shouldUseLocalTournamentCsv()
        ? await fetchLocalTournamentRowsByMatchId(normalizedMatchId)
        : await loadSupabaseRows<TournamentMatchRowFromDb>(
            TOURNAMENT_MATCHES_TABLE,
            getSupabaseClient()
              .from(TOURNAMENT_MATCHES_TABLE)
              .select(TOURNAMENT_MATCHES_SELECT_COLUMNS)
              .eq("match_id", normalizedMatchId),
          );

      const match =
        rows
          .map(normalizeMatchRow)
          .filter((row) => row.match_id === normalizedMatchId)
          .sort(compareTournamentMatchesByBracketOrder)[0] ?? null;
      if (!match) return null;

      const tournament = getTournamentMeta(match.tournament);
      if (!tournament) return null;

      return {
        tournament,
        match,
        roundLabel: getTournamentRoundLabel(match),
      };
    },
  );
};

const hasDecisiveScore = (match: TournamentMatch | null | undefined): boolean =>
  Boolean(match?.p1 && match?.p2 && winnerName(match));

export const getTournamentDecisiveMatch = (
  bracket: { matches?: TournamentMatch[] } | null | undefined,
): TournamentMatch | null => {
  if (!bracket || !Array.isArray(bracket.matches)) return null;

  return (
    bracket.matches.find(
      (match) =>
        match.bracket === "grand_final" && match.round === "Reset" && hasDecisiveScore(match),
    ) ??
    bracket.matches.find(
      (match) =>
        match.bracket === "grand_final" && match.round === "Set 1" && hasDecisiveScore(match),
    ) ??
    bracket.matches.find(
      (match) =>
        match.bracket === "main" && match.round === "Grand Final Reset" && hasDecisiveScore(match),
    ) ??
    bracket.matches.find(
      (match) =>
        match.bracket === "main" && match.round === "Grand Final" && hasDecisiveScore(match),
    ) ??
    bracket.matches.find(
      (match) => match.bracket === "main" && match.round === "Finals" && hasDecisiveScore(match),
    ) ??
    null
  );
};

export const getTournamentChampion = (
  bracket: { matches?: TournamentMatch[] } | null | undefined,
): string => {
  const championshipMatch = getTournamentDecisiveMatch(bracket);
  return championshipMatch ? winnerName(championshipMatch) : "";
};

export const getTournamentBracket = async (
  tournamentId: string,
): Promise<TournamentBracket | null> =>
  cachedRequest(tournamentBracketCache, ["tournamentBracket", tournamentId], async () => {
    const meta = getTournamentMeta(tournamentId);
    if (!meta) return null;

    const [rawMatches, countryMap, seedMap] = await Promise.all([
      fetchTournamentMatchRows(meta.id),
      fetchPlayerCountryMap(),
      fetchTournamentSeedMap(meta.id),
    ]);

    const matches = addEmptyMainBracketRounds(
      addImplicitByeMatches(rawMatches),
      meta.completeMainBracketFromRound,
    ).sort(
      (left, right) =>
        bracketPriority(left.bracket) - bracketPriority(right.bracket) ||
        getRoundIndex(left.bracket, left.round) - getRoundIndex(right.bracket, right.round) ||
        left.order - right.order,
    );

    if (!matches.length) return null;

    const byId = new Map<string, TournamentMatch>(matches.map((match) => [match.id, match]));
    const championshipMatches = matches
      .filter((match) => match.bracket === "grand_final")
      .map((match): TournamentMatch => ({
        ...match,
        bracket: "main",
        round: match.round === "Set 1" ? "Grand Final" : "Grand Final Reset",
      }));

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
