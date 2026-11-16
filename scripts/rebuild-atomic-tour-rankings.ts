import { createClient } from "@supabase/supabase-js";

import { queryArchiveResource } from "../netlify/archive/queries";
import {
  type CatalogRow,
  knockoutAwards,
  type PointAward,
} from "../shared/domain/atomicTourAwards";
import { loadAllPages } from "../shared/lib/pagination";
import {
  atomicChessLeagueTourPoints,
  atomicTourAwardExpiryDate,
  atomicTourMonthlySnapshotDates,
  atomicTourQualifierAwardChanges,
  atomicTourQualifierSnapshotRefreshDates,
  atomicTourStageForFinalRank,
  atomicTourStagePoints,
} from "../src/lib/atomicTour/scoring";
import {
  atomicChessLeagueSeasons,
  getAtomicChessLeaguePlayerName,
} from "../src/lib/matches/atomicChessLeague";

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
    awards.push(...(await knockoutAwards(event, eventMatches, seededPlayers, today, matchDate)));
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
