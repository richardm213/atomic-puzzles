import { ApiError, apiRequest, postApi } from "../lib/api/postApi";

type AtomicDbTurn = "white" | "black";
export type AtomicDbOutcome = "WHITE_WIN" | "BLACK_WIN" | "DRAW" | "UNKNOWN";

type AtomicDbMove = {
  uci: string;
  origin?: "atomicdb" | "engine";
  outcome: AtomicDbOutcome;
  closure: string | null;
  score: number | null;
  point: number | null;
  mate: number | null;
  nodeBackedPlies: number | null;
  searchDepth?: number | null;
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

export type AtomicDbAnalysisBundle = {
  position: AtomicDbPosition | null;
  lines: Record<string, string[]>;
  positions: Record<string, AtomicDbPosition>;
};

type AtomicDbRequestResult = {
  task: string | number | null;
  taskState: string;
  budgetNodes: number | null;
  completedBudget: number | null;
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
  node_backed_plies?: unknown;
  search_depth?: unknown;
};

type AtomicDbResponse = {
  key?: unknown;
  status?: unknown;
  closure?: unknown;
  score?: unknown;
  point?: unknown;
  best_move?: unknown;
  moves?: unknown;
  analysis?: unknown;
};

type AtomicDbPrincipalVariationsResponse = {
  position?: unknown;
  lines?: unknown;
  positions?: unknown;
};

const UNKNOWN_EVALUATION: AtomicDbEvaluation = { type: "unknown" };
const TERMINAL_SCORE = 10_000;
const LICHESS_WINNING_CHANCES_COEFFICIENT = 0.00368208;

export const ATOMIC_DB_HOME_URL = "https://belzedar.duckdns.org/atomicdb/";

const nullableNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const nullableNonnegativeInteger = (value: unknown): number | null => {
  const number = nullableNumber(value);
  return number === null ? null : Math.max(0, Math.floor(number));
};

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
    nodeBackedPlies: nullableNonnegativeInteger(move.node_backed_plies),
    searchDepth: nullableNumber(move.search_depth),
  };
};

const turnFromFen = (fen: string): AtomicDbTurn =>
  fen.trim().split(/\s+/)[1] === "b" ? "black" : "white";

const fromSideToMovePerspective = (value: number, turn: AtomicDbTurn): number =>
  turn === "white" ? value : -value;

const mateDistanceFromMatePv = ({
  closure,
  score,
  point,
}: {
  closure: string | null;
  score: number | null;
  point: number | null;
}): number | null => {
  if (closure !== "MATE_PV" || score === null || point === null) return null;
  if (Math.abs(score) !== TERMINAL_SCORE || Math.sign(score) !== Math.sign(point)) return null;

  // AtomicDB encodes a mate bound as +/- (10_000 - plies) in `point` while
  // `score` remains the terminal +/-10_000 value.
  const distance = TERMINAL_SCORE - Math.abs(point);
  if (!Number.isInteger(distance) || distance <= 0 || distance >= TERMINAL_SCORE) return null;
  return Math.sign(score) * distance;
};

const evaluationFromValues = ({
  score,
  mate,
  closure,
  point,
  outcome,
  turn,
}: {
  score: number | null;
  mate: number | null;
  closure: string | null;
  point: number | null;
  outcome: AtomicDbOutcome;
  turn: AtomicDbTurn;
}): AtomicDbEvaluation => {
  // AtomicDB follows UCI: scores and mate distances use the side-to-move's perspective.
  // Convert once here so every UI surface consistently uses White's perspective.
  const mateDistance = mate ?? mateDistanceFromMatePv({ closure, score, point });
  if (mateDistance !== null) {
    return { type: "mate", value: fromSideToMovePerspective(mateDistance, turn) };
  }
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

  const analysis =
    response.analysis && typeof response.analysis === "object"
      ? (response.analysis as { lines?: unknown })
      : null;
  const searchDepthByMove = new Map<string, number>();
  if (Array.isArray(analysis?.lines)) {
    for (const value of analysis.lines) {
      if (!value || typeof value !== "object") continue;
      const line = value as { move?: unknown; depth?: unknown; pv?: unknown };
      const move =
        typeof line.move === "string"
          ? line.move
          : Array.isArray(line.pv) && typeof line.pv[0] === "string"
            ? line.pv[0]
            : "";
      const depth = nullableNumber(line.depth);
      if (/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(move) && depth !== null) {
        searchDepthByMove.set(move, Math.max(0, Math.floor(depth)));
      }
    }
  }
  const bestMove = nullableString(response.best_move);
  const moves = response.moves
    .map(parseMove)
    .filter((move): move is AtomicDbMove => move !== null)
    .map((move) => ({
      ...move,
      searchDepth: searchDepthByMove.get(move.uci) ?? move.searchDepth ?? null,
    }));
  // Solved AtomicDB positions can name a forced best move without repeating it in `moves`.
  // Keep the position usable by treating its solved evaluation as that move's evaluation.
  if (
    bestMove &&
    /^[a-h][1-8][a-h][1-8][nbrq]?$/.test(bestMove) &&
    !moves.some((move) => move.uci === bestMove)
  ) {
    moves.unshift({
      uci: bestMove,
      outcome: parseOutcome(response.status),
      closure: nullableString(response.closure),
      score: nullableNumber(response.score),
      point: nullableNumber(response.point),
      mate: null,
      nodeBackedPlies: null,
      searchDepth: searchDepthByMove.get(bestMove) ?? null,
    });
  }

  return {
    key: nullableString(response.key),
    outcome: parseOutcome(response.status),
    closure: nullableString(response.closure),
    score: nullableNumber(response.score),
    point: nullableNumber(response.point),
    bestMove,
    // AtomicDB ranks moves for the player to move. Preserve that order, including ties.
    moves,
  };
};

