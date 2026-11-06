import process from "node:process";

import { processPendingGameAnalyses } from "../features/gameAnalysis/service";

export default async (request: Request): Promise<void> => {
  const secret = process.env.GAME_ANALYSIS_WORKER_SECRET?.trim() ?? "";
  if (!secret || request.headers.get("X-Game-Analysis-Worker") !== secret) return;
  await processPendingGameAnalyses();
};

export const config = {
  background: true,
  path: "/api/game-analysis-sweep-worker-background",
} as const;
