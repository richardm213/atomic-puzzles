import process from "node:process";

import type { SupabaseClient } from "@supabase/supabase-js";
import { INITIAL_FEN } from "chessops/fen";

import {
  buildGameAnalysisSummary,
  GAME_ANALYSIS_BUDGET_NODES,
  parseStoredAtomicDbPosition,
  type StoredAtomicDbPosition,
} from "../../../shared/domain/gameAnalysis";
import { createAtomicPosition } from "../../../shared/domain/puzzles/solutionPgn";
import { createServerSupabase } from "../../platform/environment";

const ATOMIC_DB_BASE_URL = "https://belzedar.duckdns.org/atomicdb";
const MAX_RETRIES = 12;
const INITIAL_POLL_BASE_MS = 2 * 60_000;
const MAX_INITIAL_POLL_DELAY_MS = 60 * 60_000;
const FOLLOW_UP_POLL_DELAY_MS = 2 * 60_000;
const EXPECTED_ATOMIC_DB_WORKERS = 4;
const ESTIMATED_WORKER_NODES_PER_SECOND = 14_000_000;

type PositionState = {
  fen: string;
  terminal: boolean;
  requestStatus?: string;
  task?: string | number | null;
  completed: boolean;
  data?: StoredAtomicDbPosition;
  error?: string;
};

type GameAnalysisJobRow = {
  game_id: string;
  status: "queued" | "processing" | "ready" | "failed";
  requested_by: string;
  initial_fen: string;
  moves: unknown;
  position_fens: unknown;
  position_states: unknown;
  total_positions: number;
  queued_positions: number;
  completed_positions: number;
  retry_count: number;
  charge_attempt: number;
};

type AtomicDbCredentials = { username: string; password: string };

const credentials = (): AtomicDbCredentials => {
  const username = process.env.ATOMICDB_USERNAME?.trim() ?? "";
  const password = process.env.ATOMICDB_PASSWORD ?? "";
  if (!username || !password) throw new Error("AtomicDB account credentials are not configured.");
  return { username, password };
};

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : "AtomicDB request failed.";

const terminalPosition = (fen: string): StoredAtomicDbPosition | null => {
  const position = createAtomicPosition(fen);
  const outcome = position.outcome();
  if (!outcome) return null;
  return {
    fen,
    key: null,
    status:
      outcome.winner === "white" ? "WHITE_WIN" : outcome.winner === "black" ? "BLACK_WIN" : "DRAW",
    closure: "TERMINAL",
    score: null,
    point: null,
    bestMove: null,
    budgetNodes: null,
    lines: [],
  };
};

const initialStates = (fens: string[]): PositionState[] =>
  fens.map((fen) => {
    const terminal = terminalPosition(fen);
    return terminal
      ? { fen, terminal: true, completed: true, data: terminal }
      : { fen, terminal: false, completed: false };
  });

const readStates = (job: GameAnalysisJobRow, fens: string[]): PositionState[] => {
  const storedStates = job.position_states;
  if (!Array.isArray(storedStates) || storedStates.length !== fens.length) {
    return initialStates(fens);
  }
  return fens.map((fen, index) => {
    const value = storedStates[index];
    if (!value || typeof value !== "object") return initialStates([fen])[0]!;
    const state = value as Partial<PositionState>;
    return {
      fen,
      terminal: Boolean(state.terminal),
      completed: Boolean(state.completed),
      ...(typeof state.requestStatus === "string" ? { requestStatus: state.requestStatus } : {}),
      ...(state.task === null || typeof state.task === "string" || typeof state.task === "number"
        ? { task: state.task }
        : {}),
      ...(state.data ? { data: state.data } : {}),
      ...(typeof state.error === "string" ? { error: state.error } : {}),
    };
  });
};

const atomicDbRequest = async (
  fen: string,
  account: AtomicDbCredentials,
): Promise<Record<string, unknown>> => {
  const response = await fetch(`${ATOMIC_DB_BASE_URL}/api/request`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      fen,
      username: account.username,
      password: account.password,
      only_if_missing: "1",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== "object") {
    const reason =
      body && typeof body === "object" && typeof Reflect.get(body, "reason") === "string"
        ? String(Reflect.get(body, "reason"))
        : "AtomicDB rejected the game position.";
    throw new Error(reason);
  }
  return body as Record<string, unknown>;
};

const atomicDbQuery = async (fen: string): Promise<StoredAtomicDbPosition | null> => {
  const url = new URL(`${ATOMIC_DB_BASE_URL}/api/query`);
  url.searchParams.set("fen", fen);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) return null;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error("AtomicDB position lookup failed.");
  return parseStoredAtomicDbPosition(fen, body);
};

