import { createClient } from "@supabase/supabase-js";

import { queryArchiveResource } from "../netlify/archive/queries";
import { loadAllPages } from "../shared/lib/pagination";
import {
  atomicChessLeagueTourPoints,
  atomicTourEventPoints,
  type AtomicTourMainResult,
  type AtomicTourMainStage,
  atomicTourMainStageForResults,
  atomicTourPlacementAfterChampionship,
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

const excludedPlayers = new Set(["neverofzero", "thuban", "taisthuban", "jasos12"]);
const today = new Date().toISOString().slice(0, 10);
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
const addYears = (date: string, years: number): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCFullYear(value.getUTCFullYear() + years);
  return value.toISOString().slice(0, 10);
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
const matchDate = async (matchId: string | null, fallback: string): Promise<string> => {
  const normalizedId = normalizedArchiveId(matchId);
  if (!normalizedId) return fallback;
  const cached = archiveDates.get(normalizedId);
  if (cached) return cached;
  try {
    const result = (await queryArchiveResource(
      new URLSearchParams({ resource: "matches", matchId: normalizedId, pageSize: "1" }),
    )) as { rows?: Array<{ start_ts?: number | string }> };
    const timestamp = Number(result.rows?.[0]?.start_ts);
    const timestampMs = timestamp < 10_000_000_000 ? timestamp * 1_000 : timestamp;
    const date = new Date(timestampMs);
    const resolved = Number.isFinite(date.valueOf()) ? date.toISOString().slice(0, 10) : fallback;
    archiveDates.set(normalizedId, resolved);
    return resolved;
  } catch {
    return fallback;
  }
};

const expiryFor = (event: CatalogRow, awardedOn: string, awcEvents: CatalogRow[]): string => {
  if (event.series_key !== "awc") return addYears(awardedOn, 2);
  const futureAwcs = awcEvents.filter((candidate) => candidate.start_date > event.start_date);
  return futureAwcs[1]?.end_date ?? addYears(awardedOn, 2);
};

const awardKey = (...parts: string[]): string =>
  parts
    .map((part) => normalize(part).replaceAll(/[^a-z0-9_-]+/g, "-"))
    .filter(Boolean)
    .join(":");

const knockoutAwards = async (
  event: CatalogRow,
  matches: MatchRow[],
  awcEvents: CatalogRow[],
): Promise<PointAward[]> => {
  const tier = atomicTourEventPoints[event.series_key];
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
    let earnedStage = atomicTourMainStageForResults(eventFirstStage, mainResults);
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
    const awardedOn = await matchDate(latestSource?.match_id ?? null, fallbackDate);
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
      expires_on: expiryFor(event, awardedOn, awcEvents),
      points: pointBreakdown.basePoints,
      description: `${earnedStage.replaceAll("-", " ")} placement`,
    });
    if (pointBreakdown.bonusPoints > 0) {
      const latestLosersWin = losersWins.sort((left, right) => right.order - left.order)[0];
      const bonusDate = await matchDate(latestLosersWin?.match_id ?? null, fallbackDate);
      awards.push({
        award_key: awardKey(event.id, player, "losers-bonus"),
        tournament_id: event.id,
        player_name: player,
        source_type: "losers_win",
        source_key: "losers-bonus",
        awarded_on: bonusDate,
        expires_on: expiryFor(event, bonusDate, awcEvents),
        points: pointBreakdown.bonusPoints,
        description: `${losersWins.length} losers-bracket ${losersWins.length === 1 ? "win" : "wins"}`,
      });
    }
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
                expires_on: addYears(awardedOn, 2),
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
        expires_on: addYears(awardedOn, 2),
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

  const pageSize = 1_000;
  const matches = await loadAllPages(async (from, size) => {
    const { data, error } = await supabase
      .from("tournament_matches")
      .select("tournament,bracket,round,order,id,match_id,p1,p2,s1,s2,outcome_type")
      .range(from, from + size - 1);
    if (error) throw error;
    return data;
  }, pageSize);

  const events = new Map((catalog as CatalogRow[]).map((event) => [event.id, event]));
  const awcEvents = (catalog as CatalogRow[])
    .filter((event) => event.series_key === "awc")
    .sort((left, right) => left.start_date.localeCompare(right.start_date));
  const awards: PointAward[] = [];
  const participants = new Map<string, Set<string>>();
  for (const event of catalog as CatalogRow[]) {
    if (!["awc", "ccac", "ahc", "aoc"].includes(event.series_key)) continue;
    const eventMatches = matches.filter((match) => match.tournament === event.id);
    eventMatches.forEach((match) => {
      addParticipant(participants, event.id, match.p1);
      addParticipant(participants, event.id, match.p2);
    });
    awards.push(...(await knockoutAwards(event, eventMatches, awcEvents)));
  }
  for (const season of atomicChessLeagueSeasons) {
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
  awards.push(...(await aclAwards(events)));
  const wolfarena = events.get("wr-arena2026");
  const wolfarenaArchive = (
    archives as Array<{ tournament_id: string; payload: Record<string, unknown> }>
  ).find((archive) => archive.tournament_id === "wr-arena2026");
  if (wolfarena && wolfarenaArchive) {
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

  const { data: existingAwards, error: existingAwardsError } = await supabase
    .from("atomic_tour_point_awards")
    .select("award_key");
  if (existingAwardsError) throw existingAwardsError;
  const existingAwardKeys = (existingAwards as Array<{ award_key: string }>).map(
    ({ award_key }) => award_key,
  );
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

  const materialDateByMonth = new Map<string, string>();
  for (const award of awards) {
    for (const changeDate of [award.awarded_on, award.expires_on]) {
      if (changeDate > today) continue;
      const month = changeDate.slice(0, 7);
      const existingDate = materialDateByMonth.get(month);
      if (!existingDate || changeDate > existingDate) materialDateByMonth.set(month, changeDate);
    }
  }
  const snapshotDates = new Set(materialDateByMonth.values());
  snapshotDates.add(today);
  for (const snapshotDate of [...snapshotDates].sort()) {
    const { error } = await supabase.rpc("refresh_atomic_tour_ranking", {
      p_snapshot_date: snapshotDate,
    });
    if (error) throw error;
  }
  const { error: entriesError } = await supabase.rpc("refresh_atomic_tour_event_entries");
  if (entriesError) throw entriesError;
  const entryRows = [...participants].flatMap(([tournamentId, eventParticipants]) => {
    const event = events.get(tournamentId);
    if (!event) return [];
    const startPoints = new Map<string, number>();
    for (const award of awards) {
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
      points_earned: awards
        .filter((award) => award.tournament_id === tournamentId && award.player_name === playerName)
        .reduce((total, award) => total + award.points, 0),
    }));
  });
  const desiredEntryKeys = new Set(
    entryRows.map(({ tournament_id, player_name }) => `${tournament_id}:${player_name}`),
  );
  const staleEntriesByTournament = new Map<string, string[]>();
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("atomic_tour_event_entries")
      .select("tournament_id,player_name")
      .range(from, from + pageSize - 1);
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
    `Published ${awards.length} Atomic Tour point awards and ${snapshotDates.size} material snapshots; removed ${staleEntryCount} stale event entries.\n`,
  );
};

await run();
