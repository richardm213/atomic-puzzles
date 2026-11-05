import process from "node:process";

import { hasPendingGameAnalyses } from "../features/gameAnalysis/service";

export default async (request: Request): Promise<void> => {
  const secret = process.env.GAME_ANALYSIS_WORKER_SECRET?.trim() ?? "";
  if (!secret) return;
  if (!(await hasPendingGameAnalyses())) return;
  const origin = new URL(request.url).origin;
  await fetch(`${origin}/api/game-analysis-sweep-worker`, {
    method: "POST",
    headers: { "X-Game-Analysis-Worker": secret },
    signal: AbortSignal.timeout(5_000),
  });
};

export const config = { schedule: "* * * * *" } as const;
