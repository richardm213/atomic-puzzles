import { INITIAL_FEN } from "chessops/fen";

import { atomicOpenings, getOpeningVariations } from "./atomicOpenings";
import { atomicWinChance } from "./atomicWinChance";
import { buildSolutionMoveTree, fenAfterAtomicMove, parseSolutionUciLines } from "./chess/pgn";

export const GAME_ANALYSIS_VARIATION_SIZE = 5;
export const GAME_ANALYSIS_COST = 1;
export const GAME_ANALYSIS_BUDGET_NODES = 128_000_000;
const GAME_ANALYSIS_INITIAL_ACCURACY_PLIES = 2;
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
  variationPlies?: number | undefined;
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

export type GameAnalysisOpeningReference = { fen: string; openingKey: string };
export type PersistedGameAnalysisPosition = StoredAtomicDbPosition | GameAnalysisOpeningReference;
export type PersistedGameAnalysisSummary = Omit<
  GameAnalysisSummary,
  "positions" | "evaluations"
> & {
  positions: PersistedGameAnalysisPosition[];
  evaluations: (number | null)[];
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
  const lineByMove = new Map(lines.map((line) => [line.move ?? line.pv[0], line]));
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

const variationPrefix = (move: string, pv: unknown): string[] => {
  if (!Array.isArray(pv) || pv[0] !== move) return [];
  const moves: string[] = [];
  for (const ply of pv.slice(0, GAME_ANALYSIS_VARIATION_SIZE)) {
    if (typeof ply !== "string" || !/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(ply)) break;
    moves.push(ply);
  }
  return moves;
};

/** Some backed continuations stop early, even though the same response has a full engine PV. */
export const fillStoredAtomicDbVariations = (
  position: StoredAtomicDbPosition,
): StoredAtomicDbPosition => {
  if (position.variationPlies !== GAME_ANALYSIS_VARIATION_SIZE || !position.candidates) {
    return position;
  }
  const rawLines = new Map(position.lines.map((line) => [line.move ?? line.pv[0], line.pv]));
  return {
    ...position,
    candidates: position.candidates.map((candidate) => {
      const raw = variationPrefix(candidate.move, rawLines.get(candidate.move));
      if (raw.length <= candidate.pv.length) return candidate;
      let fen = position.fen;
      const valid: string[] = [];
      for (const ply of raw) {
        const next = fenAfterAtomicMove(fen, ply);
        if (!next) break;
        fen = next;
        valid.push(ply);
      }
      // Do not splice a raw line into a different backed branch: use one legal line end to end.
      return valid.length > candidate.pv.length ? { ...candidate, pv: valid } : candidate;
    }),
  };
};

/** Use the same ranked continuation bundle as the interactive analysis board. */
export const parseStoredAtomicDbVariationBundle = (
  fen: string,
  bundle: { position: unknown; lines: Record<string, unknown> },
): StoredAtomicDbPosition | null => {
  const position = parseStoredAtomicDbPosition(fen, bundle.position);
  if (!position) return null;
  const candidates = new Map(position.candidates?.map((candidate) => [candidate.move, candidate]));
  const ordered = [...new Set([...Object.keys(bundle.lines), ...candidates.keys()])];
  return fillStoredAtomicDbVariations({
    ...position,
    variationPlies: GAME_ANALYSIS_VARIATION_SIZE,
    candidates: ordered
      .flatMap((move) => {
        const candidate = candidates.get(move);
        if (!candidate) return [];
        const pv = variationPrefix(move, bundle.lines[move]);
        return [{ ...candidate, pv: pv.length > 0 ? pv : [move] }];
      })
      .slice(0, GAME_ANALYSIS_VARIATION_SIZE),
  });
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

const CENTIPAWN_CEILING = 1_000;
const ceiledCentipawns = (centipawns: number): number =>
  Math.max(-CENTIPAWN_CEILING, Math.min(CENTIPAWN_CEILING, centipawns));

const winPercent = (centipawns: number): number =>
  100 * atomicWinChance(ceiledCentipawns(centipawns));

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

// The score after a move is from the opponent's perspective.
const newlyAllowsDecisiveLoss = (before: ReviewScore, after: ReviewScore): boolean =>
  decisiveOutcome(before) !== -1 && decisiveOutcome(after) === 1;

const classificationForLoss = (loss: number): MoveClassification => {
  if (loss >= 15) return "blunder";
  if (loss >= 10) return "mistake";
  if (loss >= 5) return "inaccuracy";
  return "best";
};

const reviewWinPercent = (score: ReviewScore): number => {
  const outcome = decisiveOutcome(score);
  if (outcome === 1) return 100;
  if (outcome === -1) return 0;
  return 100 * atomicWinChance(score.value);
};

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
  blackMovesFirst = false,
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
    const color: "white" | "black" = (index % 2 === 0) !== blackMovesFirst ? "white" : "black";
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
  {
    ignoredPlies,
    allowedMatePlies,
    blackMovesFirst = false,
  }: {
    ignoredPlies?: ReadonlySet<number>;
    allowedMatePlies?: ReadonlySet<number>;
    blackMovesFirst?: boolean;
  } = {},
): { whiteAverageCentipawnLoss: number; blackAverageCentipawnLoss: number } => {
  const losses = { white: [] as number[], black: [] as number[] };
  for (let index = 0; index + 1 < evaluations.length; index += 1) {
    const ply = index + 1;
    if (ignoredPlies?.has(ply)) continue;
    const color = (index % 2 === 0) !== blackMovesFirst ? "white" : "black";
    const before = ceiledCentipawns(evaluations[index]!);
    // A mate in the engine's principal variation may have no matching centipawn score.
    const after = allowedMatePlies?.has(ply)
      ? color === "white"
        ? -CENTIPAWN_CEILING
        : CENTIPAWN_CEILING
      : ceiledCentipawns(evaluations[ply]!);
    losses[color].push(Math.max(0, color === "white" ? before - after : after - before));
  }
  const mean = (values: number[]): number =>
    values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  return {
    whiteAverageCentipawnLoss: mean(losses.white),
    blackAverageCentipawnLoss: mean(losses.black),
  };
};

export const gameAnalysisPositionKey = (fen: string): string =>
  fen.trim().split(/\s+/).slice(0, 4).join(" ");
const standardStartKey = gameAnalysisPositionKey(INITIAL_FEN);

let openingFens: ReadonlyMap<string, string> | undefined;
export const gameAnalysisOpeningFens = (): ReadonlyMap<string, string> => {
  if (openingFens) return openingFens;
  const fens = new Map([[standardStartKey, INITIAL_FEN]]);
  for (const opening of atomicOpenings) {
    const pgns = [
      opening.setup,
      ...getOpeningVariations(opening).map(({ pgn }) => pgn),
      ...(opening.branches ?? []).flatMap((branch) => [
        ...(branch.setup ? [branch.setup] : []),
        ...(branch.groups ?? []).map(({ setup }) => setup),
      ]),
    ];
    for (const pgn of pgns) {
      for (const line of parseSolutionUciLines(INITIAL_FEN, pgn)) {
        for (const fen of buildGamePositionFens(
          INITIAL_FEN,
          line.map(({ uci }) => uci),
        )) {
          fens.set(gameAnalysisPositionKey(fen), fen);
        }
      }
    }
  }
  return (openingFens = fens);
};

export const gameAnalysisOpeningKey = (fen: string): string | null => {
  const key = gameAnalysisPositionKey(fen);
  return gameAnalysisOpeningFens().has(key) ? key : null;
};

export const unavailableGameAnalysisOpening = (fen: string): StoredAtomicDbPosition => ({
  fen,
  key: null,
  status: "UNKNOWN",
  closure: null,
  score: null,
  point: null,
  bestMove: null,
  budgetNodes: null,
  lines: [],
  candidates: [],
  variationPlies: GAME_ANALYSIS_VARIATION_SIZE,
});

export const isGameAnalysisOpeningReference = (
  position: PersistedGameAnalysisPosition,
): position is GameAnalysisOpeningReference => "openingKey" in position;

export const referenceGameAnalysisOpenings = (
  summary: GameAnalysisSummary,
  openings: ReadonlyMap<string, StoredAtomicDbPosition>,
): PersistedGameAnalysisSummary => {
  const positions = summary.positions.map((position) => {
    const openingKey = gameAnalysisOpeningKey(position.fen);
    return openingKey && position.status !== "SKIPPED" && openings.has(openingKey)
      ? { fen: position.fen, openingKey }
      : position;
  });
  return {
    ...summary,
    positions,
    evaluations: summary.evaluations.map((value, index) => {
      const position = positions[index];
      return position && isGameAnalysisOpeningReference(position) ? null : value;
    }),
  };
};

export const mergeGameAnalysisOpenings = (
  positions: readonly PersistedGameAnalysisPosition[],
  openings: ReadonlyMap<string, StoredAtomicDbPosition>,
): StoredAtomicDbPosition[] =>
  positions.map((position) => {
    const reference = isGameAnalysisOpeningReference(position);
    const key = reference ? position.openingKey : gameAnalysisOpeningKey(position.fen);
    if (key && (isGameAnalysisOpeningReference(position) || position.status !== "SKIPPED")) {
      const opening = openings.get(key);
      if (opening) return { ...opening, fen: position.fen };
    }
    return reference ? unavailableGameAnalysisOpening(position.fen) : position;
  });
let openingBook: ReturnType<typeof buildSolutionMoveTree> | undefined;

export const catalogOpeningPlyCount = (initialFen: string, moves: Iterable<string>): number => {
  if (gameAnalysisPositionKey(initialFen) !== standardStartKey) return 0;
  openingBook ??= buildSolutionMoveTree(
    atomicOpenings.flatMap((opening) =>
      [opening.setup, ...getOpeningVariations(opening).map(({ pgn }) => pgn)].flatMap((pgn) =>
        parseSolutionUciLines(INITIAL_FEN, pgn).map((line) => line.map(({ uci }) => uci)),
      ),
    ),
  );
  // A move is in the book only in a catalogued move order. Stop at the first deviation.
  let node = openingBook;
  let plies = 0;
  for (const move of moves) {
    const next = node.children.get(move.toLowerCase());
    if (!next) break;
    node = next;
    plies += 1;
  }
  return plies;
};

export const applyGameAnalysisOpeningReview = (
  summary: GameAnalysisSummary,
  { wolfrandom }: { wolfrandom: boolean },
): GameAnalysisSummary => {
  const blackMovesFirst = !wolfrandom && summary.positions[0]?.fen.trim().split(/\s+/)[1] === "b";
  const bookPlies = wolfrandom
    ? 0
    : catalogOpeningPlyCount(
        summary.positions[0]?.fen ?? "",
        summary.assessments.map(({ uci }) => uci),
      );
  const openingPlies = wolfrandom
    ? Array.from({ length: WOLFRANDOM_RANDOMIZED_PLIES }, (_, index) => index + 1)
    : blackMovesFirst
      ? [1, 2, 4]
      : [1, 2, 3];
  const ignoredPlies = new Set<number>(Array.from({ length: bookPlies }, (_, index) => index + 1));
  const allowedMatePlies = new Set<number>();
  for (const ply of openingPlies) {
    if (ignoredPlies.has(ply)) continue;
    const before = summary.positions[ply - 1];
    const after = summary.positions[ply];
    if (
      !wolfrandom &&
      before &&
      after &&
      newlyAllowsDecisiveLoss(reviewScoreForPosition(before), reviewScoreForPosition(after))
    ) {
      allowedMatePlies.add(ply);
    } else {
      ignoredPlies.add(ply);
    }
  }

  const assessments = summary.assessments.map((assessment) =>
    ignoredPlies.has(assessment.ply)
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
    const counts = (assessment.ply % 2 === 1) !== blackMovesFirst ? whiteCounts : blackCounts;
    counts[assessment.classification] += 1;
  }
  const accuracyStart = wolfrandom
    ? WOLFRANDOM_RANDOMIZED_PLIES
    : Math.max(GAME_ANALYSIS_INITIAL_ACCURACY_PLIES, bookPlies);

  return {
    ...summary,
    assessments,
    whiteCounts,
    blackCounts,
    ...gameAccuracyForEvaluations(
      summary.evaluations.slice(accuracyStart),
      blackMovesFirst !== (accuracyStart % 2 === 1),
    ),
    ...averageCentipawnLossForEvaluations(summary.evaluations, {
      ignoredPlies,
      allowedMatePlies,
      blackMovesFirst,
    }),
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
    // The next position's score is from the opponent's perspective.
    const afterChance = 100 - reviewWinPercent(afterScore);
    const loss = Math.max(0, beforeChance - afterChance);
    const classification = classificationForLoss(loss);
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
