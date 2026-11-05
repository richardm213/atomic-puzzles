import process from "node:process";

import { z } from "zod";

import { buildGamePositionFens } from "../../../shared/domain/gameAnalysis";
import {
  authenticateRequest,
  identityResponse,
  requireSameOrigin,
  requireUsername,
} from "../../platform/authentication";
import type { FunctionEvent } from "../../platform/defineFunction";
import { createServerSupabase } from "../../platform/environment";
import { HttpError } from "../../platform/errors";
import { parseJsonBody } from "../../platform/validation";

const gameIdSchema = z.string().trim().min(1).max(160);
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), gameId: gameIdSchema }),
  z.object({
    action: z.literal("request"),
    gameId: gameIdSchema,
    initialFen: z.string().trim().min(1).max(180),
    moves: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][nbrq]?$/)).max(1000),
  }),
]);

type GameAnalysisRow = {
  game_id: string;
  status: "queued" | "processing" | "ready" | "failed";
  requested_by: string;
  total_positions: number;
  completed_positions: number;
  queued_positions: number;
  cost: number;
  error: string | null;
  result: unknown;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const publicRecord = (row: GameAnalysisRow) => ({
  gameId: row.game_id,
  status: row.status,
  requestedBy: row.requested_by,
  totalPositions: row.total_positions,
  completedPositions: row.completed_positions,
  queuedPositions: row.queued_positions,
  cost: Number(row.cost),
  error: row.error,
  result: row.result,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at,
});

const selectRecord = async (gameId: string): Promise<GameAnalysisRow | null> => {
  const supabase = createServerSupabase("Game analysis service");
  const { data, error } = await supabase
    .from("game_analyses")
    .select(
      "game_id,status,requested_by,total_positions,completed_positions,queued_positions,cost,error,result,created_at,updated_at,completed_at",
    )
    .eq("game_id", gameId)
    .maybeSingle<GameAnalysisRow>();
  if (error) throw new Error(`Unable to load game analysis: ${error.message}`);
  return data;
};

const dispatchWorker = async (event: FunctionEvent, gameId: string): Promise<void> => {
  const secret = process.env.GAME_ANALYSIS_WORKER_SECRET?.trim() ?? "";
  const host = event.headers?.host ?? event.headers?.Host ?? "";
  if (!secret || !host) return;
  const protocol = host.includes("localhost") ? "http" : "https";
  await fetch(`${protocol}://${host}/api/game-analysis-worker`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Game-Analysis-Worker": secret },
    body: JSON.stringify({ gameId }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
};

export const gameAnalysisRoute = async (event: FunctionEvent) => {
  const input = parseJsonBody(event, inputSchema, "Invalid game analysis request.");
  const identity = await authenticateRequest(event.headers, input.action === "status");

  if (input.action === "status") {
    const record = await selectRecord(input.gameId);
    return identityResponse(identity, 200, { analysis: record ? publicRecord(record) : null });
  }

  requireSameOrigin(event.headers, "Cross-site game analysis requests are not allowed.");
  const username = requireUsername(identity, "Sign in with Lichess to request game analysis.");
  let positionFens: string[];
  try {
    positionFens = buildGamePositionFens(input.initialFen, input.moves);
  } catch {
    throw new HttpError(400, "The archived game contains an invalid move sequence.");
  }
  const supabase = createServerSupabase("Game analysis service");
  const { data, error } = await supabase.rpc("request_game_analysis", {
    p_username: username,
    p_game_id: input.gameId,
    p_initial_fen: input.initialFen,
    p_moves: input.moves,
    p_position_fens: positionFens,
  });
  if (error) {
    if (/not enough coins/i.test(error.message)) {
      throw new HttpError(
        409,
        "You need 2 Atomic Coins to analyze this game.",
        {},
        "insufficient_coins",
      );
    }
    if (/coin economy ban/i.test(error.message)) {
      throw new HttpError(403, "Your Atomic Coin access is currently suspended.");
    }
    throw new Error(`Unable to create game analysis: ${error.message}`);
  }
  const record = await selectRecord(input.gameId);
  if (!record) throw new Error("The game analysis job was not created.");
  await dispatchWorker(event, input.gameId);
  return identityResponse(identity, 200, {
    analysis: publicRecord(record),
    created: Boolean((data as { created?: unknown } | null)?.created),
    balance:
      typeof (data as { balance?: unknown } | null)?.balance === "number"
        ? (data as { balance: number }).balance
        : null,
  });
};
