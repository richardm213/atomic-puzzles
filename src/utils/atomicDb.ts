import { appAssetPath } from "./appAssetPath";

export type AtomicDbTurn = "white" | "black";
export type AtomicDbOutcome = "WHITE_WIN" | "BLACK_WIN" | "DRAW" | "UNKNOWN";

export type AtomicDbMove = {
  uci: string;
  outcome: AtomicDbOutcome;
  closure: string | null;
  score: number | null;
  point: number | null;
  mate: number | null;
  backedPlies: number;
};

export type AtomicDbPosition = {
  key: string | null;
  outcome: AtomicDbOutcome;
  closure: string | null;
  score: number | null;
  point: number | null;
  bestMove: string | null;
  moves: AtomicDbMove[];
};

export type AtomicDbResult = {
  fen: string;
  position: AtomicDbPosition | null;
};

export type AtomicDbPrincipalVariationResult = {
  lines: Record<string, string[]>;
  positions: Record<string, AtomicDbPosition>;
};

export type AtomicDbEvaluation =
  { type: "centipawns"; value: number } | { type: "mate"; value: number } | { type: "unknown" };

export type AtomicDbView = {
  position: AtomicDbPosition | null;
  fen: string;
  isCurrent: boolean;
  evaluation: AtomicDbEvaluation;
  evaluationLabel: string;
  whitePercent: number;
};

type AtomicDbMoveResponse = {
  uci?: unknown;
  status?: unknown;
  closure?: unknown;
  score?: unknown;
  point?: unknown;
  mate?: unknown;
  backed_plies?: unknown;
};

type AtomicDbResponse = {
  key?: unknown;
  status?: unknown;
  closure?: unknown;
  score?: unknown;
  point?: unknown;
  best_move?: unknown;
  moves?: unknown;
};

const UNKNOWN_EVALUATION: AtomicDbEvaluation = { type: "unknown" };
const TERMINAL_SCORE = 10_000;
const LICHESS_WINNING_CHANCES_COEFFICIENT = 0.00368208;

export const ATOMIC_DB_HOME_URL = "https://belzedar.duckdns.org/atomicdb/";

const nullableNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const nullableString = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

const parseOutcome = (value: unknown): AtomicDbOutcome => {
  if (value === "WHITE_WIN" || value === "BLACK_WIN" || value === "DRAW") return value;
  return "UNKNOWN";
};

const parseMove = (value: unknown): AtomicDbMove | null => {
  if (!value || typeof value !== "object") return null;
  const move = value as AtomicDbMoveResponse;
  if (typeof move.uci !== "string" || !/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(move.uci)) {
    return null;
  }

  return {
    uci: move.uci,
    outcome: parseOutcome(move.status),
    closure: nullableString(move.closure),
    score: nullableNumber(move.score),
    point: nullableNumber(move.point),
    mate: nullableNumber(move.mate),
    backedPlies: Math.max(0, Math.floor(nullableNumber(move.backed_plies) ?? 0)),
  };
};

const turnFromFen = (fen: string): AtomicDbTurn =>
  fen.trim().split(/\s+/)[1] === "b" ? "black" : "white";

const fromSideToMovePerspective = (value: number, turn: AtomicDbTurn): number =>
  turn === "white" ? value : -value;

const evaluationFromValues = ({
  score,
  mate,
  outcome,
  turn,
}: {
  score: number | null;
  mate: number | null;
  outcome: AtomicDbOutcome;
  turn: AtomicDbTurn;
}): AtomicDbEvaluation => {
  // AtomicDB follows UCI: scores and mate distances use the side-to-move's perspective.
  // Convert once here so every UI surface consistently uses White's perspective.
  if (mate !== null) return { type: "mate", value: fromSideToMovePerspective(mate, turn) };
  if (outcome === "DRAW") return { type: "centipawns", value: 0 };
  if (score !== null) {
    return { type: "centipawns", value: fromSideToMovePerspective(score, turn) };
  }
  if (outcome === "WHITE_WIN") return { type: "centipawns", value: TERMINAL_SCORE };
  if (outcome === "BLACK_WIN") return { type: "centipawns", value: -TERMINAL_SCORE };
  return UNKNOWN_EVALUATION;
};

export const atomicDbPositionUrl = (key: string): string =>
  `https://belzedar.duckdns.org/atomicdb/explore/${encodeURIComponent(key)}/`;

export const parseAtomicDbResponse = (value: unknown): AtomicDbPosition => {
  if (!value || typeof value !== "object") {
    throw new Error("AtomicDB returned an unexpected response.");
  }

  const response = value as AtomicDbResponse;
  if (!Array.isArray(response.moves)) {
    throw new Error("AtomicDB returned an unexpected response.");
  }

  return {
    key: nullableString(response.key),
    outcome: parseOutcome(response.status),
    closure: nullableString(response.closure),
    score: nullableNumber(response.score),
    point: nullableNumber(response.point),
    bestMove: nullableString(response.best_move),
    // AtomicDB ranks moves for the player to move. Preserve that order, including ties.
    moves: response.moves.map(parseMove).filter((move): move is AtomicDbMove => move !== null),
  };
};

export const buildAtomicDbUrl = (fen: string): string => {
  const params = new URLSearchParams({ fen });
  return `${appAssetPath("/api/atomicdb-analysis")}?${params.toString()}`;
};

