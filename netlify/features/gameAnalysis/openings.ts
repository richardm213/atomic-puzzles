import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fillStoredAtomicDbVariations,
  GAME_ANALYSIS_VARIATION_SIZE,
  gameAnalysisOpeningFens,
  gameAnalysisOpeningKey,
  isGameAnalysisOpeningReference,
  mergeGameAnalysisOpenings,
  parseStoredAtomicDbVariationBundle,
  unavailableGameAnalysisOpening,
  type PersistedGameAnalysisSummary,
  type StoredAtomicDbPosition,
} from "../../../shared/domain/gameAnalysis";
import { queryAtomicDbPrincipalVariations } from "../../lib/atomicDb";

const OPENING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

type OpeningRow = { fen_key: string; data: StoredAtomicDbPosition; fetched_at: string };

export const loadGameAnalysisOpenings = async (
  supabase: SupabaseClient,
  openingKeys: Iterable<string>,
): Promise<Map<string, OpeningRow>> => {
  const keys = [...new Set(openingKeys)];
  const openings = new Map<string, OpeningRow>();
  for (let start = 0; start < keys.length; start += 50) {
    const { data, error } = await supabase
      .from("game_analysis_openings")
      .select("fen_key,data,fetched_at")
      .in("fen_key", keys.slice(start, start + 50));
    if (error) throw new Error(`Unable to load opening evaluations: ${error.message}`);
    for (const row of (data ?? []) as OpeningRow[]) openings.set(row.fen_key, row);
  }
  return openings;
};

export const queryGameAnalysisVariations = async (
  fen: string,
  signal: AbortSignal,
  fetchResponse?: typeof fetch,
) => {
  const size = GAME_ANALYSIS_VARIATION_SIZE;
  const bundle = await queryAtomicDbPrincipalVariations(fen, size, size, signal, fetchResponse);
  return bundle ? parseStoredAtomicDbVariationBundle(fen, bundle) : null;
};

export const openingEvaluationData = (
  openings: ReadonlyMap<string, OpeningRow>,
): Map<string, StoredAtomicDbPosition> =>
  new Map([...openings].map(([key, row]) => [key, fillStoredAtomicDbVariations(row.data)]));

export const hydrateGameAnalysisPositions = async (
  supabase: SupabaseClient,
  result: PersistedGameAnalysisSummary,
) => {
  const keys = result.positions.flatMap((position) => {
    if (isGameAnalysisOpeningReference(position)) return [position.openingKey];
    const key = position.status === "SKIPPED" ? null : gameAnalysisOpeningKey(position.fen);
    return key ? [key] : [];
  });
  const openings = await loadGameAnalysisOpenings(supabase, keys);
  return mergeGameAnalysisOpenings(result.positions, openingEvaluationData(openings));
};

export const refreshGameAnalysisOpenings = async (
  supabase: SupabaseClient,
  fetchPosition?: (fen: string) => Promise<StoredAtomicDbPosition | null>,
) => {
  const catalog = gameAnalysisOpeningFens();
  const openings = await loadGameAnalysisOpenings(supabase, catalog.keys());
  const cutoff = Date.now() - OPENING_MAX_AGE_MS;
  let refreshed = 0;
  let unavailable = 0;
  let failed = 0;
  let nextRequestAt = 0;
  for (const [key, fen] of catalog) {
    const existing = openings.get(key);
    if (existing && Date.parse(existing.fetched_at) >= cutoff) continue;
    try {
      // The scheduled worker is sequential and stays under AtomicDB's per-address limit.
      // The maintenance backfill supplies its own shared throttle and retry handling.
      if (!fetchPosition) {
        const delay = nextRequestAt - Date.now();
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        nextRequestAt = Date.now() + 250;
      }
      const position = await (fetchPosition
        ? fetchPosition(fen)
        : queryGameAnalysisVariations(fen, AbortSignal.timeout(20_000)));
      if (!position) unavailable += 1;
      const row = {
        fen_key: key,
        // A 404 is a completed lookup, but should not erase the last usable result.
        data: position ?? existing?.data ?? unavailableGameAnalysisOpening(fen),
        fetched_at: new Date().toISOString(),
      };
      const { error } = existing
        ? await supabase
            .from("game_analysis_openings")
            .update(row)
            .eq("fen_key", key)
            .eq("fetched_at", existing.fetched_at)
        : await supabase
            .from("game_analysis_openings")
            .upsert(row, { onConflict: "fen_key", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      refreshed += 1;
    } catch (error) {
      failed += 1;
      console.error(`Unable to refresh opening ${key}:`, error);
    }
  }
  return { catalog: catalog.size, refreshed, unavailable, failed };
};
