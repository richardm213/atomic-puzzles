import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import {
  GAME_ANALYSIS_INITIAL_REVIEW_PLIES,
  type GameAnalysisSummary,
  ignoreInitialGameAnalysisPlies,
} from "../shared/domain/gameAnalysis";

const APPLY = process.argv.includes("--apply");

type AnalysisRow = {
  game_id: string;
  result: unknown;
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const client = () =>
  createSupabaseClient(
    requiredEnvironment("VITE_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

const loadReadyRows = async (): Promise<AnalysisRow[]> => {
  const supabase = client();
  const rows: AnalysisRow[] = [];
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await supabase
      .from("game_analyses")
      .select("game_id,result")
      .eq("status", "ready")
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

const summaryFrom = (value: unknown): GameAnalysisSummary | null => {
  if (!value || typeof value !== "object") return null;
  const summary = value as Partial<GameAnalysisSummary>;
  if (!Array.isArray(summary.assessments) || !Array.isArray(summary.evaluations)) return null;
  return value as GameAnalysisSummary;
};

const hasStandardOpeningReview = (summary: GameAnalysisSummary): boolean => {
  const normalized = ignoreInitialGameAnalysisPlies(summary, GAME_ANALYSIS_INITIAL_REVIEW_PLIES);
  return (
    summary.assessments
      .slice(0, GAME_ANALYSIS_INITIAL_REVIEW_PLIES)
      .every(({ classification }) => classification === "best") &&
    summary.whiteAverageCentipawnLoss === normalized.whiteAverageCentipawnLoss &&
    summary.blackAverageCentipawnLoss === normalized.blackAverageCentipawnLoss
  );
};

const main = async (): Promise<void> => {
  const [rows, wolfrandomIds] = await Promise.all([loadReadyRows(), wolfrandomGameIds()]);
  const repairable = rows.flatMap((row) => {
    if (wolfrandomIds.has(row.game_id)) return [];
    const summary = summaryFrom(row.result);
    return summary && !hasStandardOpeningReview(summary)
      ? [
          {
            row,
            result: ignoreInitialGameAnalysisPlies(summary, GAME_ANALYSIS_INITIAL_REVIEW_PLIES),
          },
        ]
      : [];
  });

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        readyAnalyses: rows.length,
        excludedWolfrandom: rows.filter((row) => wolfrandomIds.has(row.game_id)).length,
        repairableStandard: repairable.length,
      },
      null,
      2,
    ),
  );
  if (!APPLY) return;

  const supabase = client();
  for (const { row, result } of repairable) {
    const { error } = await supabase
      .from("game_analyses")
      .update({ result, updated_at: new Date().toISOString() })
      .eq("game_id", row.game_id)
      .eq("status", "ready");
    if (error) throw new Error(`Unable to repair ${row.game_id}: ${error.message}`);
  }

  const verifiedRows = await loadReadyRows();
  const invalid = verifiedRows.filter((row) => {
    if (wolfrandomIds.has(row.game_id)) return false;
    const summary = summaryFrom(row.result);
    return !summary || !hasStandardOpeningReview(summary);
  });
  if (invalid.length > 0) {
    throw new Error(`${invalid.length} standard analyses failed read-back verification.`);
  }
  console.log(`Repaired and verified ${repairable.length} standard game analyses.`);
};

await main();
