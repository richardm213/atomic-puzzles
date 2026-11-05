import process from "node:process";

export default async (request: Request): Promise<void> => {
  const secret = process.env.GAME_ANALYSIS_WORKER_SECRET?.trim() ?? "";
  if (!secret) return;
  const origin = new URL(request.url).origin;
  await fetch(`${origin}/api/game-analysis-submit-worker`, {
    method: "POST",
    headers: { "X-Game-Analysis-Worker": secret },
    signal: AbortSignal.timeout(5_000),
  });
};

export const config = { schedule: "*/15 * * * *" } as const;
