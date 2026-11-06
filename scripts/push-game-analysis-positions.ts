import { createServerSupabase } from "../netlify/platform/environment";
import { submitPendingGameAnalysisPositions } from "../netlify/features/gameAnalysis/service";

type QueueRow = {
  game_id: string;
  queued_positions: number;
  total_positions: number;
};

type QueueSnapshot = {
  jobs: number;
  remainingPositions: number;
};

const readPositiveInteger = (name: string, fallback: number): number => {
  const prefix = `--${name}=`;
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return value;
};

const submissionBudget = readPositiveInteger("budget", 4_250);
const pauseMs = readPositiveInteger("pause-seconds", 15) * 1_000;
const runOnce = process.argv.includes("--once");
const supabase = createServerSupabase("Game analysis queue pusher");

const queueSnapshot = async (): Promise<QueueSnapshot> => {
  const rows: QueueRow[] = [];
  for (let from = 0; ; from += 1_000) {
    const { data, error } = await supabase
      .from("game_analyses")
      .select("game_id,queued_positions,total_positions")
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Unable to inspect game analysis submissions: ${error.message}`);
    const page = (data ?? []) as QueueRow[];
    rows.push(...page);
    if (page.length < 1_000) break;
  }

  const unfinished = rows.filter((row) => row.queued_positions < row.total_positions);
  return {
    jobs: unfinished.length,
    remainingPositions: unfinished.reduce(
      (total, row) => total + Math.max(0, row.total_positions - row.queued_positions),
      0,
    ),
  };
};

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
    console.log("\nStopping after the current submission pass…");
  });
}

const main = async (): Promise<void> => {
  console.log(
    `Pushing game-analysis positions with a ${submissionBudget.toLocaleString()}-position pass budget.`,
  );

  while (!stopping) {
    try {
      const before = await queueSnapshot();
      if (before.remainingPositions === 0) {
        console.log("All active game-analysis positions have been submitted.");
        return;
      }

      console.log(
        `${before.remainingPositions.toLocaleString()} positions remain across ${before.jobs.toLocaleString()} jobs.`,
      );
      await submitPendingGameAnalysisPositions(submissionBudget);

      const after = await queueSnapshot();
      const submitted = Math.max(0, before.remainingPositions - after.remainingPositions);
      console.log(
        `Submitted ${submitted.toLocaleString()} positions; ${after.remainingPositions.toLocaleString()} remain.`,
      );

      if (runOnce || after.remainingPositions === 0) return;
      if (submitted === 0) {
        console.log("AtomicDB is at its queue target; checking again in 60 seconds.");
      }
      await delay(submitted === 0 ? 60_000 : pauseMs);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Queue pusher failed.");
      if (runOnce) throw error;
      await delay(60_000);
    }
  }
};

await main();
