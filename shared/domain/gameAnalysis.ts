import { fenAfterAtomicMove } from "./puzzles/solutionPgn";

export const GAME_ANALYSIS_COST = 1;
export const GAME_ANALYSIS_BUDGET_NODES = 128_000_000;
export const GAME_ANALYSIS_INITIAL_REVIEW_PLIES = 2;
export const WOLFRANDOM_RANDOMIZED_PLIES = 6;

export const GAME_ANALYSIS_STATUSES = ["queued", "processing", "ready", "failed"] as const;
export type GameAnalysisStatus = (typeof GAME_ANALYSIS_STATUSES)[number];

export const MOVE_CLASSIFICATIONS = [
  "best",
  "excellent",
  "good",
  "inaccuracy",
  "mistake",
  "blunder",
] as const;
export type MoveClassification = (typeof MOVE_CLASSIFICATIONS)[number];

export type AtomicDbAnalysisLine = {
  move: string | null;
  cp: number | null;
  mate: number | null;
  depth: number | null;
  nodes: number | null;
  pv: string[];
};

export type StoredAtomicDbCandidate = {
  move: string;
  status: string;
  closure: string | null;
  score: number | null;
  point: number | null;
  mate: number | null;
  nodeBackedPlies?: number | null | undefined;
  depth?: number | null | undefined;
  pv: string[];
};

export type StoredAtomicDbPosition = {
  fen: string;
  key: string | null;
  status: string;
  closure: string | null;
  score: number | null;
  point: number | null;
  bestMove: string | null;
  budgetNodes: number | null;
  lines: AtomicDbAnalysisLine[];
  candidates?: StoredAtomicDbCandidate[] | undefined;
};

export type GameMoveAssessment = {
  ply: number;
  uci: string;
  classification: MoveClassification;
  symbol: string;
  winPercentBefore: number;
  winPercentAfter: number;
  winPercentLoss: number;
  bestMove: string | null;
};

export type GameAnalysisSummary = {
  positions: StoredAtomicDbPosition[];
  assessments: GameMoveAssessment[];
  evaluations: number[];
  whiteAccuracy: number;
  blackAccuracy: number;
  whiteAverageCentipawnLoss: number;
  blackAverageCentipawnLoss: number;
  whiteCounts: Record<MoveClassification, number>;
  blackCounts: Record<MoveClassification, number>;
};

