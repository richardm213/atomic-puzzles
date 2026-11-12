import { createServerSupabase } from "../../platform/environment";
import { refreshGameAnalysisOpenings } from "./openings";
import {
  hasPendingGameAnalyses,
  processPendingGameAnalyses,
  submitPendingGameAnalysisPositions,
} from "./service";

export type GameAnalysisWorkerTask = "poll" | "submit" | "openings";

export const runGameAnalysisWorker = async (
  task: GameAnalysisWorkerTask,
  { once = false, durationMs = 20 * 60_000, intervalMs = 60_000 } = {},
): Promise<void> => {
  if (task === "openings") {
    console.info(
      "Opening evaluation refresh",
      await refreshGameAnalysisOpenings(createServerSupabase("Opening refresh")),
    );
    return;
  }
  if (!(await hasPendingGameAnalyses())) return;
  const deadline = Date.now() + durationMs;
  const processQueue =
    task === "poll" ? processPendingGameAnalyses : submitPendingGameAnalysisPositions;
  while (Date.now() < deadline) {
    await processQueue();
    if (once || !(await hasPendingGameAnalyses())) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
  }
};
