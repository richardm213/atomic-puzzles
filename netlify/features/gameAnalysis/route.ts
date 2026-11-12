import { z } from "zod";

import {
  alignGameAnalysisPositionFens,
  applyGameAnalysisOpeningReview,
  buildGameAnalysisSummary,
  buildGamePositionFens,
  evaluationsForPositions,
  GAME_ANALYSIS_COST,
  type PersistedGameAnalysisSummary,
} from "../../../shared/domain/gameAnalysis";
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
import { dispatchGameAnalysisWorker } from "./dispatch";
import { hydrateGameAnalysisPositions } from "./openings";

const gameIdSchema = z.string().trim().min(1).max(160);
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), gameId: gameIdSchema }),
  z.object({ action: z.literal("statuses"), gameIds: z.array(gameIdSchema).max(5000) }),
  z.object({
    action: z.literal("adminList"),
    page: z.number().int().min(1).max(100_000).default(1),
    pageSize: z.number().int().min(1).max(100).default(50),
  }),
  z.object({
    action: z.literal("adminFinished"),
    page: z.number().int().min(1).max(100_000),
    pageSize: z.number().int().min(1).max(100),
  }),
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
  result: PersistedGameAnalysisSummary | null;
  position_fens: string[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type AdminGameAnalysisRow = {
  game_id: string;
  status: "queued" | "processing" | "ready" | "failed";
  requested_by: string;
  total_moves: number;
  completed_moves: number;
  queued_moves: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  last_checked_at: string | null;
  next_check_at: string;
};

const GAME_ANALYSIS_ADMIN = "seaside_tiramisu";

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
      "game_id,status,requested_by,total_positions,completed_positions,queued_positions,cost,error,result,position_fens,created_at,updated_at,completed_at",
    )
    .eq("game_id", gameId)
    .maybeSingle<GameAnalysisRow>();
  if (error) throw new Error(`Unable to load game analysis: ${error.message}`);
  if (!data?.result || data.status !== "ready") return data;
  const positions = await hydrateGameAnalysisPositions(supabase, {
    ...data.result,
    positions: alignGameAnalysisPositionFens(data.result.positions, data.position_fens),
  });
  const moves = data.result.assessments.map(({ uci }) => uci);
  if (positions.length !== moves.length + 1) {
    return {
      ...data,
      result: { ...data.result, positions, evaluations: evaluationsForPositions(positions) },
    };
  }
  const result = applyGameAnalysisOpeningReview(buildGameAnalysisSummary(moves, positions), {
    wolfrandom: positions.some(({ closure }) => closure === "WOLFRANDOM_OPENING"),
  });
  return { ...data, result };
};

const selectStatuses = async (gameIds: string[]) => {
  const supabase = createServerSupabase("Game analysis status list");
  const uniqueIds = [...new Set(gameIds)];
  const rows: Array<{ game_id: string; status: GameAnalysisRow["status"] }> = [];
  for (let index = 0; index < uniqueIds.length; index += 200) {
    const { data, error } = await supabase
      .from("game_analyses")
      .select("game_id,status")
      .in("game_id", uniqueIds.slice(index, index + 200));
    if (error) throw new Error(`Unable to load game analysis statuses: ${error.message}`);
    rows.push(...((data ?? []) as typeof rows));
  }
  return rows.map((row) => ({ gameId: row.game_id, status: row.status }));
};

const adminRecord = (row: AdminGameAnalysisRow) => ({
  gameId: row.game_id,
  status: row.status,
  requestedBy: row.requested_by,
  completedMoves: row.completed_moves,
  queuedMoves: row.queued_moves,
  totalMoves: row.total_moves,
  error: row.error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at,
  lastCheckedAt: row.status === "processing" ? row.last_checked_at : null,
  nextCheckAt: row.status === "processing" ? row.next_check_at : null,
});

