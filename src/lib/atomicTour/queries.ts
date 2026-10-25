import { queryOptions } from "@tanstack/react-query";

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

type RankingRow = {
  snapshot_date?: string | null;
  player_name?: string | null;
  rank?: number | string | null;
  points?: number | string | null;
  rank_change?: number | string | null;
  points_change?: number | string | null;
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
    queryFn: async () => {
      const rows = await fetchAllSupabaseRows<{ snapshot_date?: string | null }>(
        "atomic_tour_ranking_snapshots",
        () =>
          getSupabaseClient()
            .from("atomic_tour_ranking_snapshots")
            .select("snapshot_date")
            .order("snapshot_date", { ascending: false }),
      );
      return [
        ...new Set(rows.map((row) => String(row.snapshot_date ?? "").trim()).filter(Boolean)),
      ];
    },
    staleTime: 5 * 60 * 1_000,
  });

export const atomicTourRankingsQueryOptions = (snapshotDate: string) =>
  queryOptions({
    queryKey: ["atomic-tour", "rankings", snapshotDate],
    queryFn: async () => {
      const rows = await loadSupabaseRows<RankingRow>(
        "atomic_tour_ranking_snapshots",
        getSupabaseClient()
          .from("atomic_tour_ranking_snapshots")
          .select("snapshot_date,player_name,rank,points,rank_change,points_change")
          .eq("snapshot_date", snapshotDate)
          .order("rank", { ascending: true })
          .order("player_name", { ascending: true }),
      );
      return rows.map(normalizeRanking).filter((row): row is AtomicTourRanking => row !== null);
    },
    enabled: Boolean(snapshotDate),
    staleTime: 5 * 60 * 1_000,
  });

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
