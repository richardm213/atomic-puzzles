import { readFile } from "node:fs/promises";

import { INITIAL_FEN } from "chessops/fen";

import {
  processGameAnalysisJob,
  submitPendingGameAnalysisPositions,
} from "../netlify/features/gameAnalysis/service";
import { createServerSupabase } from "../netlify/platform/environment";
import { buildGamePositionFens } from "../shared/domain/gameAnalysis";

type LocalGame = { gameId: string; moves: string[] };

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Pass the extracted local-game JSON path.");

const games = JSON.parse(await readFile(inputPath, "utf8")) as LocalGame[];
const supabase = createServerSupabase("Local game analysis request");

for (const game of games) {
  const positionFens = buildGamePositionFens(INITIAL_FEN, game.moves);
  const { data, error } = await supabase.rpc("request_game_analysis", {
    p_username: "seaside_tiramisu",
    p_game_id: game.gameId,
    p_initial_fen: INITIAL_FEN,
    p_moves: game.moves,
    p_position_fens: positionFens,
  });
  if (error) throw new Error(`${game.gameId}: ${error.message}`);
  const result = data as { created?: boolean; status?: string } | null;
  console.log(
    `${game.gameId}: ${result?.created ? "created" : "existing"} (${result?.status ?? "unknown"})`,
  );

  // These games are present in the local move cache but have not reached the remote archive yet.
  // Seed one ordinary-Atomic state so the worker can proceed without using the archive solely to
  // distinguish standard Atomic from Wolfrandom.
  const { error: seedError } = await supabase
    .from("game_analyses")
    .update({
      position_states: [{ fen: INITIAL_FEN, terminal: false, completed: false }],
    })
    .eq("game_id", game.gameId)
    .eq("requested_by", "seaside_tiramisu")
    .eq("status", "queued");
  if (seedError) throw new Error(`${game.gameId}: ${seedError.message}`);
}

await submitPendingGameAnalysisPositions(4_250);

const ids = games.map((game) => game.gameId);
const deadline = Date.now() + 45 * 60_000;
for (;;) {
  for (const id of ids) await processGameAnalysisJob(id, 160);

  const { data, error } = await supabase
    .from("game_analyses")
    .select("game_id,status,requested_by,total_positions,queued_positions,completed_positions,error")
    .in("game_id", ids)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  for (const row of data ?? []) console.log(JSON.stringify(row));
  if ((data ?? []).length === ids.length && (data ?? []).every((row) => row.status === "ready")) {
    break;
  }
  if (Date.now() >= deadline) throw new Error("Timed out waiting for all nine analyses.");
  await new Promise((resolve) => setTimeout(resolve, 60_000));
}