const selectAdminRecords = async (page: number, pageSize: number) => {
  const supabase = createServerSupabase("Game analysis admin list");
  const columns =
    "game_id,status,requested_by,total_moves,completed_moves,queued_moves,error,created_at,updated_at,completed_at,last_checked_at,next_check_at";
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString();
  const pendingFrom = (page - 1) * pageSize;
  const [pendingResult, completedResult, failedResult, finishedLast7DaysResult] = await Promise.all(
    [
      supabase
        .from("game_analysis_admin_summaries")
        .select(columns, { count: "exact" })
        .in("status", ["queued", "processing"])
        .order("created_at", { ascending: true })
        .order("game_id", { ascending: true })
        .range(pendingFrom, pendingFrom + pageSize - 1),
      supabase
        .from("game_analysis_admin_summaries")
        .select(columns)
        .eq("status", "ready")
        .order("completed_at", { ascending: false })
        .limit(25),
      supabase
        .from("game_analysis_admin_summaries")
        .select(columns, { count: "exact" })
        .eq("status", "failed")
        .order("updated_at", { ascending: false })
        .limit(25),
      supabase
        .from("game_analysis_admin_summaries")
        .select("game_id", { count: "exact", head: true })
        .eq("status", "ready")
        .gte("completed_at", sevenDaysAgo),
    ],
  );
  if (pendingResult.error) {
    throw new Error(`Unable to load pending game analyses: ${pendingResult.error.message}`);
  }
  if (completedResult.error) {
    throw new Error(`Unable to load completed game analyses: ${completedResult.error.message}`);
  }
  if (failedResult.error) {
    throw new Error(`Unable to load failed game analyses: ${failedResult.error.message}`);
  }
  if (finishedLast7DaysResult.error) {
    throw new Error(
      `Unable to count recently completed game analyses: ${finishedLast7DaysResult.error.message}`,
    );
  }
  const pendingTotal = pendingResult.count ?? pendingResult.data?.length ?? 0;
  return {
    pending: ((pendingResult.data ?? []) as AdminGameAnalysisRow[]).map(adminRecord),
    pendingTotal,
    pendingPage: page,
    pendingPageSize: pageSize,
    pendingTotalPages: Math.max(1, Math.ceil(pendingTotal / pageSize)),
    completed: ((completedResult.data ?? []) as AdminGameAnalysisRow[]).map(adminRecord),
    failed: ((failedResult.data ?? []) as AdminGameAnalysisRow[]).map(adminRecord),
    failedTotal: failedResult.count ?? failedResult.data?.length ?? 0,
    finishedLast7Days: finishedLast7DaysResult.count ?? 0,
    generatedAt: new Date().toISOString(),
  };
};

const selectFinishedAdminRecords = async (page: number, pageSize: number) => {
  const supabase = createServerSupabase("Finished game analyses admin list");
  const columns =
    "game_id,status,requested_by,total_moves,completed_moves,queued_moves,error,created_at,updated_at,completed_at,last_checked_at,next_check_at";
  const from = (page - 1) * pageSize;
  const { data, error, count } = await supabase
    .from("game_analysis_admin_summaries")
    .select(columns, { count: "exact" })
    .eq("status", "ready")
    .order("completed_at", { ascending: false })
    .order("game_id", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(`Unable to load finished game analyses: ${error.message}`);
  const total = count ?? data?.length ?? 0;
  return {
    items: ((data ?? []) as AdminGameAnalysisRow[]).map(adminRecord),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    generatedAt: new Date().toISOString(),
  };
};

export const gameAnalysisRoute = async (event: FunctionEvent) => {
  const input = parseJsonBody(event, inputSchema, "Invalid game analysis request.");
  const identity = await authenticateRequest(
    event.headers,
    input.action === "status" || input.action === "statuses",
  );

  if (input.action === "status") {
    const record = await selectRecord(input.gameId);
    return identityResponse(identity, 200, { analysis: record ? publicRecord(record) : null });
  }

  if (input.action === "statuses") {
    return identityResponse(identity, 200, { analyses: await selectStatuses(input.gameIds) });
  }

  if (input.action === "adminList" || input.action === "adminFinished") {
    requireSameOrigin(event.headers, "Cross-site game analysis requests are not allowed.");
    const username = requireUsername(identity, "Sign in to view game analyses.");
    if (username.toLowerCase() !== GAME_ANALYSIS_ADMIN) {
      throw new HttpError(403, "This page is restricted.");
    }
    return identityResponse(
      identity,
      200,
      input.action === "adminList"
        ? await selectAdminRecords(input.page, input.pageSize)
        : await selectFinishedAdminRecords(input.page, input.pageSize),
    );
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
        `You need ${GAME_ANALYSIS_COST} Atomic Coin to analyze this game.`,
        {},
        "insufficient_coins",
      );
    }
    throw new Error(`Unable to create game analysis: ${error.message}`);
  }
  const record = await selectRecord(input.gameId);
  if (!record) throw new Error("The game analysis job was not created.");
  if (record.status === "queued" || record.status === "processing") {
    await dispatchGameAnalysisWorker();
  }
  return identityResponse(identity, 200, {
    analysis: publicRecord(record),
    created: Boolean((data as { created?: unknown } | null)?.created),
    balance:
      typeof (data as { balance?: unknown } | null)?.balance === "number"
        ? (data as { balance: number }).balance
        : null,
  });
};
