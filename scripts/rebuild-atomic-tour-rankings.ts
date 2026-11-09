import { createClient } from "@supabase/supabase-js";

import { queryArchiveResource } from "../netlify/archive/queries";
import { loadAllPages } from "../shared/lib/pagination";
import {
  atomicChessLeagueTourPoints,
  atomicTourAwardExpiryDate,
  atomicTourEventPoints,
  type AtomicTourMainResult,
  type AtomicTourMainStage,
  atomicTourMainStageForResults,
  atomicTourMonthlySnapshotDates,
  atomicTourPlacementAfterChampionship,
  atomicTourQualifierAwardChanges,
  atomicTourQualifierSnapshotRefreshDates,
  atomicTourQualifierWinEarnsPoints,
  atomicTourQualifierWinPoints,
  atomicTourStageForFinalRank,
  atomicTourStageForRound,
  atomicTourStagePoints,
  calculateKnockoutTourPoints,
} from "../src/lib/atomicTour/scoring";
import {
  atomicChessLeagueSeasons,
  getAtomicChessLeaguePlayerName,
} from "../src/lib/matches/atomicChessLeague";

type CatalogRow = {
  id: string;
  series_key: string;
  start_date: string;
  end_date: string | null;
};

type MatchRow = {
  tournament: string;
  bracket: string;
  round: string;
  order: number;
  id: string;
  match_id: string | null;
  played_on: string | null;
  p1: string | null;
  p2: string | null;
  s1: number;
  s2: number;
  outcome_type?: string | null;
};

type PointAward = {
  award_key: string;
  tournament_id: string;
  player_name: string;
  source_type: "placement" | "losers_win" | "acl_win" | "acl_draw" | "arena_placement";
  source_key: string;
  awarded_on: string;
  expires_on: string;
  points: number;
  description: string;
};

type PointAwardSummary = Pick<
  PointAward,
  "tournament_id" | "player_name" | "awarded_on" | "expires_on" | "points"
>;

const excludedPlayers = new Set(["neverofzero", "thuban", "taisthuban", "jasos12"]);
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const requestedEventId =
  process.argv
    .find((argument) => argument.startsWith("--event="))
    ?.slice("--event=".length)
    .trim() ?? "";
const normalize = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();
const score = (value: unknown): number => Number(value) || 0;
const addParticipant = (
  participants: Map<string, Set<string>>,
  tournamentId: string,
  value: unknown,
) => {
  const player = normalize(value);
  if (!player || player === "bye" || excludedPlayers.has(player)) return;
  const eventParticipants = participants.get(tournamentId) ?? new Set<string>();
  eventParticipants.add(player);
  participants.set(tournamentId, eventParticipants);
};
const isChampionshipMatch = (match: MatchRow): boolean =>
  match.bracket === "grand_final" || match.round.trim().toLowerCase().includes("grand final");

const stageOrder: AtomicTourMainStage[] = [
  "entered",
  "round-of-64",
  "round-of-32",
  "round-of-16",
  "quarterfinal",
  "semifinal",
  "winners-final",
  "final",
  "champion",
];

const laterStage = (left: AtomicTourMainStage, right: AtomicTourMainStage): AtomicTourMainStage =>
  stageOrder.indexOf(left) >= stageOrder.indexOf(right) ? left : right;

const losersRoundOrder = (round: string): number => {
  const normalized = round.trim().toLowerCase();
  const numberedRound = normalized.match(/round\s+(\d+)/);
  if (numberedRound) return Number(numberedRound[1]);
  if (normalized.includes("quarterfinal")) return 100;
  if (normalized.includes("semifinal")) return 101;
  if (normalized.includes("final")) return 102;
  return 0;
};

const qualifierRoundOrder = (round: string): number => {
  const normalized = round.trim().toLowerCase();
  if (normalized === "first round") return 1;
  if (normalized === "second round") return 2;
  if (normalized === "qualifying round") return 3;
  const numberedRound = normalized.match(/(?:qualifying\s+)?round\s+(\d+)/);
  return numberedRound ? Number(numberedRound[1]) : 100;
};

const winner = (match: MatchRow): string => {
  if (score(match.s1) > score(match.s2)) return normalize(match.p1);
  if (score(match.s2) > score(match.s1)) return normalize(match.p2);
  return "";
};