const atomicDbPrincipalVariationsRequestPath = (
  fen: string,
  lineCount: number,
  plyCount: number,
): string => {
  const params = new URLSearchParams({
    fen,
    line_count: String(lineCount),
    ply_count: String(plyCount),
  });
  return `/api/atomicdb-analysis?${params.toString()}`;
};

const parseAtomicDbPositionPreview = (value: unknown): AtomicDbPosition => {
  if (!value || typeof value !== "object") {
    throw new Error("AtomicDB returned an unexpected response.");
  }

  const response = value as AtomicDbResponse;
  const bestMove = nullableString(response.best_move);
  const closure = nullableString(response.closure);
  const isMatePreview = closure === "MATE_PV";
  // Continuation previews omit the `point`/`mate` fields needed to calculate an exact mate
  // distance. Keep that evaluation unknown until the position's complete bundle arrives instead
  // of briefly presenting it as a centipawn score or generic decisive result.
  const outcome = isMatePreview ? "UNKNOWN" : parseOutcome(response.status);
  const score = isMatePreview ? null : nullableNumber(response.score);
  const point = nullableNumber(response.point);
  const moves =
    bestMove && /^[a-h][1-8][a-h][1-8][nbrq]?$/.test(bestMove)
      ? [
          {
            uci: bestMove,
            outcome,
            closure,
            score,
            point,
            mate: null,
            nodeBackedPlies: null,
            searchDepth: null,
          },
        ]
      : [];

  return {
    key: nullableString(response.key),
    outcome,
    closure,
    score,
    point,
    bestMove,
    moves,
  };
};

export const requestAtomicDbAnalysis = (fen: string): Promise<AtomicDbRequestResult> =>
  postApi<AtomicDbRequestResult>(
    "/api/atomicdb-request",
    { fen },
    {
      errorMessage: "Unable to request AtomicDB analysis.",
      invalidMessage: "AtomicDB returned an unexpected request response.",
    },
  );

export const fetchAtomicDbPositions = async (
  fens: string[],
  signal?: AbortSignal,
): Promise<Record<string, AtomicDbPosition | null>> => {
  const body = await postApi<unknown>(
    "/api/atomicdb-analysis",
    { fens },
    {
      errorMessage: "AtomicDB analysis is unavailable.",
      invalidMessage: "AtomicDB returned an unexpected response.",
      ...(signal ? { signal } : {}),
    },
  );

  const payload = body && typeof body === "object" ? (body as { positions?: unknown }) : {};
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

export const fetchAtomicDbAnalysisBundle = async (
  fen: string,
  lineCount: number,
  plyCount: number,
  signal?: AbortSignal,
): Promise<AtomicDbAnalysisBundle> => {
  let body: unknown;
  try {
    body = await apiRequest<unknown>(
      atomicDbPrincipalVariationsRequestPath(fen, lineCount, plyCount),
      {
        errorMessage: "AtomicDB analysis is unavailable.",
        invalidMessage: "AtomicDB returned an unexpected response.",
        ...(signal ? { signal } : {}),
      },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { position: null, lines: {}, positions: {} };
    }
    throw error;
  }

  const payload =
    body && typeof body === "object" ? (body as AtomicDbPrincipalVariationsResponse) : {};
  if (!payload.position || typeof payload.position !== "object") {
    throw new Error("AtomicDB returned an unexpected response.");
  }
  const position = parseAtomicDbResponse(payload.position);
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
      positions[positionFen] = parseAtomicDbPositionPreview(value);
    }
  }
  return { position, lines, positions };
};

export const getAtomicDbMoveEvaluation = (move: AtomicDbMove, fen: string): AtomicDbEvaluation =>
  evaluationFromValues({
    score: move.score,
    mate: move.mate,
    closure: move.closure,
    point: move.point,
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
    closure: position.closure,
    point: position.point,
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