const isCompletedAtomicDbPosition = (position: StoredAtomicDbPosition | null): boolean =>
  Boolean(
    position &&
    (position.status !== "UNKNOWN" || (position.budgetNodes ?? 0) >= GAME_ANALYSIS_BUDGET_NODES),
  );

const atomicDbQueueSize = async (account: AtomicDbCredentials): Promise<number | null> => {
  const response = await fetch(
    `${ATOMIC_DB_BASE_URL}/queue/${encodeURIComponent(account.username)}/`,
    {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) return null;
  const html = await response.text();
  const metric = (label: "waiting" | "running"): number | null => {
    const match = html.match(
      new RegExp(`<div class="v">([\\d,]+)</div><div class="l">${label}</div>`, "i"),
    );
    if (!match?.[1]) return null;
    const value = Number.parseInt(match[1].replaceAll(",", ""), 10);
    return Number.isFinite(value) ? value : null;
  };
  const waiting = metric("waiting");
  const running = metric("running");
  return waiting === null || running === null ? null : waiting + running;
};

const initialPollDelayMs = (queueSize: number): number => {
  // Four roughly 14M-node/s workers need about nine seconds per 128M search wave.
  // The base delay covers queue-page propagation and result persistence.
  const searchWaves = Math.ceil(Math.max(0, queueSize) / EXPECTED_ATOMIC_DB_WORKERS);
  const estimatedSearchMs =
    searchWaves * (GAME_ANALYSIS_BUDGET_NODES / ESTIMATED_WORKER_NODES_PER_SECOND) * 1_000;
  return Math.min(MAX_INITIAL_POLL_DELAY_MS, INITIAL_POLL_BASE_MS + estimatedSearchMs);
};

const mapConcurrent = async <T>(
  values: T[],
  concurrency: number,
  callback: (value: T) => Promise<void>,
): Promise<void> => {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (index < values.length) {
        const next = values[index++];
        if (next !== undefined) await callback(next);
      }
    }),
  );
};

const updateJob = async (
  supabase: SupabaseClient,
  gameId: string,
  values: Record<string, unknown>,
): Promise<void> => {
  const { error } = await supabase
    .from("game_analyses")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("game_id", gameId)
    .in("status", ["queued", "processing"]);
  if (error) throw new Error(`Unable to save game analysis progress: ${error.message}`);
};

