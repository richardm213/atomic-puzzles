import { z } from "zod";

import { tournamentMatchColumns } from "../../shared/domain/tournamentMatchColumns";
import { defineFunction, type FunctionEvent } from "../platform/defineFunction";
import { createServerSupabase } from "../platform/environment";
import { HttpError } from "../platform/errors";
import { jsonResponse } from "../platform/response";

const resourceSchema = z.enum([
  "atomic-tour-rankings",
  "atomic-tour-snapshot-dates",
  "puzzle-catalog",
  "puzzle-ranking-trophies",
  "puzzle-solver-index",
  "tournament-bracket",
  "tournament-player-matches",
]);
const puzzleSetFields = "id,event_name,event_date,players,source_id";
const puzzleCatalogColumns = [
  "id",
  "author",
  "created_at",
  "players",
  "puzzle_set_id",
  `puzzle_set:puzzle_sets!puzzles_puzzle_set_id_fkey(${puzzleSetFields})`,
  `puzzle_set_memberships(puzzle_set_id,is_primary,puzzle_set:puzzle_sets(${puzzleSetFields}))`,
  "white_player",
  "black_player",
  "tags",
  "opa_style",
  "rating_state:puzzle_ratings!puzzle_ratings_puzzle_id_fkey(rating,rating_deviation,attempts,successes,computed_level,human_level,human_rated_by,human_rated_at,updated_at)",
].join(",");
const cacheHeaders = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=300, stale-while-revalidate=3600",
};

const bracketCacheHeaders = {
  "Cache-Control": "public, max-age=15, stale-while-revalidate=60",
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=30, stale-while-revalidate=60",
};
const tournamentIdSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);
const tournamentPlayersSchema = z.array(z.string().min(1).max(100)).min(1).max(32);

const publicDataRoute = async (event: FunctionEvent) => {
  const parsed = resourceSchema.safeParse(event.queryStringParameters?.resource);
  if (!parsed.success) throw new HttpError(400, "Choose a valid public data resource.");
  const supabase = createServerSupabase("Public data service");

  if (parsed.data === "tournament-bracket" || parsed.data === "tournament-player-matches") {
    const isBracket = parsed.data === "tournament-bracket";
    const makeQuery = () => {
      if (isBracket) {
        const id = tournamentIdSchema.safeParse(event.queryStringParameters?.tournamentId);
        if (!id.success) throw new HttpError(400, "Choose a valid tournament.");
        return supabase
          .from("tournament_matches")
          .select(`${tournamentMatchColumns},scheduled_at`)
          .eq("tournament", id.data)
          .order("id");
      }
      let players: unknown;
      try {
        players = JSON.parse(event.queryStringParameters?.players ?? "");
      } catch {
        throw new HttpError(400, "Choose valid tournament players.");
      }
      const parsedPlayers = tournamentPlayersSchema.safeParse(players);
      if (!parsedPlayers.success) throw new HttpError(400, "Choose valid tournament players.");
      return supabase
        .rpc("get_tournament_player_matches", { p_players: parsedPlayers.data })
        .select(tournamentMatchColumns)
        .order("tournament")
        .order("id");
    };
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1_000) {
      const { data, error } = await makeQuery().range(from, from + 999);
      if (error) throw new Error(`Unable to load tournament matches: ${error.message}`);
      if (data !== null && !Array.isArray(data))
        throw new Error("The database returned invalid tournament matches.");
      const page = Array.isArray(data) ? data : [];
      rows.push(...page);
      if (page.length < 1_000) break;
    }
    return jsonResponse(200, { rows }, bracketCacheHeaders);
  }

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
    const query = (() => {
      if (parsed.data === "atomic-tour-snapshot-dates") {
        return supabase
          .from("atomic_tour_ranking_snapshots")
          .select("snapshot_date")
          .order("snapshot_date", { ascending: false });
      }
      if (parsed.data === "puzzle-catalog") {
        return supabase
          .from("puzzles")
          .select(puzzleCatalogColumns)
          .is("deleted_at", null)
          .order("id");
      }
      return supabase
        .from("puzzles")
        .select("id,author,created_at")
        .is("deleted_at", null)
        .order("id");
    })();
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
