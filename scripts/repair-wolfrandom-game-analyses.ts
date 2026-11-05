import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import {
  buildGameAnalysisSummary,
  type GameAnalysisSummary,
  ignoreInitialGameAnalysisPlies,
  type StoredAtomicDbPosition,
} from "../shared/domain/gameAnalysis";

const RANDOMIZED_PLIES = 6;
const APPLY = process.argv.includes("--apply");

type AnalysisRow = {
  game_id: string;
  status: "queued" | "processing" | "ready" | "failed";
  moves: unknown;
  position_fens: unknown;
  position_states: unknown;
  completed_positions: number;
  queued_positions: number;
  result: unknown;
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const skippedPosition = (fen: string): StoredAtomicDbPosition => ({
  fen,
  key: null,
  status: "SKIPPED",
  closure: "WOLFRANDOM_OPENING",
  score: null,
  point: null,
  bestMove: null,
  budgetNodes: null,
  lines: [],
  candidates: [],
});

const loadRows = async (): Promise<AnalysisRow[]> => {
  const supabase = createSupabaseClient(
    requiredEnvironment("VITE_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const rows: AnalysisRow[] = [];
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await supabase
      .from("game_analyses")
      .select(
        "game_id,status,moves,position_fens,position_states,completed_positions,queued_positions,result",
      )
      .order("game_id")
      .range(from, from + 999);
    if (error) throw new Error(`Unable to load game analyses: ${error.message}`);
    rows.push(...((data ?? []) as AnalysisRow[]));
    if ((data?.length ?? 0) < 1_000) break;
  }
  return rows;
};

const wolfrandomGameIds = async (): Promise<Set<string>> => {
  const result = new Set<string>();
  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `https://atomicpuzzles.org/api/archive-data?${new URLSearchParams({
        resource: "matches",
        mode: "wolfrandom",
        page: String(page),
        pageSize: "200",
      })}`,
    );
    if (!response.ok) throw new Error(`Archive API returned ${response.status}.`);
    const body = (await response.json()) as {
      rows?: Array<{ games?: unknown }>;
      hasNextPage?: boolean;
    };
    for (const match of body.rows ?? []) {
      if (!Array.isArray(match.games)) continue;
      for (const game of match.games) {
        const gameId =
          typeof game === "string"
            ? game.split(",")[0]
            : game && typeof game === "object" && typeof Reflect.get(game, "game_id") === "string"
              ? String(Reflect.get(game, "game_id"))
              : "";
        if (gameId) result.add(gameId);
      }
    }
    if (!body.hasNextPage) break;
  }
  return result;
};

const repairedActiveState = (row: AnalysisRow) => {
  if (!Array.isArray(row.position_fens)) return null;
  const existing = Array.isArray(row.position_states) ? row.position_states : [];
  const states = row.position_fens.map((value, index) => {
    const fen = typeof value === "string" ? value : "";
    if (!fen) return null;
    if (index < RANDOMIZED_PLIES) {
      return { fen, terminal: false, completed: true, data: skippedPosition(fen) };
    }
    const state = existing[index];
    return state && typeof state === "object"
      ? state
      : { fen, terminal: false, completed: false };
  });
  if (states.some((state) => state === null)) return null;
  const completedPositions = states.filter(
    (state) => state && typeof state === "object" && Reflect.get(state, "completed") === true,
  ).length;
  const queuedPositions = states.filter(
    (state) =>
      state &&
      typeof state === "object" &&
      (Reflect.get(state, "completed") === true ||
        typeof Reflect.get(state, "requestStatus") === "string"),
  ).length;
  return { states, completedPositions, queuedPositions };
};

const repairedSummary = (row: AnalysisRow): GameAnalysisSummary | null => {
  if (!row.result || typeof row.result !== "object" || !Array.isArray(row.moves)) return null;
  const result = row.result as Partial<GameAnalysisSummary>;
  if (!Array.isArray(result.positions) || result.positions.length !== row.moves.length + 1) {
    return null;
  }
  const moves = row.moves.filter((move): move is string => typeof move === "string");
  if (moves.length !== row.moves.length) return null;
  const positions = result.positions.map((position, index) =>
    index < RANDOMIZED_PLIES ? skippedPosition(position.fen) : position,
  );
  return ignoreInitialGameAnalysisPlies(buildGameAnalysisSummary(moves, positions), RANDOMIZED_PLIES);
};

const main = async (): Promise<void> => {
  const rows = await loadRows();
  const wolfrandomIds = await wolfrandomGameIds();
  const wolfrandomRows = rows.filter((row) => wolfrandomIds.has(row.game_id));
  const ready = wolfrandomRows.filter((row) => row.status === "ready");
  const active = wolfrandomRows.filter(
    (row) => row.status === "queued" || row.status === "processing",
  );
  const failed = wolfrandomRows.filter((row) => row.status === "failed");
  const repairable = ready.flatMap((row) => {
    const result = repairedSummary(row);
    return result ? [{ row, result }] : [];
  });

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        totalAnalyses: rows.length,
        wolfrandom: wolfrandomRows.length,
        ready: ready.length,
        repairableReady: repairable.length,
        active: active.length,
        failed: failed.length,
      },
      null,
      2,
    ),
  );
  if (!APPLY) return;

  const supabase = createSupabaseClient(
    requiredEnvironment("VITE_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  for (const { row, result } of repairable) {
    const { error } = await supabase
      .from("game_analyses")
      .update({ result, position_states: [], updated_at: new Date().toISOString() })
      .eq("game_id", row.game_id)
      .eq("status", "ready");
    if (error) throw new Error(`Unable to repair ${row.game_id}: ${error.message}`);
  }

  for (const row of active) {
    const repaired = repairedActiveState(row);
    if (!repaired) throw new Error(`Unable to repair active state for ${row.game_id}.`);
    const { error } = await supabase
      .from("game_analyses")
      .update({
        position_states: repaired.states,
        completed_positions: repaired.completedPositions,
        queued_positions: repaired.queuedPositions,
        updated_at: new Date().toISOString(),
        next_check_at: new Date().toISOString(),
      })
      .eq("game_id", row.game_id)
      .in("status", ["queued", "processing"]);
    if (error) throw new Error(`Unable to repair active job ${row.game_id}: ${error.message}`);
  }
  console.log(
    `Repaired ${repairable.length} ready analyses and reset ${active.length} active jobs for processing.`,
  );
};

await main();
