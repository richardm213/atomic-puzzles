import process from "node:process";

import { submitPendingGameAnalysisPositions } from "../features/gameAnalysis/service";

export default async (request: Request): Promise<void> => {
  const secret = process.env.GAME_ANALYSIS_WORKER_SECRET?.trim() ?? "";
  if (!secret || request.headers.get("X-Game-Analysis-Worker") !== secret) return;
  await submitPendingGameAnalysisPositions();
};

export const config = {
  background: true,
  path: "/api/game-analysis-submit-worker-background",
} as const;
