import { z } from "zod";

import { defineFunction, type FunctionEvent } from "../platform/defineFunction";
import { createServerSupabase } from "../platform/environment";
import { HttpError } from "../platform/errors";
import { jsonResponse } from "../platform/response";

const resourceSchema = z.enum([
  "atomic-tour-rankings",
  "atomic-tour-snapshot-dates",
  "puzzle-ranking-trophies",
  "puzzle-solver-index",
]);
const cacheHeaders = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=300, stale-while-revalidate=3600",
};

const publicDataRoute = async (event: FunctionEvent) => {
  const parsed = resourceSchema.safeParse(event.queryStringParameters?.resource);
  if (!parsed.success) throw new HttpError(400, "Choose a valid public data resource.");
  const supabase = createServerSupabase("Public data service");

  if (parsed.data === "puzzle-ranking-trophies") {
    const { data, error } = await supabase.rpc("get_puzzle_ranking_trophies");
    if (error) throw new Error(`Unable to load puzzle ranking trophies: ${error.message}`);
    const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      username: String(row.username ?? "")
        .trim()
        .toLowerCase(),
      month: String(row.month ?? ""),
      rank: Number(row.rank),
      eligible: Boolean(row.eligible),
      rating: Number(row.rating),
      ratingDeviation: Number(row.rating_deviation),
      attempted: Number(row.attempted),
      correct: Number(row.correct),
    }));
    return jsonResponse(200, { rows }, cacheHeaders);
  }

  if (parsed.data === "atomic-tour-rankings") {
    const snapshotDate = event.queryStringParameters?.snapshotDate?.trim() ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
      throw new HttpError(400, "Choose a valid Atomic Tour snapshot date.");
    }
    const { data, error } = await supabase
      .from("atomic_tour_ranking_snapshots")
      .select("snapshot_date,player_name,rank,points,rank_change,points_change")
      .eq("snapshot_date", snapshotDate)
      .order("rank", { ascending: true })
      .order("player_name", { ascending: true });
    if (error) throw new Error(`Unable to load Atomic Tour rankings: ${error.message}`);
    return jsonResponse(200, { rows: data ?? [] }, cacheHeaders);
  }

  const rows: Record<string, unknown>[] = [];
  const pageSize = 1_000;
  for (let from = 0; ; from += pageSize) {
    const query =
      parsed.data === "atomic-tour-snapshot-dates"
        ? supabase
            .from("atomic_tour_ranking_snapshots")
            .select("snapshot_date")
            .order("snapshot_date", { ascending: false })
        : supabase.from("puzzles").select("id").order("id");
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`Unable to load public data: ${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  if (parsed.data === "atomic-tour-snapshot-dates") {
    const snapshotDates = [
      ...new Set(rows.map((row) => String(row.snapshot_date ?? "").trim()).filter(Boolean)),
    ];
    return jsonResponse(200, { snapshotDates }, cacheHeaders);
  }
  return jsonResponse(200, { rows }, cacheHeaders);
};

export const handler = defineFunction(publicDataRoute, {
  methods: ["GET"],
  fallbackMessage: "Unable to load public data.",
});

export const config = {
  path: "/api/public-data",
  rateLimit: { windowLimit: 300, windowSize: 60, aggregateBy: ["ip", "domain"] },
} as const;
