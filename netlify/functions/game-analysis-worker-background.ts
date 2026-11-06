import process from "node:process";

import { processGameAnalysisJob } from "../features/gameAnalysis/service";

export default async (request: Request): Promise<void> => {
  const secret = process.env.GAME_ANALYSIS_WORKER_SECRET?.trim() ?? "";
  if (!secret || request.headers.get("X-Game-Analysis-Worker") !== secret) return;
  const value: unknown = await request.json().catch(() => null);
  const gameId =
    value && typeof value === "object" && typeof Reflect.get(value, "gameId") === "string"
      ? String(Reflect.get(value, "gameId")).trim()
      : "";
  if (!gameId || gameId.length > 160) return;
  await processGameAnalysisJob(gameId);
};

export const config = {
  background: true,
  path: "/api/game-analysis-worker-background",
} as const;
