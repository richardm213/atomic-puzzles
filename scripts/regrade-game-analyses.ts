import { isDeepStrictEqual } from "node:util";

import { createServerSupabase } from "../netlify/platform/environment";
import {
  applyGameAnalysisOpeningReview,
  buildGameAnalysisSummary,
  type GameAnalysisSummary,
} from "../shared/domain/gameAnalysis";

const APPLY = process.argv.includes("--apply");
const PAGE_SIZE = 50;
const WRITE_CONCURRENCY = 8;

type AnalysisRow = {
  game_id: string;
  updated_at: string;
  moves: unknown;
  result: unknown;
};

const supabase = createServerSupabase("Saved game analysis regrader");

const readyPages = async function* (): AsyncGenerator<AnalysisRow[]> {
  let lastId: string | null = null;
  for (;;) {
    const query = supabase
      .from("game_analyses")
      .select("game_id,updated_at,moves,result")
      .eq("status", "ready")
      .order("game_id")
      .limit(PAGE_SIZE);
    const { data, error } = await (lastId === null ? query : query.gt("game_id", lastId));
    if (error) throw new Error(`Unable to load game analyses: ${error.message}`);
    const rows = (data ?? []) as AnalysisRow[];
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < PAGE_SIZE) return;
    lastId = rows.at(-1)!.game_id;
  }
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
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!response.ok) throw new Error(`Archive API returned ${response.status}.`);
    const body = (await response.json()) as {
      rows?: Array<{ games?: unknown }>;
      hasNextPage?: boolean;
    };
    if (!Array.isArray(body.rows) || typeof body.hasNextPage !== "boolean") {
      throw new Error("Archive API did not return a complete Wolfrandom page.");
    }
    for (const match of body.rows) {
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
  if (result.size === 0) throw new Error("The Wolfrandom archive returned no game IDs.");
  return result;
};

const rebuildResult = (row: AnalysisRow, wolfrandomIds: ReadonlySet<string>) => {
  const result = row.result as Partial<GameAnalysisSummary> | null;
  const moves = row.moves as unknown[];
  if (
    !Array.isArray(moves) ||
    !moves.every((move): move is string => typeof move === "string") ||
    !Array.isArray(result?.positions) ||
    result.positions.length !== moves.length + 1
  ) {
    throw new Error(`Saved moves and positions do not match for ${row.game_id}.`);
  }
  const wolfrandom =
    wolfrandomIds.has(row.game_id) ||
    result.positions.some(({ closure }) => closure === "WOLFRANDOM_OPENING");
  const regraded = applyGameAnalysisOpeningReview(
    buildGameAnalysisSummary(moves, result.positions),
    { wolfrandom },
  );
  return { wolfrandom, result: { ...result, ...regraded } };
};

const updateResult = async (row: AnalysisRow, result: GameAnalysisSummary): Promise<void> => {
  const { data, error } = await supabase
    .from("game_analyses")
    .update({ result, updated_at: new Date().toISOString() })
    .eq("game_id", row.game_id)
    .eq("status", "ready")
    .eq("updated_at", row.updated_at)
    .select("game_id")
    .maybeSingle();
  if (error) throw new Error(`Unable to regrade ${row.game_id}: ${error.message}`);
  if (!data) throw new Error(`Analysis ${row.game_id} changed during the backfill; rerun it.`);
};

const scan = async (wolfrandomIds: ReadonlySet<string>, apply: boolean) => {
  const totals = { ready: 0, wolfrandom: 0, changed: 0 };
  for await (const rows of readyPages()) {
    const changed = rows.flatMap((row) => {
      const { wolfrandom, result } = rebuildResult(row, wolfrandomIds);
      if (wolfrandom) totals.wolfrandom += 1;
      // Compare the JSON that is actually stored: JSONB round-trips a signed zero as zero.
      const persisted = JSON.parse(JSON.stringify(result)) as GameAnalysisSummary;
      return isDeepStrictEqual(row.result, persisted) ? [] : [{ row, result: persisted }];
    });
    if (apply) {
      for (let start = 0; start < changed.length; start += WRITE_CONCURRENCY) {
        await Promise.all(
          changed
            .slice(start, start + WRITE_CONCURRENCY)
            .map(({ row, result }) => updateResult(row, result)),
        );
      }
    }
    totals.ready += rows.length;
    totals.changed += changed.length;
    if (totals.ready % 250 === 0) {
      console.log(`${apply ? "Processed" : "Checked"} ${totals.ready} saved reviews.`);
    }
  }
  return totals;
};

const main = async (): Promise<void> => {
  const wolfrandomIds = await wolfrandomGameIds();
  const totals = await scan(wolfrandomIds, APPLY);
  console.log(JSON.stringify({ apply: APPLY, ...totals }));
  if (!APPLY) return;

  const verified = await scan(wolfrandomIds, false);
  if (verified.changed > 0 || verified.ready < totals.ready) {
    throw new Error(`Read-back verification failed: ${JSON.stringify(verified)}`);
  }
  console.log(`Verified ${verified.ready} saved reviews; none need regrading.`);
};

await main();
