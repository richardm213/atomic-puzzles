import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

import { apiRequest } from "../api/postApi";
import { getSupabaseClient } from "../supabase/client";
import { fetchAllSupabaseRows, loadSupabaseRows } from "../supabase/rows";

export type AtomicTourRanking = {
  snapshotDate: string;
  playerName: string;
  rank: number;
  points: number;
  rankChange: number | null;
  pointsChange: number;
};

export type AtomicTourEventEntry = {
  tournamentId: string;
  playerName: string;
  startRank: number | null;
  startPoints: number;
  pointsEarned: number;
};

export type AtomicTourPlayerRankingStats = {
  currentRank: number | null;
  currentRankChange: number | null;
  peakRank: number;
  peakRankDate: string;
};

type RankingRow = {
  snapshot_date?: string | null | undefined;
  player_name?: string | null | undefined;
  rank?: number | string | null | undefined;
  points?: number | string | null | undefined;
  rank_change?: number | string | null | undefined;
  points_change?: number | string | null | undefined;
};

const snapshotDatesResponseSchema = z.object({ snapshotDates: z.array(z.string()) });
const rankingsResponseSchema = z.object({
  rows: z.array(
    z.object({
      snapshot_date: z.string().nullable().optional(),
      player_name: z.string().nullable().optional(),
      rank: z.union([z.number(), z.string()]).nullable().optional(),
      points: z.union([z.number(), z.string()]).nullable().optional(),
      rank_change: z.union([z.number(), z.string()]).nullable().optional(),
      points_change: z.union([z.number(), z.string()]).nullable().optional(),
    }),
  ),
});
const fetchAtomicTourSnapshotDates = async (): Promise<string[]> =>
  (
    await apiRequest("/api/public-data?resource=atomic-tour-snapshot-dates", {
      schema: snapshotDatesResponseSchema,
      errorMessage: "Unable to load Atomic Tour ranking dates.",
      invalidMessage: "The Atomic Tour ranking service returned invalid data.",
    })
  ).snapshotDates;

export const summarizeAtomicTourPlayerRanking = (
  rows: RankingRow[],
  latestSnapshotDate: string,
): AtomicTourPlayerRankingStats | null => {
  const rankedRows = rows.flatMap((row) => {
    const snapshotDate = String(row.snapshot_date ?? "").trim();
    const rank = Number(row.rank);
    const rankChange =
      row.rank_change === null || row.rank_change === undefined ? null : Number(row.rank_change);
    return snapshotDate && Number.isFinite(rank) && rank > 0
      ? [
          {
            snapshotDate,
            rank,
            rankChange: Number.isFinite(rankChange) ? rankChange : null,
          },
        ]
      : [];
  });
  if (!rankedRows.length) return null;

  const currentRow = rankedRows
    .filter((row) => row.snapshotDate === latestSnapshotDate)
    .sort((left, right) => left.rank - right.rank)[0];
  const peakRank = Math.min(...rankedRows.map((row) => row.rank));
  const peakRankDate = rankedRows
    .filter((row) => row.rank === peakRank)
    .map((row) => row.snapshotDate)
    .sort()[0];
  return {
    currentRank: currentRow?.rank ?? null,
    currentRankChange: currentRow?.rankChange ?? null,
    peakRank,
    peakRankDate: peakRankDate ?? "",
  };
};

const normalizeRanking = (row: RankingRow): AtomicTourRanking | null => {
  const snapshotDate = String(row.snapshot_date ?? "").trim();
  const playerName = String(row.player_name ?? "").trim();
  const rank = Number(row.rank);
  const points = Number(row.points);
  if (!snapshotDate || !playerName || !Number.isFinite(rank) || !Number.isFinite(points))
    return null;
  const rankChange =
    row.rank_change === null || row.rank_change === undefined ? null : Number(row.rank_change);
  return {
    snapshotDate,
    playerName,
    rank,
    points,
    rankChange: Number.isFinite(rankChange) ? rankChange : null,
    pointsChange: Number(row.points_change) || 0,
  };
};