const isBonusEligibleResult = (match: MatchRow): boolean => {
  const playerOne = normalize(match.p1);
  const playerTwo = normalize(match.p2);
  return Boolean(
    playerOne && playerTwo && playerOne !== "bye" && playerTwo !== "bye" && winner(match),
  );
};

const normalizedArchiveId = (value: string | null): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.split("/").filter(Boolean).at(-1) ?? raw;
};

const archiveDates = new Map<string, string>();
const archiveDateFromPublicApi = async (matchId: string): Promise<number> => {
  const response = await fetch(
    `https://atomicpuzzles.org/api/archive-data?${new URLSearchParams({
      resource: "matches",
      matchId,
      pageSize: "1",
    })}`,
  );
  if (!response.ok) throw new Error(`Archive API returned ${response.status}`);
  const result = (await response.json()) as { rows?: Array<{ start_ts?: number | string }> };
  return Number(result.rows?.[0]?.start_ts);
};

const matchDate = async (matchId: string | null, fallback: string): Promise<string> => {
  const normalizedId = normalizedArchiveId(matchId);
  if (!normalizedId) return fallback;
  const cached = archiveDates.get(normalizedId);
  if (cached) return cached;
  try {
    let timestamp: number;
    try {
      const result = (await queryArchiveResource(
        new URLSearchParams({ resource: "matches", matchId: normalizedId, pageSize: "1" }),
      )) as { rows?: Array<{ start_ts?: number | string }> };
      timestamp = Number(result.rows?.[0]?.start_ts);
      if (!Number.isFinite(timestamp)) timestamp = await archiveDateFromPublicApi(normalizedId);
    } catch {
      timestamp = await archiveDateFromPublicApi(normalizedId);
    }
    const timestampMs = timestamp < 10_000_000_000 ? timestamp * 1_000 : timestamp;
    const date = new Date(timestampMs);
    const resolved = Number.isFinite(date.valueOf()) ? date.toISOString().slice(0, 10) : fallback;
    archiveDates.set(normalizedId, resolved);
    return resolved;
  } catch {
    return fallback;
  }
};

const awardKey = (...parts: string[]): string =>
  parts
    .map((part) => normalize(part).replaceAll(/[^a-z0-9_-]+/g, "-"))
    .filter(Boolean)
    .join(":");

