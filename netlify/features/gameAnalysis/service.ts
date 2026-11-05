import process from "node:process";

import type { SupabaseClient } from "@supabase/supabase-js";
import { INITIAL_FEN } from "chessops/fen";

import {
  buildGameAnalysisSummary,
  GAME_ANALYSIS_BUDGET_NODES,
  ignoreInitialGameAnalysisPlies,
  parseStoredAtomicDbPosition,
  type StoredAtomicDbPosition,
} from "../../../shared/domain/gameAnalysis";
import { createAtomicPosition } from "../../../shared/domain/puzzles/solutionPgn";
import { queryArchiveResource } from "../../archive/queries";
import { createServerSupabase } from "../../platform/environment";

const ATOMIC_DB_BASE_URL = "https://belzedar.duckdns.org/atomicdb";
const MAX_RETRIES = 12;
const INITIAL_POLL_BASE_MS = 2 * 60_000;
const MAX_INITIAL_POLL_DELAY_MS = 60 * 60_000;
const FOLLOW_UP_POLL_DELAY_MS = 2 * 60_000;
const EXPECTED_ATOMIC_DB_WORKERS = 4;
const ESTIMATED_WORKER_NODES_PER_SECOND = 14_000_000;
const WOLFRANDOM_RANDOMIZED_PLIES = 6;
const SWEEP_POSITION_BUDGET = 600;
const SWEEP_JOB_LIMIT = 12;
const SWEEP_JOB_CONCURRENCY = 1;
const SUBMISSION_POSITION_BUDGET = 4_250;
const ATOMIC_DB_QUEUE_TARGET = 4_800;

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

type SharedPositionRow = {
  fen_key: string;
  request_status: string | null;
  task: string | null;
  completed: boolean;
  data: StoredAtomicDbPosition | null;
  error: string | null;
};

const credentials = (): AtomicDbCredentials => {
  const username = process.env.ATOMICDB_USERNAME?.trim() ?? "";
  const password = process.env.ATOMICDB_PASSWORD ?? "";
  if (!username || !password) throw new Error("AtomicDB account credentials are not configured.");
  return { username, password };
};

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : "AtomicDB request failed.";

const retryAfterMs = (value: string | null): number => {
  if (!value) return 1_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(250, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(250, date - Date.now()) : 1_000;
};

const atomicDbFetch = async (
  input: string | URL,
  init: Omit<RequestInit, "signal">,
  timeoutMs: number,
): Promise<Response> => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (response.status !== 429 || attempt === 5) return response;
    await new Promise((resolve) =>
      setTimeout(resolve, retryAfterMs(response.headers.get("retry-after"))),
    );
  }
  throw new Error("AtomicDB request failed.");
};

export const gameAnalysisPositionKey = (fen: string): string =>
  fen.trim().split(/\s+/).slice(0, 4).join(" ");

const loadSharedPositions = async (
  supabase: SupabaseClient,
  states: PositionState[],
): Promise<void> => {
  const keys = [
    ...new Set(
      states.filter((state) => !state.completed).map((state) => gameAnalysisPositionKey(state.fen)),
    ),
  ];
  const rows: SharedPositionRow[] = [];
  for (let index = 0; index < keys.length; index += 50) {
    const { data, error } = await supabase
      .from("game_analysis_positions")
      .select("fen_key,request_status,task,completed,data,error")
      .in("fen_key", keys.slice(index, index + 50));
    if (error) throw new Error(`Unable to load shared game positions: ${error.message}`);
    rows.push(...((data ?? []) as SharedPositionRow[]));
  }
  const byKey = new Map(rows.map((row) => [row.fen_key, row]));
  for (const state of states) {
    const shared = byKey.get(gameAnalysisPositionKey(state.fen));
    if (!shared) continue;
    if (shared.completed && shared.data) {
      state.completed = true;
      state.data = shared.data;
      delete state.error;
    } else {
      if (shared.request_status) state.requestStatus = shared.request_status;
      if (shared.task) state.task = shared.task;
      if (shared.error) state.error = shared.error;
    }
  }
};

