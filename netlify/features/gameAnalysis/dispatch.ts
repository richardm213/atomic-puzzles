import process from "node:process";

let lastDispatch = 0;
let inFlight: Promise<void> | null = null;

export const dispatchGameAnalysisWorker = async (): Promise<void> => {
  const token = process.env.GAME_ANALYSIS_GITHUB_TOKEN?.trim();
  if (!token || Date.now() - lastDispatch < 30_000) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const response = await fetch(
        "https://api.github.com/repos/richardm213/atomic-puzzles/actions/workflows/game-analysis.yml/dispatches",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({ ref: "main", inputs: { task: "workers" } }),
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!response.ok) throw new Error(`GitHub dispatch returned HTTP ${response.status}`);
      lastDispatch = Date.now();
    } catch (error) {
      // The purchased job is already durable. Scheduled GitHub runs recover a missed wake-up.
      console.error("Unable to wake GitHub game analysis workers:", error);
    }
  })();
  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
};