export const buildAtomicDbLinesUrl = (
  fen: string,
  rootMoves: string[],
  plyCount: number,
): string => {
  const params = new URLSearchParams({
    fen,
    line_moves: rootMoves.join(","),
    plies: String(plyCount),
  });
  return `${appAssetPath("/api/atomicdb-analysis")}?${params.toString()}`;
};

export const fetchAtomicDbPosition = async (
  fen: string,
  signal?: AbortSignal,
): Promise<AtomicDbPosition | null> => {
  const response = await fetch(buildAtomicDbUrl(fen), signal ? { signal } : undefined);
  const body: unknown = await response.json().catch(() => null);

  if (response.status === 404) return null;
  if (!response.ok) {
    const error = body as { error?: unknown } | null;
    throw new Error(
      typeof error?.error === "string" ? error.error : "AtomicDB analysis is unavailable.",
    );
  }

  return parseAtomicDbResponse(body);
};

export const fetchAtomicDbPositions = async (
  fens: string[],
  signal?: AbortSignal,
): Promise<Record<string, AtomicDbPosition | null>> => {
  const response = await fetch(appAssetPath("/api/atomicdb-analysis"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fens }),
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== "object") {
    const error = body as { error?: unknown } | null;
    throw new Error(
      typeof error?.error === "string" ? error.error : "AtomicDB analysis is unavailable.",
    );
  }

  const payload = body as { positions?: unknown };
  if (!payload.positions || typeof payload.positions !== "object") {
    throw new Error("AtomicDB returned an unexpected response.");
  }

  const positions: Record<string, AtomicDbPosition | null> = {};
  for (const fen of fens) {
    const value = (payload.positions as Record<string, unknown>)[fen];
    positions[fen] = value === null ? null : parseAtomicDbResponse(value);
  }
  return positions;
};

export const fetchAtomicDbPrincipalVariations = async (
  fen: string,
  rootMoves: string[],
  plyCount: number,
  signal?: AbortSignal,
): Promise<AtomicDbPrincipalVariationResult> => {
  const response = await fetch(
    buildAtomicDbLinesUrl(fen, rootMoves, plyCount),
    signal ? { signal } : undefined,
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== "object") {
    const error = body as { error?: unknown } | null;
    throw new Error(
      typeof error?.error === "string" ? error.error : "AtomicDB lines are unavailable.",
    );
  }

  const payload = body as { lines?: unknown; positions?: unknown };
  const lines: Record<string, string[]> = {};
  if (payload.lines && typeof payload.lines === "object") {
    for (const [rootMove, moves] of Object.entries(payload.lines)) {
      if (!Array.isArray(moves)) continue;
      lines[rootMove] = moves.filter(
        (move): move is string =>
          typeof move === "string" && /^[a-h][1-8][a-h][1-8][nbrq]?$/.test(move),
      );
    }
  }

  const positions: Record<string, AtomicDbPosition> = {};
  if (payload.positions && typeof payload.positions === "object") {
    for (const [positionFen, value] of Object.entries(payload.positions)) {
      positions[positionFen] = parseAtomicDbResponse(value);
    }
  }
  return { lines, positions };
};

export const getAtomicDbMoveEvaluation = (move: AtomicDbMove, fen: string): AtomicDbEvaluation =>
  evaluationFromValues({
    score: move.score,
    mate: move.mate,
    outcome: move.outcome,
    turn: turnFromFen(fen),
  });

export const getAtomicDbPositionEvaluation = (
  position: AtomicDbPosition | null,
  fen: string,
): AtomicDbEvaluation => {
  if (!position) return UNKNOWN_EVALUATION;

  const bestMove = position.moves.find((move) => move.uci === position.bestMove);
  if (bestMove?.mate !== null && bestMove?.mate !== undefined) {
    return getAtomicDbMoveEvaluation(bestMove, fen);
  }

  return evaluationFromValues({
    score: position.score,
    mate: null,
    outcome: position.outcome,
    turn: turnFromFen(fen),
  });
};

export const formatAtomicDbEvaluation = (evaluation: AtomicDbEvaluation): string => {
  if (evaluation.type === "unknown") return "—";
  if (evaluation.type === "mate") {
    return `${evaluation.value < 0 ? "-" : ""}#${Math.abs(evaluation.value)}`;
  }

  const pawns = evaluation.value / 100;
  const normalizedPawns = Object.is(pawns, -0) ? 0 : pawns;
  return `${normalizedPawns > 0 ? "+" : ""}${normalizedPawns.toFixed(1)}`;
};

export const atomicDbWhitePercent = (evaluation: AtomicDbEvaluation): number => {
  if (evaluation.type === "unknown") return 50;
  if (evaluation.type === "mate") {
    if (evaluation.value > 0) return 100;
    if (evaluation.value < 0) return 0;
    return 50;
  }

  const proportion = 1 / (1 + Math.exp(-LICHESS_WINNING_CHANCES_COEFFICIENT * evaluation.value));
  return Math.round(proportion * 100);
};

export const buildAtomicDbView = (
  result: AtomicDbResult | null,
  requestedFen: string,
): AtomicDbView => {
  const fen = result?.fen ?? requestedFen;
  const position = result?.position ?? null;
  const evaluation = getAtomicDbPositionEvaluation(position, fen);

  return {
    position,
    fen,
    isCurrent: result?.fen === requestedFen,
    evaluation,
    evaluationLabel: formatAtomicDbEvaluation(evaluation),
    whitePercent: atomicDbWhitePercent(evaluation),
  };
};