const saveSharedPositions = async (
  supabase: SupabaseClient,
  states: PositionState[],
  indexes: number[],
): Promise<void> => {
  const now = new Date().toISOString();
  const rows = indexes
    .map((index) => states[index]!)
    .map((state) => ({
      fen_key: gameAnalysisPositionKey(state.fen),
      fen: state.fen,
      request_status: state.requestStatus ?? null,
      task: state.task === undefined || state.task === null ? null : String(state.task),
      completed: state.completed,
      data: state.data ?? null,
      error: state.error ?? null,
      requested_at: state.requestStatus ? now : null,
      completed_at: state.completed ? now : null,
      updated_at: now,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("game_analysis_positions")
    .upsert(rows, { onConflict: "fen_key" });
  if (error) throw new Error(`Unable to save shared game positions: ${error.message}`);
};

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

const skippedPosition = (fen: string): StoredAtomicDbPosition => ({
  fen,
  key: null,
  status: "SKIPPED",
  closure: "WOLFRANDOM_OPENING",
  score: null,
  point: null,
  bestMove: null,
  budgetNodes: null,
  lines: [],
  candidates: [],
});

const initialStates = (fens: string[], skippedPositionCount = 0): PositionState[] =>
  fens.map((fen, index) => {
    if (index < skippedPositionCount) {
      return { fen, terminal: false, completed: true, data: skippedPosition(fen) };
    }
    const terminal = terminalPosition(fen);
    return terminal
      ? { fen, terminal: true, completed: true, data: terminal }
      : { fen, terminal: false, completed: false };
  });

const readStates = (
  job: GameAnalysisJobRow,
  fens: string[],
  skippedPositionCount = 0,
): PositionState[] => {
  const storedStates = job.position_states;
  if (!Array.isArray(storedStates) || storedStates.length !== fens.length) {
    return initialStates(fens, skippedPositionCount);
  }
  return fens.map((fen, index) => {
    if (index < skippedPositionCount) {
      return { fen, terminal: false, completed: true, data: skippedPosition(fen) };
    }
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

const randomizedOpeningPlies = async (gameId: string): Promise<number> => {
  const game = await queryArchiveResource(new URLSearchParams({ resource: "game", gameId }));
  return game && typeof game === "object" && Reflect.get(game, "mode") === "wolfrandom"
    ? WOLFRANDOM_RANDOMIZED_PLIES
    : 0;
};

const atomicDbRequest = async (
  fen: string,
  account: AtomicDbCredentials,
): Promise<Record<string, unknown>> => {
  const response = await atomicDbFetch(
    `${ATOMIC_DB_BASE_URL}/api/request`,
    {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        fen,
        username: account.username,
        password: account.password,
        only_if_missing: "1",
      }),
    },
    20_000,
  );
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
  const response = await atomicDbFetch(
    url,
    {
      headers: { Accept: "application/json" },
    },
    15_000,
  );
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

type ProcessGameAnalysisOptions = { poll?: boolean; submit?: boolean };

export const processGameAnalysisJob = async (
  gameId: string,
  maxPositions = 160,
  options: ProcessGameAnalysisOptions = {},
): Promise<number> => {
  const supabase = createServerSupabase("Game analysis worker");
  const { data, error } = await supabase
    .from("game_analyses")
    .select(
      "game_id,status,requested_by,initial_fen,moves,position_fens,position_states,total_positions,queued_positions,completed_positions,retry_count,charge_attempt",
    )
    .eq("game_id", gameId)
    .maybeSingle<GameAnalysisJobRow>();
  if (error) throw new Error(`Unable to load game analysis job: ${error.message}`);
  if (!data || data.status === "ready" || data.status === "failed") return 0;

  const moves = Array.isArray(data.moves)
    ? data.moves.filter((move): move is string => typeof move === "string")
    : [];
  const fens = Array.isArray(data.position_fens)
    ? data.position_fens.filter((fen): fen is string => typeof fen === "string")
    : [];
  if (moves.length + 1 !== fens.length || fens.length !== data.total_positions) {
    await refundAndFail(supabase, data, "The saved game line is invalid.");
    return 0;
  }

  const ignoredInitialPlies = await randomizedOpeningPlies(data.game_id);
  // Position 6 is retained as the baseline needed to assess White's fourth move. Positions before
  // it are neither queried nor stored because they belong to Wolfrandom's randomized opening.
  const states = readStates(data, fens, ignoredInitialPlies);
  await loadSharedPositions(supabase, states);
  const pendingIndexes = states
    .map((state, index) => ({ state, index }))
    .filter(({ state }) => !state.completed)
    .map(({ index }) => index);
  const standardOpeningIndexes = data.initial_fen.trim() === INITIAL_FEN ? [1, 2] : [];
  const orderedIndexes = [
    ...standardOpeningIndexes.filter((index) => pendingIndexes.includes(index)),
    ...pendingIndexes.filter((index) => !standardOpeningIndexes.includes(index)),
  ];

  const submittedIndexes =
    options.poll === false
      ? []
      : orderedIndexes
          .filter((index) => Boolean(states[index]?.requestStatus))
          .slice(0, maxPositions);
  await mapConcurrent(submittedIndexes, 5, async (index) => {
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
  await saveSharedPositions(supabase, states, submittedIndexes);

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

  const retryCount = options.poll === false ? data.retry_count : data.retry_count + 1;
  if (preflightCompletedPositions === states.length) {
    const positions = states.map((state) => state.data).filter(Boolean) as StoredAtomicDbPosition[];
    const result = ignoreInitialGameAnalysisPlies(
      buildGameAnalysisSummary(moves, positions),
      ignoredInitialPlies,
    );
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
    return 0;
  }

  let account: AtomicDbCredentials;
  try {
    account = credentials();
  } catch (credentialError) {
    await refundAndFail(supabase, data, errorMessage(credentialError));
    return 0;
  }

  const unsubmittedIndexes =
    options.submit === false
      ? []
      : orderedIndexes.filter((index) => !states[index]?.requestStatus).slice(0, maxPositions);
  let newlySubmitted = 0;
  await mapConcurrent(unsubmittedIndexes, 5, async (index) => {
    const state = states[index]!;
    if (state.completed || state.requestStatus) return;
    try {
      const receipt = await atomicDbRequest(state.fen, account);
      state.requestStatus = typeof receipt.status === "string" ? receipt.status : "already-queued";
      state.task =
        typeof receipt.task === "string" || typeof receipt.task === "number" ? receipt.task : null;
      newlySubmitted += 1;
      delete state.error;
    } catch (positionError) {
      state.error = errorMessage(positionError).slice(0, 500);
    }
  });
  await saveSharedPositions(supabase, states, unsubmittedIndexes);

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
    return newlySubmitted;
  }

  const nextPollDelay =
    options.poll === false
      ? FOLLOW_UP_POLL_DELAY_MS
      : retryCount === 1
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
  return newlySubmitted;
};

export const gameAnalysisSweepPositionLimit = (jobCount: number): number =>
  Math.max(1, Math.floor(SWEEP_POSITION_BUDGET / Math.max(1, jobCount)));

export const gameAnalysisSubmissionLimit = (queueSize: number): number =>
  Math.min(SUBMISSION_POSITION_BUDGET, Math.max(0, ATOMIC_DB_QUEUE_TARGET - queueSize));

export const processPendingGameAnalyses = async (limit = SWEEP_JOB_LIMIT): Promise<void> => {
  const supabase = createServerSupabase("Game analysis sweep");
  const { data, error } = await supabase
    .from("game_analyses")
    .select("game_id")
    .in("status", ["queued", "processing"])
    .lte("next_check_at", new Date().toISOString())
    .order("next_check_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Unable to load pending game analyses: ${error.message}`);
  const jobs = data ?? [];
  const positionsPerJob = gameAnalysisSweepPositionLimit(jobs.length);
  // A background function owns this pump, so it can use AtomicDB's full five-request-per-second
  // allowance instead of stopping at the scheduled-function timeout. Processing one game at a
  // time keeps the five position requests inside AtomicDB's per-address limit.
  await mapConcurrent(jobs, SWEEP_JOB_CONCURRENCY, async (row) => {
    await processGameAnalysisJob(String(row.game_id), positionsPerJob);
  });
};

export const submitPendingGameAnalysisPositions = async (): Promise<void> => {
  const account = credentials();
  const queueSize = (await atomicDbQueueSize(account).catch(() => null)) ?? 0;
  let remaining = gameAnalysisSubmissionLimit(queueSize);
  if (remaining === 0) return;

  const supabase = createServerSupabase("Game analysis submission sweep");
  const { data, error } = await supabase
    .from("game_analyses")
    .select("game_id")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) throw new Error(`Unable to load game analyses for submission: ${error.message}`);

  for (const row of data ?? []) {
    const submitted = await processGameAnalysisJob(String(row.game_id), remaining, {
      poll: false,
    });
    remaining -= submitted;
    if (remaining <= 0) break;
  }
};