export type GameAnalysisRecord = {
  gameId: string;
  status: GameAnalysisStatus;
  requestedBy: string;
  totalPositions: number;
  completedPositions: number;
  queuedPositions: number;
  cost: number;
  error: string | null;
  result: GameAnalysisSummary | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export const buildGamePositionFens = (initialFen: string, moves: readonly string[]): string[] => {
  const positions = [initialFen.trim()];
  let currentFen = initialFen.trim();
  for (const uci of moves) {
    const nextFen = fenAfterAtomicMove(currentFen, uci);
    if (!nextFen) throw new Error(`Illegal game move: ${uci}`);
    positions.push(nextFen);
    currentFen = nextFen;
  }
  return positions;
};

const nullableNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const nullableNonnegativeInteger = (value: unknown): number | null => {
  const number = nullableNumber(value);
  return number === null ? null : Math.max(0, Math.floor(number));
};
const nullableString = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

export const parseStoredAtomicDbPosition = (
  fen: string,
  value: unknown,
): StoredAtomicDbPosition | null => {
  if (!value || typeof value !== "object") return null;
  const response = value as Record<string, unknown>;
  const analysis =
    response.analysis && typeof response.analysis === "object"
      ? (response.analysis as Record<string, unknown>)
      : null;
  const lines = Array.isArray(analysis?.lines)
    ? analysis.lines.flatMap((entry): AtomicDbAnalysisLine[] => {
        if (!entry || typeof entry !== "object") return [];
        const line = entry as Record<string, unknown>;
        return [
          {
            move: nullableString(line.move),
            cp: nullableNumber(line.cp),
            mate: nullableNumber(line.mate),
            depth: nullableNumber(line.depth),
            nodes: nullableNumber(line.nodes),
            pv: Array.isArray(line.pv)
              ? line.pv.filter((move): move is string => typeof move === "string").slice(0, 16)
              : [],
          },
        ];
      })
    : [];
  const lineByMove = new Map(
    lines.flatMap((line) => (line.move ? ([[line.move, line]] as const) : [])),
  );
  const candidates = Array.isArray(response.moves)
    ? response.moves
        .flatMap((entry): StoredAtomicDbCandidate[] => {
          if (!entry || typeof entry !== "object") return [];
          const candidate = entry as Record<string, unknown>;
          const move = nullableString(candidate.uci);
          if (!move || !/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(move) || candidate.floor === true) {
            return [];
          }
          const line = lineByMove.get(move);
          return [
            {
              move,
              status: typeof candidate.status === "string" ? candidate.status : "UNKNOWN",
              closure: nullableString(candidate.closure),
              score: nullableNumber(candidate.score),
              point: nullableNumber(candidate.point),
              mate: nullableNumber(candidate.mate),
              nodeBackedPlies: nullableNonnegativeInteger(candidate.node_backed_plies),
              depth: line?.depth ?? nullableNonnegativeInteger(candidate.search_depth),
              pv: line?.pv ?? [move],
            },
          ];
        })
        .slice(0, 5)
    : [];
  const nodeCounts = [
    nullableNumber(analysis?.budget_nodes),
    nullableNumber(analysis?.nodes),
    nullableNumber(response.nodes),
    ...lines.map((line) => line.nodes),
  ].filter((value): value is number => value !== null);

  return {
    fen,
    key: nullableString(response.key),
    status: typeof response.status === "string" ? response.status : "UNKNOWN",
    closure: nullableString(response.closure),
    score: nullableNumber(response.score),
    point: nullableNumber(response.point),
    bestMove: nullableString(response.best_move),
    budgetNodes: nodeCounts.length > 0 ? Math.max(...nodeCounts) : null,
    lines,
    candidates,
  };
};

const terminalCentipawns = (status: string, fen: string): number | null => {
  if (status === "DRAW") return 0;
  const whiteToMove = fen.trim().split(/\s+/)[1] !== "b";
  if (status === "WHITE_WIN") return whiteToMove ? 10_000 : -10_000;
  if (status === "BLACK_WIN") return whiteToMove ? -10_000 : 10_000;
  return null;
};

const positionCentipawns = (position: StoredAtomicDbPosition): number =>
  terminalCentipawns(position.status, position.fen) ??
  position.score ??
  position.point ??
  position.lines[0]?.cp ??
  0;

export const evaluationsForPositions = (positions: readonly StoredAtomicDbPosition[]): number[] =>
  positions.map((position) =>
    position.fen.trim().split(/\s+/)[1] === "b"
      ? -positionCentipawns(position)
      : positionCentipawns(position),
  );

const ceiledCentipawns = (centipawns: number): number =>
  Math.max(-1_000, Math.min(1_000, centipawns));

const winningChances = (centipawns: number): number =>
  2 / (1 + Math.exp(-0.00368208 * centipawns)) - 1;

const winPercent = (centipawns: number): number =>
  50 + 50 * winningChances(ceiledCentipawns(centipawns));

type ReviewScore = { type: "cp"; value: number } | { type: "mate"; value: 1 | -1 };

const reviewScoreForPosition = (position: StoredAtomicDbPosition): ReviewScore => {
  const outcome = terminalCentipawns(position.status, position.fen);
  if (outcome === 0) return { type: "cp", value: 0 };
  if (outcome !== null) return { type: "mate", value: outcome > 0 ? 1 : -1 };
  // AtomicDB's backed mate PV encodes its winner in the terminal score.
  const { score, closure, bestMove: best } = position;
  if (closure === "MATE_PV" && (score === 10_000 || score === -10_000)) {
    return { type: "mate", value: score > 0 ? 1 : -1 };
  }
  const line = best
    ? position.lines.find((entry) => (entry.move ?? entry.pv[0]) === best)
    : position.lines[0];
  const mate = position.candidates?.find((entry) => entry.move === best)?.mate ?? line?.mate;
  if (typeof mate === "number") return { type: "mate", value: mate > 0 ? 1 : -1 };
  return { type: "cp", value: positionCentipawns(position) };
};

const decisiveOutcome = (score: ReviewScore): -1 | 0 | 1 => {
  // AtomicDB can report a decisive result as 100 pawns instead of a mate distance.
  if (score.type === "mate") return score.value;
  if (score.value >= 10_000) return 1;
  if (score.value <= -10_000) return -1;
  return 0;
};

const decisiveLossGrade = (advantage: number): MoveClassification => {
  if (advantage > 1_500) return "inaccuracy";
  if (advantage >= 700) return "mistake";
  return "blunder";
};

const classificationFor = (before: ReviewScore, after: ReviewScore): MoveClassification => {
  // Both scores are from the side to move. After the move, that is the opponent.
  const beforeOutcome = decisiveOutcome(before);
  const afterOutcome = decisiveOutcome(after);
  if (beforeOutcome !== -1 && afterOutcome === 1) {
    return decisiveLossGrade(before.type === "cp" ? -before.value : 0);
  }
  if (beforeOutcome === 1 && afterOutcome !== -1) {
    return decisiveLossGrade(after.type === "cp" ? -after.value : 0);
  }

  // Lichess grades CP swings on the unclipped [-1, 1] scale (0.1 = 5 percentage points).
  if (before.type === "cp" && after.type === "cp") {
    const loss = winningChances(before.value) + winningChances(after.value);
    if (loss >= 0.3) return "blunder";
    if (loss >= 0.2) return "mistake";
    if (loss >= 0.1) return "inaccuracy";
  }
  return "best";
};

const reviewWinPercent = (score: ReviewScore): number =>
  score.type === "mate" ? winPercent(score.value * 1_000) : 50 + 50 * winningChances(score.value);

export const CLASSIFICATION_SYMBOLS: Record<MoveClassification, string> = {
  best: "✓",
  excellent: "★",
  good: "!",
  inaccuracy: "?!",
  mistake: "?",
  blunder: "??",
};

const emptyCounts = (): Record<MoveClassification, number> => ({
  best: 0,
  excellent: 0,
  good: 0,
  inaccuracy: 0,
  mistake: 0,
  blunder: 0,
});

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const standardDeviation = (values: number[]): number => {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const moveAccuracy = (before: number, after: number): number => {
  if (after >= before) return 100;
  const winDiff = before - after;
  return clamp(
    103.1668100711649 * Math.exp(-0.04354415386753951 * winDiff) - 3.166924740191411 + 1,
    0,
    100,
  );
};

const colorAccuracy = (
  moveAccuracies: Array<{ accuracy: number; color: "white" | "black"; weight: number }>,
  color: "white" | "black",
): number => {
  const moves = moveAccuracies.filter((move) => move.color === color);
  if (!moves.length) return 100;
  const weightTotal = moves.reduce((sum, move) => sum + move.weight, 0);
  const weightedMean =
    moves.reduce((sum, move) => sum + move.accuracy * move.weight, 0) / weightTotal;
  const harmonicMean = moves.some((move) => move.accuracy === 0)
    ? 0
    : moves.length / moves.reduce((sum, move) => sum + 1 / move.accuracy, 0);
  return Math.round((weightedMean + harmonicMean) / 2);
};

export const gameAccuracyForEvaluations = (
  evaluations: readonly number[],
): { whiteAccuracy: number; blackAccuracy: number } => {
  if (evaluations.length <= 1) return { whiteAccuracy: 100, blackAccuracy: 100 };
  const winPercents = evaluations.map(winPercent);
  const moveCount = evaluations.length - 1;
  const windowSize = clamp(Math.floor(moveCount / 10), 2, 8);
  const firstWindow = winPercents.slice(0, windowSize);
  const windows: number[][] = Array.from(
    { length: Math.max(0, Math.min(windowSize, winPercents.length) - 2) },
    () => firstWindow,
  );
  for (let index = 0; index + windowSize <= winPercents.length; index += 1) {
    windows.push(winPercents.slice(index, index + windowSize));
  }
  const moves = Array.from({ length: moveCount }, (_, index) => {
    const color: "white" | "black" = index % 2 === 0 ? "white" : "black";
    const previous = winPercents[index]!;
    const next = winPercents[index + 1]!;
    return {
      color,
      accuracy: moveAccuracy(
        color === "white" ? previous : next,
        color === "white" ? next : previous,
      ),
      weight: clamp(standardDeviation(windows[index] ?? firstWindow), 0.5, 12),
    };
  });
  return {
    whiteAccuracy: colorAccuracy(moves, "white"),
    blackAccuracy: colorAccuracy(moves, "black"),
  };
};

export const averageCentipawnLossForEvaluations = (
  evaluations: readonly number[],
): { whiteAverageCentipawnLoss: number; blackAverageCentipawnLoss: number } => {
  const losses = { white: [] as number[], black: [] as number[] };
  for (let index = 0; index + 1 < evaluations.length; index += 1) {
    const before = ceiledCentipawns(evaluations[index]!);
    const after = ceiledCentipawns(evaluations[index + 1]!);
    const color = index % 2 === 0 ? "white" : "black";
    losses[color].push(Math.max(0, color === "white" ? before - after : after - before));
  }
  const mean = (values: number[]): number =>
    values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  return {
    whiteAverageCentipawnLoss: mean(losses.white),
    blackAverageCentipawnLoss: mean(losses.black),
  };
};

export const ignoreInitialGameAnalysisPlies = (
  summary: GameAnalysisSummary,
  ignoredPlies: number,
): GameAnalysisSummary => {
  const count = Math.max(0, Math.floor(ignoredPlies));
  if (count === 0) return summary;

  const assessments = summary.assessments.map((assessment) =>
    assessment.ply <= count
      ? {
          ...assessment,
          classification: "best" as const,
          symbol: CLASSIFICATION_SYMBOLS.best,
        }
      : assessment,
  );
  const whiteCounts = emptyCounts();
  const blackCounts = emptyCounts();
  for (const assessment of assessments) {
    (assessment.ply % 2 === 1 ? whiteCounts : blackCounts)[assessment.classification] += 1;
  }
  const scoredEvaluations = summary.evaluations.slice(count);

  return {
    ...summary,
    assessments,
    whiteCounts,
    blackCounts,
    ...gameAccuracyForEvaluations(scoredEvaluations),
    ...averageCentipawnLossForEvaluations(scoredEvaluations),
  };
};

export const buildGameAnalysisSummary = (
  moves: readonly string[],
  positions: StoredAtomicDbPosition[],
): GameAnalysisSummary => {
  if (positions.length !== moves.length + 1) {
    throw new Error("Game analysis positions do not match the move list.");
  }

  const evaluations = evaluationsForPositions(positions);
  const reviewScores = positions.map(reviewScoreForPosition);
  const assessments = moves.map((uci, index): GameMoveAssessment => {
    const beforeScore = reviewScores[index]!;
    const afterScore = reviewScores[index + 1]!;
    const beforeChance = reviewWinPercent(beforeScore);
    const afterChance = 100 - reviewWinPercent(afterScore);
    const loss = Math.max(0, beforeChance - afterChance);
    const classification = classificationFor(beforeScore, afterScore);
    return {
      ply: index + 1,
      uci,
      classification,
      symbol: CLASSIFICATION_SYMBOLS[classification],
      winPercentBefore: Math.round(beforeChance * 10) / 10,
      winPercentAfter: Math.round(afterChance * 10) / 10,
      winPercentLoss: Math.round(loss * 10) / 10,
      bestMove: positions[index]!.bestMove,
    };
  });
  const whiteAssessments = assessments.filter((assessment) => assessment.ply % 2 === 1);
  const blackAssessments = assessments.filter((assessment) => assessment.ply % 2 === 0);
  const whiteCounts = emptyCounts();
  const blackCounts = emptyCounts();
  for (const assessment of whiteAssessments) whiteCounts[assessment.classification] += 1;
  for (const assessment of blackAssessments) blackCounts[assessment.classification] += 1;
  const accuracies = gameAccuracyForEvaluations(evaluations);
  const averageCentipawnLosses = averageCentipawnLossForEvaluations(evaluations);

  return {
    positions,
    assessments,
    evaluations,
    ...accuracies,
    ...averageCentipawnLosses,
    whiteCounts,
    blackCounts,
  };
};