export const atomicTourSnapshotDatesQueryOptions = () =>
  queryOptions({
    queryKey: ["atomic-tour", "snapshot-dates"],
    queryFn: fetchAtomicTourSnapshotDates,
    staleTime: 5 * 60 * 1_000,
  });

export const atomicTourRankingsQueryOptions = (snapshotDate: string) =>
  queryOptions({
    queryKey: ["atomic-tour", "rankings", snapshotDate],
    queryFn: async () => {
      const result = await apiRequest(
        `/api/public-data?resource=atomic-tour-rankings&snapshotDate=${encodeURIComponent(snapshotDate)}`,
        {
          schema: rankingsResponseSchema,
          errorMessage: "Unable to load Atomic Tour rankings.",
          invalidMessage: "The Atomic Tour ranking service returned invalid data.",
        },
      );
      return result.rows
        .map(normalizeRanking)
        .filter((row): row is AtomicTourRanking => row !== null);
    },
    enabled: Boolean(snapshotDate),
    staleTime: 5 * 60 * 1_000,
  });

export const atomicTourPlayerRankingStatsQueryOptions = (playerNames: string[]) => {
  const normalizedNames = [
    ...new Set(playerNames.map((name) => name.trim().toLowerCase()).filter(Boolean)),
  ].sort();
  return queryOptions({
    queryKey: ["atomic-tour", "player-ranking-stats", ...normalizedNames],
    queryFn: async () => {
      if (!normalizedNames.length) return null;
      const [snapshotDates, playerRows] = await Promise.all([
        fetchAtomicTourSnapshotDates(),
        fetchAllSupabaseRows<RankingRow>("atomic_tour_ranking_snapshots", () =>
          getSupabaseClient()
            .from("atomic_tour_ranking_snapshots")
            .select("snapshot_date,player_name,rank,rank_change")
            .in("player_name", normalizedNames)
            .order("snapshot_date", { ascending: false }),
        ),
      ]);
      const latestSnapshotDate = snapshotDates[0] ?? "";
      return summarizeAtomicTourPlayerRanking(playerRows, latestSnapshotDate);
    },
    enabled: normalizedNames.length > 0,
    staleTime: 5 * 60 * 1_000,
  });
};

export const atomicTourEventEntriesQueryOptions = (playerNames: string[]) => {
  const normalizedNames = [
    ...new Set(playerNames.map((name) => name.trim().toLowerCase()).filter(Boolean)),
  ];
  return queryOptions({
    queryKey: ["atomic-tour", "event-entries", ...normalizedNames],
    queryFn: async () => {
      if (!normalizedNames.length) return [];
      const rows = await loadSupabaseRows<{
        tournament_id?: string | null;
        player_name?: string | null;
        start_rank?: number | string | null;
        start_points?: number | string | null;
        points_earned?: number | string | null;
      }>(
        "atomic_tour_event_entries",
        getSupabaseClient()
          .from("atomic_tour_event_entries")
          .select("tournament_id,player_name,start_rank,start_points,points_earned")
          .in("player_name", normalizedNames),
      );
      return rows.flatMap((row): AtomicTourEventEntry[] => {
        const tournamentId = String(row.tournament_id ?? "").trim();
        const playerName = String(row.player_name ?? "").trim();
        if (!tournamentId || !playerName) return [];
        const startRank =
          row.start_rank === null || row.start_rank === undefined ? null : Number(row.start_rank);
        return [
          {
            tournamentId,
            playerName,
            startRank: Number.isFinite(startRank) ? startRank : null,
            startPoints: Number(row.start_points) || 0,
            pointsEarned: Number(row.points_earned) || 0,
          },
        ];
      });
    },
    enabled: normalizedNames.length > 0,
    staleTime: 5 * 60 * 1_000,
  });
};