const knockoutAwards = async (
  event: CatalogRow,
  matches: MatchRow[],
  seededPlayers: ReadonlySet<string>,
): Promise<PointAward[]> => {
  const tier = atomicTourEventPoints[event.id] ?? atomicTourEventPoints[event.series_key];
  if (!tier) return [];
  const fallbackDate = event.end_date ?? today;
  const playerStages = new Map<string, AtomicTourMainStage>();
  const playerMainMatches = new Map<string, MatchRow[]>();
  const allMainMatches = matches.filter(
    (match) => match.bracket === "main" || match.bracket === "grand_final",
  );
  const championshipMatches = allMainMatches.filter(isChampionshipMatch);
  const playedChampionshipMatches = championshipMatches
    .filter((match) => winner(match))
    .sort((left, right) => {
      const leftIsReset = /reset/i.test(`${left.round} ${left.id}`);
      const rightIsReset = /reset/i.test(`${right.round} ${right.id}`);
      return Number(leftIsReset) - Number(rightIsReset) || left.order - right.order;
    });
  const championshipDecider = playedChampionshipMatches.at(-1);
  const hasChampionshipMatch = championshipMatches.length > 0;
  const losersRounds = [
    ...new Set(
      matches
        .filter((match) => match.bracket === "losers")
        .map((match) => match.round.trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => losersRoundOrder(left) - losersRoundOrder(right));
  const mainMatches = allMainMatches.filter((match) => !isChampionshipMatch(match));
  const eventFirstStage = mainMatches.reduce<AtomicTourMainStage>((firstStage, match) => {
    const matchStage = atomicTourStageForRound(match.round, hasChampionshipMatch);
    return stageOrder.indexOf(matchStage) < stageOrder.indexOf(firstStage)
      ? matchStage
      : firstStage;
  }, "champion");
  const losersBracketPlayers = new Set(
    matches
      .filter((match) => match.bracket === "losers")
      .flatMap((match) => [normalize(match.p1), normalize(match.p2)])
      .filter((player) => player && player !== "bye"),
  );
  const losersBracketStartStage = mainMatches.reduce<AtomicTourMainStage | null>(
    (earliestStage, match) => {
      const matchWinner = winner(match);
      if (!matchWinner) return earliestStage;
      const playerOne = normalize(match.p1);
      const playerTwo = normalize(match.p2);
      const matchLoser = matchWinner === playerOne ? playerTwo : playerOne;
      if (!losersBracketPlayers.has(matchLoser)) return earliestStage;
      const feederStage = atomicTourStageForRound(match.round, hasChampionshipMatch);
      if (!earliestStage) return feederStage;
      return stageOrder.indexOf(feederStage) < stageOrder.indexOf(earliestStage)
        ? feederStage
        : earliestStage;
    },
    null,
  );

  mainMatches.forEach((match) => {
    [match.p1, match.p2]
      .map(normalize)
      .filter(Boolean)
      .forEach((player) => {
        if (player === "bye") return;
        playerStages.set(
          player,
          laterStage(
            playerStages.get(player) ?? "entered",
            atomicTourStageForRound(match.round, hasChampionshipMatch),
          ),
        );
        const current = playerMainMatches.get(player) ?? [];
        current.push(match);
        playerMainMatches.set(player, current);
      });
  });
  championshipMatches.forEach((match) => {
    [match.p1, match.p2]
      .map(normalize)
      .filter((player) => player && player !== "bye")
      .forEach((player) => {
        if (!playerStages.has(player)) playerStages.set(player, "final");
      });
  });

  const awards: PointAward[] = [];
  for (const [player] of playerStages) {
    if (excludedPlayers.has(player)) continue;
    const sourceMatches = playerMainMatches.get(player) ?? [];
    const playerChampionshipMatches = championshipMatches.filter(
      (match) => normalize(match.p1) === player || normalize(match.p2) === player,
    );
    const mainResults = sourceMatches.flatMap<AtomicTourMainResult>((match) => {
      const playerOne = normalize(match.p1);
      const playerTwo = normalize(match.p2);
      const opponent = playerOne === player ? playerTwo : playerOne;
      if (!opponent || opponent === "bye") {
        return [
          {
            stage: atomicTourStageForRound(match.round, hasChampionshipMatch),
            outcome: "bye" as const,
          },
        ];
      }
      const matchWinner = winner(match);
      if (!matchWinner) return [];
      return [
        {
          stage: atomicTourStageForRound(match.round, hasChampionshipMatch),
          outcome: matchWinner === player ? ("win" as const) : ("loss" as const),
        },
      ];
    });
    const hasSeededRoundOf32Bye =
      event.id === "awc2026" &&
      seededPlayers.has(player) &&
      sourceMatches.some(
        (match) =>
          atomicTourStageForRound(match.round) === "round-of-32" &&
          [normalize(match.p1), normalize(match.p2)].includes("bye") &&
          winner(match) === player,
      ) &&
      sourceMatches.some(
        (match) =>
          atomicTourStageForRound(match.round) === "round-of-16" &&
          isBonusEligibleResult(match) &&
          winner(match) !== player &&
          score(match.s1) + score(match.s2) > 1 &&
          !match.outcome_type,
      );
    let earnedStage = atomicTourMainStageForResults(
      eventFirstStage,
      mainResults,
      hasSeededRoundOf32Bye,
    );
    if (
      championshipDecider &&
      [normalize(championshipDecider.p1), normalize(championshipDecider.p2)].includes(player)
    ) {
      earnedStage = atomicTourPlacementAfterChampionship(
        earnedStage,
        winner(championshipDecider) === player ? "win" : "loss",
      );
    }
    if (!earnedStage) continue;
    const latestSource = [...sourceMatches, ...playerChampionshipMatches]
      .filter((match) => {
        const playerOne = normalize(match.p1);
        const opponent = playerOne === player ? normalize(match.p2) : playerOne;
        return opponent && opponent !== "bye" && winner(match);
      })
      .sort(
        (left, right) =>
          stageOrder.indexOf(atomicTourStageForRound(right.round, hasChampionshipMatch)) -
            stageOrder.indexOf(atomicTourStageForRound(left.round, hasChampionshipMatch)) ||
          right.order - left.order,
      )[0];
    const awardedOn = latestSource?.played_on ?? fallbackDate;
    const losersWins = matches.filter(
      (match) =>
        match.bracket === "losers" && isBonusEligibleResult(match) && winner(match) === player,
    );
    const pointBreakdown = calculateKnockoutTourPoints({
      tier,
      mainStage: earnedStage,
      losersBracketWinRounds: losersWins.map((match) =>
        Math.max(0, losersRounds.indexOf(match.round.trim())),
      ),
      losersBracketStartStage: losersBracketStartStage ?? "round-of-64",
    });
    awards.push({
      award_key: awardKey(event.id, player, "placement"),
      tournament_id: event.id,
      player_name: player,
      source_type: "placement",
      source_key: "placement",
      awarded_on: awardedOn,
      expires_on: atomicTourAwardExpiryDate(awardedOn),
      points: pointBreakdown.basePoints,
      description: `${earnedStage.replaceAll("-", " ")} placement`,
    });
    if (pointBreakdown.bonusPoints > 0) {
      const latestLosersWin = losersWins.sort((left, right) => right.order - left.order)[0];
      const bonusDate = latestLosersWin?.played_on ?? fallbackDate;
      awards.push({
        award_key: awardKey(event.id, player, "losers-bonus"),
        tournament_id: event.id,
        player_name: player,
        source_type: "losers_win",
        source_key: "losers-bonus",
        awarded_on: bonusDate,
        expires_on: atomicTourAwardExpiryDate(bonusDate),
        points: pointBreakdown.bonusPoints,
        description: `${losersWins.length} losers-bracket ${losersWins.length === 1 ? "win" : "wins"}`,
      });
    }
  }

  const qualifierMatches = matches.filter((match) => match.bracket === "qualifying");
  const qualifierRounds = [
    ...new Set(qualifierMatches.map((match) => match.round.trim()).filter(Boolean)),
  ].sort((left, right) => qualifierRoundOrder(left) - qualifierRoundOrder(right));
  const firstRoundWinners = new Set(
    qualifierMatches
      .filter(
        (match) =>
          match.round.trim() === qualifierRounds[0] &&
          normalize(match.outcome_type) !== "withdrawal",
      )
      .map(winner),
  );
  for (const match of qualifierMatches) {
    if (!isBonusEligibleResult(match)) continue;
    const player = winner(match);
    if (!player || excludedPlayers.has(player)) continue;
    const roundIndex = Math.max(0, qualifierRounds.indexOf(match.round.trim()));
    if (
      !atomicTourQualifierWinEarnsPoints({
        seriesKey: event.series_key,
        roundIndex,
        outcomeType: match.outcome_type,
        wonPlayedFirstRound: firstRoundWinners.has(player),
      })
    )
      continue;
    const awardedOn =
      match.played_on ||
      (event.series_key === "awc" ? await matchDate(match.match_id, "") : fallbackDate);
    if (!awardedOn) {
      console.warn(`Skipping undated AWC qualifier award: ${event.id}/${match.id}`);
      continue;
    }
    const roundsRemaining = qualifierRounds.length - roundIndex;
    awards.push({
      award_key: awardKey(event.id, player, "qualifier-win", match.id),
      tournament_id: event.id,
      player_name: player,
      source_type: "placement",
      source_key: match.id,
      awarded_on: awardedOn,
      expires_on: atomicTourAwardExpiryDate(awardedOn),
      points: atomicTourQualifierWinPoints(
        tier,
        roundIndex,
        qualifierRounds.length,
        event.series_key,
      ),
      description:
        event.series_key === "a960e"
          ? "group-stage win"
          : `qualifier win, ${roundsRemaining} ${
              roundsRemaining === 1 ? "round" : "rounds"
            } from main draw`,
    });
  }
  return awards;
};

const aclAwards = async (events: Map<string, CatalogRow>): Promise<PointAward[]> => {
  const awards: PointAward[] = [];
  for (const season of atomicChessLeagueSeasons) {
    const event = events.get(`acl-s${season.number}`);
    if (!event) continue;
    for (const division of season.divisions) {
      for (const round of division.rounds) {
        for (const matchup of round.matchups) {
          for (const board of matchup.boards) {
            const playerOne = normalize(getAtomicChessLeaguePlayerName(board.player1));
            const playerTwo = normalize(getAtomicChessLeaguePlayerName(board.player2));
            const playerOneScore = Number(board.score1);
            const playerTwoScore = Number(board.score2);
            if (
              !playerOne ||
              !playerTwo ||
              !Number.isFinite(playerOneScore) ||
              !Number.isFinite(playerTwoScore)
            )
              continue;
            const result = playerOneScore === playerTwoScore ? "draw" : "win";
            const winningPlayers =
              result === "draw"
                ? [playerOne, playerTwo]
                : [playerOneScore > playerTwoScore ? playerOne : playerTwo];
            const points = atomicChessLeagueTourPoints(division.id, result);
            const awardedOn = await matchDate(board.matchId ?? null, event.end_date ?? today);
            for (const player of winningPlayers) {
              if (excludedPlayers.has(player) || points <= 0) continue;
              const sourceKey = `round-${round.number}-${board.timeControl}-${playerOne}-${playerTwo}`;
              awards.push({
                award_key: awardKey(event.id, player, sourceKey),
                tournament_id: event.id,
                player_name: player,
                source_type: result === "draw" ? "acl_draw" : "acl_win",
                source_key: sourceKey,
                awarded_on: awardedOn,
                expires_on: atomicTourAwardExpiryDate(awardedOn),
                points,
                description: `${division.name} round ${round.number} ${result}`,
              });
            }
          }
        }
      }
    }
  }
  return awards;
};

const wolfarenaAwards = (event: CatalogRow, payload: Record<string, unknown>): PointAward[] => {
  const rounds = Array.isArray(payload.rounds) ? payload.rounds : [];
  const lastRound = rounds.at(-1) as { date?: string; standings?: unknown[] } | undefined;
  const standings = Array.isArray(lastRound?.standings) ? lastRound.standings : [];
  const awardedOn = String(lastRound?.date ?? event.end_date ?? today);
  return standings.flatMap((raw): PointAward[] => {
    const standing = raw as { player?: unknown; rank?: unknown };
    const player = normalize(standing.player);
    const rank = Number(standing.rank);
    const stage = atomicTourStageForFinalRank(rank);
    if (!player || excludedPlayers.has(player) || !stage) return [];
    return [
      {
        award_key: awardKey(event.id, player, "placement"),
        tournament_id: event.id,
        player_name: player,
        source_type: "arena_placement",
        source_key: "placement",
        awarded_on: awardedOn,
        expires_on: atomicTourAwardExpiryDate(awardedOn),
        points: atomicTourStagePoints(1000, stage),
        description: `Final rank ${rank}`,
      },
    ];
  });
};

const requireEnvironment = (name: string): string => {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const run = async () => {
  const supabase = createClient(
    requireEnvironment("VITE_SUPABASE_URL"),
    requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  const [{ data: catalog, error: catalogError }, { data: archives, error: archivesError }] =
    await Promise.all([
      supabase.from("tournament_catalog").select("id,series_key,start_date,end_date"),
      supabase.from("tournament_archives").select("tournament_id,payload"),
    ]);
  if (catalogError) throw catalogError;
  if (archivesError) throw archivesError;

  const seededPlayers = new Set<string>();
  if (!requestedEventId || requestedEventId === "awc2026") {
    const { data: seeds, error } = await supabase
      .from("tournament_seeds")
      .select("player_name")
      .eq("tournament", "awc2026");
    if (error) throw error;
    for (const seed of seeds) seededPlayers.add(normalize(seed.player_name));
  }

  const pageSize = 1_000;
  const matches = await loadAllPages(async (from, size) => {
    const { data, error } = await supabase
      .from("tournament_matches")
      .select("tournament,bracket,round,order,id,match_id,played_on,p1,p2,s1,s2,outcome_type")
      .range(from, from + size - 1);
    if (error) throw error;
    return data;
  }, pageSize);

  const events = new Map((catalog as CatalogRow[]).map((event) => [event.id, event]));
  if (requestedEventId && !events.has(requestedEventId)) {
    throw new Error(`Unknown Atomic Tour event: ${requestedEventId}`);
  }
  const awards: PointAward[] = [];
  const participants = new Map<string, Set<string>>();
  for (const event of catalog as CatalogRow[]) {
    if (requestedEventId && event.id !== requestedEventId) continue;
    if (!["awc", "ccac", "ahc", "aoc", "a960e", "a960wc"].includes(event.series_key)) continue;
    const eventMatches = matches.filter((match) => match.tournament === event.id);
    eventMatches.forEach((match) => {
      addParticipant(participants, event.id, match.p1);
      addParticipant(participants, event.id, match.p2);
    });
    awards.push(...(await knockoutAwards(event, eventMatches, seededPlayers)));
  }
  for (const season of requestedEventId ? [] : atomicChessLeagueSeasons) {
    const tournamentId = `acl-s${season.number}`;
    for (const division of season.divisions) {
      for (const round of division.rounds) {
        for (const matchup of round.matchups) {
          for (const board of matchup.boards) {
            addParticipant(
              participants,
              tournamentId,
              getAtomicChessLeaguePlayerName(board.player1),
            );
            addParticipant(
              participants,
              tournamentId,
              getAtomicChessLeaguePlayerName(board.player2),
            );
          }
        }
      }
    }
  }
  if (!requestedEventId) awards.push(...(await aclAwards(events)));
  const wolfarena = events.get("wr-arena2026");
  const wolfarenaArchive = (
    archives as Array<{ tournament_id: string; payload: Record<string, unknown> }>
  ).find((archive) => archive.tournament_id === "wr-arena2026");
  if (!requestedEventId && wolfarena && wolfarenaArchive) {
    const rounds = Array.isArray(wolfarenaArchive.payload.rounds)
      ? wolfarenaArchive.payload.rounds
      : [];
    const lastRound = rounds.at(-1) as { standings?: unknown[] } | undefined;
    const standings = Array.isArray(lastRound?.standings) ? lastRound.standings : [];
    standings.forEach((raw) =>
      addParticipant(participants, wolfarena.id, (raw as { player?: unknown }).player),
    );
    awards.push(...wolfarenaAwards(wolfarena, wolfarenaArchive.payload));
  }

  let existingAwardsQuery = supabase
    .from("atomic_tour_point_awards")
    .select("award_key,awarded_on,expires_on,points,description");
  if (requestedEventId)
    existingAwardsQuery = existingAwardsQuery.eq("tournament_id", requestedEventId);
  const { data: existingAwards, error: existingAwardsError } = await existingAwardsQuery;
  if (existingAwardsError) throw existingAwardsError;
  const existingAwardKeys = existingAwards.map(({ award_key }) => award_key);
  let eventSnapshotDates = [today];
  if (events.get(requestedEventId)?.series_key === "awc") {
    const isQualifier = (award: { description: string }) =>
      award.description.startsWith("qualifier win,");
    const changes = atomicTourQualifierAwardChanges(
      existingAwards.filter(isQualifier),
      awards.filter(isQualifier),
    );
    if (changes.length) {
      const snapshots = await loadAllPages(async (from, size) => {
        const { data, error } = await supabase
          .from("atomic_tour_ranking_snapshots")
          .select("snapshot_date")
          .order("snapshot_date")
          .order("player_name")
          .range(from, from + size - 1);
        if (error) throw error;
        return data;
      }, pageSize);
      eventSnapshotDates = atomicTourQualifierSnapshotRefreshDates(
        changes,
        [...new Set(snapshots.map(({ snapshot_date }) => snapshot_date))],
        today,
      );
    }
  }
  for (let offset = 0; offset < existingAwardKeys.length; offset += 200) {
    const { error } = await supabase
      .from("atomic_tour_point_awards")
      .delete()
      .in("award_key", existingAwardKeys.slice(offset, offset + 200));
    if (error) throw error;
  }
  for (let offset = 0; offset < awards.length; offset += 500) {
    const { error } = await supabase
      .from("atomic_tour_point_awards")
      .insert(awards.slice(offset, offset + 500));
    if (error) throw error;
  }

  const snapshotDates = requestedEventId
    ? eventSnapshotDates
    : atomicTourMonthlySnapshotDates(
        awards.flatMap(({ awarded_on, expires_on }) => [awarded_on, expires_on]),
        today,
      );
  if (!requestedEventId) {
    while (true) {
      const { data: existingSnapshots, error: existingSnapshotsError } = await supabase
        .from("atomic_tour_ranking_snapshots")
        .select("snapshot_date")
        .limit(1_000);
      if (existingSnapshotsError) throw existingSnapshotsError;
      const existingSnapshotDates = [
        ...new Set(
          (existingSnapshots as Array<{ snapshot_date: string }>).map(
            ({ snapshot_date }) => snapshot_date,
          ),
        ),
      ];
      if (!existingSnapshotDates.length) break;
      const { error } = await supabase
        .from("atomic_tour_ranking_snapshots")
        .delete()
        .in("snapshot_date", existingSnapshotDates);
      if (error) throw error;
    }
  }
  for (const snapshotDate of snapshotDates) {
    const { error } = await supabase.rpc("refresh_atomic_tour_ranking", {
      p_snapshot_date: snapshotDate,
    });
    if (error) throw error;
  }
  if (!requestedEventId) {
    const { error: entriesError } = await supabase.rpc("refresh_atomic_tour_event_entries");
    if (entriesError) throw entriesError;
  }
  const rankingAwards: PointAwardSummary[] = requestedEventId
    ? await loadAllPages(async (from, size) => {
        const { data, error } = await supabase
          .from("atomic_tour_point_awards")
          .select("tournament_id,player_name,awarded_on,expires_on,points")
          .range(from, from + size - 1);
        if (error) throw error;
        return data;
      }, pageSize)
    : awards;
  const entryRows = [...participants].flatMap(([tournamentId, eventParticipants]) => {
    const event = events.get(tournamentId);
    if (!event) return [];
    const startPoints = new Map<string, number>();
    for (const award of rankingAwards) {
      if (award.awarded_on >= event.start_date || award.expires_on < event.start_date) continue;
      startPoints.set(award.player_name, (startPoints.get(award.player_name) ?? 0) + award.points);
    }
    const startRanks = new Map<string, number>();
    [...startPoints.entries()]
      .filter(([, points]) => points > 0)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .forEach(([player, points], index, ranked) => {
        const rank =
          index > 0 && ranked[index - 1]?.[1] === points
            ? startRanks.get(ranked[index - 1]![0])!
            : index + 1;
        startRanks.set(player, rank);
      });
    return [...eventParticipants].map((playerName) => ({
      tournament_id: tournamentId,
      player_name: playerName,
      start_rank: startRanks.get(playerName) ?? null,
      start_points: startPoints.get(playerName) ?? 0,
      points_earned: rankingAwards
        .filter((award) => award.tournament_id === tournamentId && award.player_name === playerName)
        .reduce((total, award) => total + award.points, 0),
    }));
  });
  const desiredEntryKeys = new Set(
    entryRows.map(({ tournament_id, player_name }) => `${tournament_id}:${player_name}`),
  );
  const staleEntriesByTournament = new Map<string, string[]>();
  for (let from = 0; ; from += pageSize) {
    let existingEntriesQuery = supabase
      .from("atomic_tour_event_entries")
      .select("tournament_id,player_name")
      .range(from, from + pageSize - 1);
    if (requestedEventId) {
      existingEntriesQuery = existingEntriesQuery.eq("tournament_id", requestedEventId);
    }
    const { data, error } = await existingEntriesQuery;
    if (error) throw error;
    const page = data as Array<{ tournament_id: string; player_name: string }>;
    page.forEach(({ tournament_id: tournamentId, player_name: playerName }) => {
      if (desiredEntryKeys.has(`${tournamentId}:${playerName}`)) return;
      const stalePlayers = staleEntriesByTournament.get(tournamentId) ?? [];
      stalePlayers.push(playerName);
      staleEntriesByTournament.set(tournamentId, stalePlayers);
    });
    if (page.length < pageSize) break;
  }
  for (const [tournamentId, stalePlayers] of staleEntriesByTournament) {
    for (let offset = 0; offset < stalePlayers.length; offset += 200) {
      const { error } = await supabase
        .from("atomic_tour_event_entries")
        .delete()
        .eq("tournament_id", tournamentId)
        .in("player_name", stalePlayers.slice(offset, offset + 200));
      if (error) throw error;
    }
  }
  const staleEntryCount = [...staleEntriesByTournament.values()].reduce(
    (total, players) => total + players.length,
    0,
  );
  for (let offset = 0; offset < entryRows.length; offset += 500) {
    const { error } = await supabase
      .from("atomic_tour_event_entries")
      .upsert(entryRows.slice(offset, offset + 500), {
        onConflict: "tournament_id,player_name",
      });
    if (error) throw error;
  }
  process.stdout.write(
    requestedEventId
      ? `Updated ${requestedEventId} with ${awards.length} point awards; refreshed ${snapshotDates.length} monthly ranking snapshots and removed ${staleEntryCount} stale event entries.\n`
      : `Published ${awards.length} Atomic Tour point awards and ${snapshotDates.length} material snapshots; removed ${staleEntryCount} stale event entries.\n`,
  );
};

await run();
