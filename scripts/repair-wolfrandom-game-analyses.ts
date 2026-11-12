import { createClient } from "@supabase/supabase-js";

import {
  hydrateGameAnalysisPositions,
  queryGameAnalysisVariations,
} from "../netlify/features/gameAnalysis/openings";
import {
  gameAnalysisPositionStates,
  isCompletedAtomicDbPosition,
} from "../netlify/features/gameAnalysis/service";
import {
  alignGameAnalysisPositionFens,
  applyGameAnalysisOpeningReview,
  buildGameAnalysisSummary,
  gameAnalysisPositionKey,
  isGameAnalysisOpeningReference,
  type PersistedGameAnalysisSummary,
  referenceGameAnalysisOpenings,
  type StoredAtomicDbPosition,
  WOLFRANDOM_RANDOMIZED_PLIES,
} from "../shared/domain/gameAnalysis";

const APPLY = process.argv.includes("--apply");
const BOUNDARY = WOLFRANDOM_RANDOMIZED_PLIES;
const url = process.env.VITE_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url?.includes("arkicplonaruvmhhvwxd") || !key) {
  throw new Error("Configure the current Supabase database and service-role key.");
}
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, options) =>
      fetch(input, { ...options, signal: options?.signal ?? AbortSignal.timeout(15_000) }),
  },
});

type AnalysisRow = {
  game_id: string;
  status: "queued" | "processing" | "ready";
  updated_at: string;
  moves: string[];
  position_fens: string[];
  position_states: unknown;
  result: PersistedGameAnalysisSummary | null;
};

const pendingPatch = (row: AnalysisRow) => {
  const states = gameAnalysisPositionStates(row.position_fens, row.position_states, BOUNDARY);
  return {
    status: "processing",
    position_states: states,
    completed_positions: states.filter((state) => state.completed).length,
    queued_positions: states.filter((state) => state.completed || state.requestStatus).length,
    error: null,
    next_check_at: new Date().toISOString(),
  };
};

// Bound the expensive JSON inspection by indexed game IDs. Scanning every large
// saved result in one query can time out even when the database is healthy.
const affectedBatches = async function* () {
  for (let from = 0; ; from += 1_000) {
    const { data: ids, error: idsError } = await db
      .from("game_analyses")
      .select("game_id")
      .in("status", ["ready", "queued", "processing"])
      .order("game_id")
      .range(from, from + 999);
    if (idsError) throw new Error(idsError.message);
    for (let start = 0; start < (ids?.length ?? 0); start += 20) {
      const batch = ids.slice(start, start + 20).map(({ game_id }) => game_id);
      const { data, error } = await db
        .from("game_analyses")
        .select("game_id,status,updated_at,moves,position_fens,position_states,result")
        .in("game_id", batch)
        .or(
          `and(status.eq.ready,result->positions->${BOUNDARY}->>closure.eq.WOLFRANDOM_OPENING),and(status.in.(queued,processing),position_states->${BOUNDARY}->data->>closure.eq.WOLFRANDOM_OPENING)`,
        );
      if (error) throw new Error(`Unable to inspect Wolfrandom analyses: ${error.message}`);
      yield (data ?? []) as AnalysisRow[];
    }
    if ((ids?.length ?? 0) < 1_000) return;
  }
};

let affected = 0;
for await (const rows of affectedBatches()) {
  affected += rows.length;
  if (!APPLY) continue;
  for (const row of rows) {
    const fen = row.position_fens[BOUNDARY];
    if (!fen || row.position_fens.length !== row.moves.length + 1) {
      throw new Error(`Invalid saved game: ${row.game_id}`);
    }
    let patch: Record<string, unknown>;
    if (row.status === "ready") {
      if (!row.result) throw new Error(`Missing saved review: ${row.game_id}`);
      const positions = await hydrateGameAnalysisPositions(db, {
        ...row.result,
        positions: alignGameAnalysisPositionFens(row.result.positions, row.position_fens),
      });
      const { data: cached, error: cacheError } = await db
        .from("game_analysis_positions")
        .select("data")
        .eq("fen_key", gameAnalysisPositionKey(fen))
        .eq("completed", true)
        .maybeSingle();
      if (cacheError) throw new Error(cacheError.message);
      const replacement: StoredAtomicDbPosition | null =
        cached?.data?.variationPlies === 5
          ? { ...cached.data, fen }
          : await queryGameAnalysisVariations(fen, AbortSignal.timeout(20_000));
      if (
        replacement &&
        replacement.status !== "SKIPPED" &&
        isCompletedAtomicDbPosition(replacement)
      ) {
        positions[BOUNDARY] = replacement;
        const result = applyGameAnalysisOpeningReview(
          buildGameAnalysisSummary(row.moves, positions),
          { wolfrandom: true },
        );
        const openings = new Map(
          row.result.positions.flatMap((position, index) =>
            isGameAnalysisOpeningReference(position)
              ? [[position.openingKey, positions[index]!] as const]
              : [],
          ),
        );
        patch = { result: referenceGameAnalysisOpenings(result, openings), position_states: [] };
      } else {
        // Keep every evaluated position. The normal worker requests only the missing boundary,
        // using the original paid job rather than charging for another analysis.
        row.position_states = positions.map((data) => ({
          fen: data.fen,
          data,
          completed: true,
          terminal: data.closure === "TERMINAL",
        }));
        patch = pendingPatch(row);
      }
    } else {
      patch = pendingPatch(row);
    }
    const { data: saved, error: saveError } = await db
      .from("game_analyses")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("game_id", row.game_id)
      .eq("updated_at", row.updated_at)
      .select("game_id,status");
    if (saveError || saved?.length !== 1) {
      throw new Error(
        `Unable to repair ${row.game_id}: ${saveError?.message ?? "job changed concurrently"}`,
      );
    }
    console.log(JSON.stringify(saved[0]));
  }
}

console.log(JSON.stringify({ apply: APPLY, affected }));
