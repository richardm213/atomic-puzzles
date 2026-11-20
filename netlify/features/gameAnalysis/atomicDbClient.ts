import process from "node:process";

import {
  GAME_ANALYSIS_BUDGET_NODES,
  GAME_ANALYSIS_VARIATION_SIZE,
  parseStoredAtomicDbVariationBundle,
  type StoredAtomicDbPosition,
} from "../../../shared/domain/gameAnalysis";
import { queryAtomicDbPrincipalVariations } from "../../lib/atomicDb";

const ATOMIC_DB_BASE_URL = "https://belzedar.duckdns.org/atomicdb";
type AtomicDbCredentials = { username: string; password: string };

export const configuredCredentials = (): AtomicDbCredentials | null => {
  const username = process.env.ATOMICDB_USERNAME?.trim() ?? "";
  const password = process.env.ATOMICDB_PASSWORD ?? "";
  return username && password ? { username, password } : null;
};

const retryAfterMs = (value: string | null): number => {
  if (!value) return 1_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(250, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(250, date - Date.now()) : 1_000;
};

const atomicDbFetch = async (
  input: Parameters<typeof fetch>[0],
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

export const queryGameAnalysisVariations = async (
  fen: string,
  signal: AbortSignal,
  fetchResponse?: typeof fetch,
) => {
  const size = GAME_ANALYSIS_VARIATION_SIZE;
  const bundle = await queryAtomicDbPrincipalVariations(fen, size, size, signal, fetchResponse);
  return bundle ? parseStoredAtomicDbVariationBundle(fen, bundle) : null;
};

export const gameAnalysisRequestParameters = (
  fen: string,
  account: AtomicDbCredentials | null,
): URLSearchParams =>
  new URLSearchParams({
    fen,
    only_if_missing: "1",
    ...(account ? { username: account.username, password: account.password } : {}),
  });

export const atomicDbRequest = async (
  fen: string,
  account: AtomicDbCredentials | null,
): Promise<Record<string, unknown>> => {
  const response = await atomicDbFetch(
    `${ATOMIC_DB_BASE_URL}/api/request`,
    {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: gameAnalysisRequestParameters(fen, account),
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

export const atomicDbQuery = (fen: string) =>
  queryGameAnalysisVariations(fen, AbortSignal.timeout(15_000), (input, init) =>
    atomicDbFetch(input, init ?? {}, 15_000),
  );

export const isCompletedAtomicDbPosition = (position: StoredAtomicDbPosition | null): boolean => {
  if (!position) return false;
  if (position.status !== "UNKNOWN" || (position.budgetNodes ?? 0) >= GAME_ANALYSIS_BUDGET_NODES) {
    return true;
  }
  // A solved mate can stop below the node budget while AtomicDB still reports UNKNOWN.
  // Require the decisive score to agree with a mate line for the best move.
  const { bestMove, lines, score } = position;
  if ((score !== 10_000 && score !== -10_000) || !bestMove) return false;
  return lines.some(
    ({ move, mate, pv }) =>
      (move ?? pv[0]) === bestMove &&
      pv[0] === bestMove &&
      mate !== null &&
      Math.sign(mate) === Math.sign(score),
  );
};

export const parseAtomicDbQueueSize = (html: string): number | null => {
  const metric = (label: "waiting" | "running"): number | null => {
    const current = html.match(
      new RegExp(`<strong>\\s*([\\d,]+)\\s*</strong>\\s*${label}\\b`, "i"),
    );
    const legacy = html.match(
      new RegExp(`<div class="v">([\\d,]+)</div><div class="l">${label}</div>`, "i"),
    );
    const value = Number.parseInt((current?.[1] ?? legacy?.[1] ?? "").replaceAll(",", ""), 10);
    return Number.isFinite(value) ? value : null;
  };
  const waiting = metric("waiting");
  const running = metric("running");
  return waiting === null || running === null ? null : waiting + running;
};

export const atomicDbQueueSize = async (
  account: AtomicDbCredentials | null,
): Promise<number | null> => {
  // Anonymous requests are attributed to Gannet, so its public queue page is also the
  // authoritative throttle when no private account is configured.
  const queueAccount = account?.username ?? "gannet";
  const response = await fetch(`${ATOMIC_DB_BASE_URL}/queue/${encodeURIComponent(queueAccount)}/`, {
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  return parseAtomicDbQueueSize(await response.text());
};