const refundAndFail = async (
  supabase: SupabaseClient,
  job: GameAnalysisJobRow,
  message: string,
): Promise<void> => {
  if (job.queued_positions === 0) {
    const { error: refundError } = await supabase.rpc("refund_game_analysis", {
      p_username: job.requested_by,
      p_game_id: job.game_id,
      p_charge_attempt: job.charge_attempt,
      p_message: message,
    });
    if (refundError)
      throw new Error(`Unable to refund failed game analysis: ${refundError.message}`);
  }
  const { error } = await supabase
    .from("game_analyses")
    .update({
      status: "failed",
      error: message.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("game_id", job.game_id)
    .in("status", ["queued", "processing"]);
  if (error) throw new Error(`Unable to mark game analysis as failed: ${error.message}`);
};

export const processGameAnalysisJob = async (gameId: string, maxPositions = 160): Promise<void> => {
  const supabase = createServerSupabase("Game analysis worker");
  const { data, error } = await supabase
    .from("game_analyses")
    .select(
      "game_id,status,requested_by,initial_fen,moves,position_fens,position_states,total_positions,queued_positions,completed_positions,retry_count,charge_attempt",
    )
    .eq("game_id", gameId)
    .maybeSingle<GameAnalysisJobRow>();
  if (error) throw new Error(`Unable to load game analysis job: ${error.message}`);
  if (!data || data.status === "ready" || data.status === "failed") return;

  const moves = Array.isArray(data.moves)
    ? data.moves.filter((move): move is string => typeof move === "string")
    : [];
  const fens = Array.isArray(data.position_fens)
    ? data.position_fens.filter((fen): fen is string => typeof fen === "string")
    : [];
  if (moves.length + 1 !== fens.length || fens.length !== data.total_positions) {
    await refundAndFail(supabase, data, "The saved game line is invalid.");
    return;
  }

  const states = readStates(data, fens);
  const pendingIndexes = states
    .map((state, index) => ({ state, index }))
    .filter(({ state }) => !state.completed)
    .slice(0, maxPositions)
    .map(({ index }) => index);
  const standardOpeningIndexes = data.initial_fen.trim() === INITIAL_FEN ? [1, 2] : [];
  const workIndexes = [
    ...standardOpeningIndexes.filter((index) => pendingIndexes.includes(index)),
    ...pendingIndexes.filter((index) => !standardOpeningIndexes.includes(index)),
  ];

  await mapConcurrent(workIndexes, 5, async (index) => {
    const state = states[index]!;
    try {
      const position = await atomicDbQuery(state.fen);
      if (isCompletedAtomicDbPosition(position)) {
        state.data = position!;
        state.completed = true;
        delete state.error;
      }
    } catch (positionError) {
      state.error = errorMessage(positionError).slice(0, 500);
    }
  });

  const preflightCompletedPositions = states.filter((state) => state.completed).length;
  if (preflightCompletedPositions > data.completed_positions) {
    await updateJob(supabase, data.game_id, {
      status: "processing",
      position_states: states,
      queued_positions: states.filter((state) => state.completed || Boolean(state.requestStatus))
        .length,
      completed_positions: preflightCompletedPositions,
      next_check_at: new Date(Date.now() + FOLLOW_UP_POLL_DELAY_MS).toISOString(),
    });
  }

  const retryCount = data.retry_count + 1;
  if (preflightCompletedPositions === states.length) {
    const positions = states.map((state) => state.data).filter(Boolean) as StoredAtomicDbPosition[];
    const result = buildGameAnalysisSummary(moves, positions);
    await updateJob(supabase, data.game_id, {
      status: "ready",
      // The completed result contains the full position data. Dropping the progress copy avoids
      // storing every FEN, candidate, depth and PV twice; Postgres then TOAST-compresses the JSONB.
      position_states: [],
      queued_positions: preflightCompletedPositions,
      completed_positions: preflightCompletedPositions,
      result,
      error: null,
      retry_count: retryCount,
      completed_at: new Date().toISOString(),
      next_check_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    return;
  }

  let account: AtomicDbCredentials;
  try {
    account = credentials();
  } catch (credentialError) {
    await refundAndFail(supabase, data, errorMessage(credentialError));
    return;
  }

  await mapConcurrent(workIndexes, 5, async (index) => {
    const state = states[index]!;
    if (state.completed || state.requestStatus) return;
    try {
      const receipt = await atomicDbRequest(state.fen, account);
      state.requestStatus = typeof receipt.status === "string" ? receipt.status : "already-queued";
      state.task =
        typeof receipt.task === "string" || typeof receipt.task === "number" ? receipt.task : null;
      delete state.error;
    } catch (positionError) {
      state.error = errorMessage(positionError).slice(0, 500);
    }
  });

  const queuedPositions = states.filter(
    (state) => state.completed || Boolean(state.requestStatus),
  ).length;
  const completedPositions = states.filter((state) => state.completed).length;
  const incompleteQueuedPositions = states.filter(
    (state) => !state.completed && Boolean(state.requestStatus),
  ).length;
  const hardCredentialFailure = states.some((state) => /bad credentials/i.test(state.error ?? ""));

  if ((hardCredentialFailure || retryCount >= MAX_RETRIES) && incompleteQueuedPositions === 0) {
    await refundAndFail(
      supabase,
      { ...data, queued_positions: incompleteQueuedPositions },
      hardCredentialFailure
        ? "AtomicDB rejected the configured account credentials."
        : "No game positions could be added to AtomicDB.",
    );
    return;
  }

  const nextPollDelay =
    retryCount === 1
      ? initialPollDelayMs(
          Math.max(
            (await atomicDbQueueSize(account).catch(() => null)) ?? 0,
            incompleteQueuedPositions,
          ),
        )
      : FOLLOW_UP_POLL_DELAY_MS;

  await updateJob(supabase, data.game_id, {
    status: "processing",
    position_states: states,
    queued_positions: queuedPositions,
    completed_positions: completedPositions,
    retry_count: retryCount,
    error: null,
    next_check_at: new Date(Date.now() + nextPollDelay).toISOString(),
  });
};

export const processPendingGameAnalyses = async (limit = 3): Promise<void> => {
  const supabase = createServerSupabase("Game analysis sweep");
  const { data, error } = await supabase
    .from("game_analyses")
    .select("game_id")
    .in("status", ["queued", "processing"])
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Unable to load pending game analyses: ${error.message}`);
  for (const row of data ?? []) await processGameAnalysisJob(String(row.game_id), 24);
};
