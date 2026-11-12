import { runGameAnalysisWorker } from "../netlify/features/gameAnalysis/worker";

const task = process.argv[2];
if (task !== "poll" && task !== "submit" && task !== "openings") {
  throw new Error("Choose a game-analysis task: poll, submit, or openings.");
}
const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
if (url !== "https://arkicplonaruvmhhvwxd.supabase.co") {
  throw new Error("Game analysis workers must use the current Supabase database.");
}
await runGameAnalysisWorker(task, {
  once: process.argv.includes("--once") || process.env.GAME_ANALYSIS_WORKER_ONCE === "true",
});
