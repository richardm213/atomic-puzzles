import process from "node:process";

export default async (request: Request): Promise<void> => {
  const secret = process.env.GAME_ANALYSIS_WORKER_SECRET?.trim() ?? "";
  if (!secret) return;
  const origin = new URL(request.url).origin;
  const response = await fetch(`${origin}/api/game-analysis-sweep-worker-background`, {
    method: "POST",
    headers: {
      "X-Game-Analysis-Worker": secret,
      "X-Game-Analysis-Task": "refresh-openings",
    },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Unable to dispatch opening refresh: ${response.status}`);
};

// Check hourly so each position becomes eligible as soon as its own seven-day TTL expires.
export const config = { schedule: "23 * * * *" } as const;
