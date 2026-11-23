import {
  atomicCastleFromKingDestination,
  canonicalAtomicMoveUci,
  createAtomicPosition,
  moveFromUci,
} from "../../../shared/domain/chess/pgn";
import {
  type AtomicDbEvaluation,
  type AtomicDbPosition,
  getAtomicDbMoveEvaluation,
  getAtomicDbPositionEvaluation,
} from "../../utils/atomicDb";
import { analyzeFairyStockfishPosition, type EngineCandidate } from "../practice/fairyStockfish";

export type AnalysisLines = Record<string, string[]>;
type PositionAnalysis = { position: AtomicDbPosition; lines: AnalysisLines };

const MATE_SEARCH_THRESHOLD_CP = 4_000;

const needsMateSearch = (evaluation: AtomicDbEvaluation): boolean =>
  evaluation.type === "centipawns" && Math.abs(evaluation.value) >= MATE_SEARCH_THRESHOLD_CP;

const engineMove = (candidate: EngineCandidate): AtomicDbPosition["moves"][number] => ({
  uci: candidate.move,
  origin: "engine",
  outcome: "UNKNOWN",
  closure: null,
  score: candidate.scoreType === "cp" ? candidate.score : null,
  point: null,
  mate: candidate.scoreType === "mate" ? candidate.score : null,
  nodeBackedPlies: null,
  searchDepth: candidate.depth ?? null,
});

const enginePosition = (candidates: EngineCandidate[]): AtomicDbPosition => {
  const best = candidates[0] ?? null;
  return {
    key: null,
    outcome: "UNKNOWN",
    closure: null,
    score: best?.scoreType === "cp" ? best.score : null,
    point: null,
    bestMove: best?.move ?? null,
    moves: candidates.map(engineMove),
  };
};

export const analyzedAtomicDbMoves = (fen: string, position: AtomicDbPosition) =>
  position.moves.filter((move) => getAtomicDbMoveEvaluation(move, fen).type !== "unknown");

const positionForAnalysis = (fen: string) => {
  try {
    return createAtomicPosition(fen);
  } catch {
    return null;
  }
};

export const verifyAtomicDbMates = async (
  fen: string,
  analysis: PositionAnalysis,
  signal: AbortSignal,
  verifyMoves = false,
): Promise<PositionAnalysis> => {
  const { position, lines } = analysis;
  const positionEvaluation = getAtomicDbPositionEvaluation(position, fen);
  const verifyPosition = needsMateSearch(positionEvaluation);
  const extremeMoves = verifyMoves
    ? position.moves.filter((move) => needsMateSearch(getAtomicDbMoveEvaluation(move, fen)))
    : [];
  if (!verifyPosition && !extremeMoves.length) return analysis;

  const board = positionForAnalysis(fen);
  if (!board || board.isEnd() || signal.aborted) return analysis;
  const root = (uci: string) => canonicalAtomicMoveUci(board, uci);
  const isMate = (candidate: EngineCandidate): boolean =>
    candidate.scoreType === "mate" &&
    Number.isSafeInteger(candidate.score) &&
    candidate.score !== 0;
  const search = (count: number, searchMoves?: string[]) =>
    analyzeFairyStockfishPosition(
      fen,
      count,
      signal,
      undefined,
      "atomic-stockfish",
      searchMoves ? { searchMoves, candidateLimit: count } : undefined,
    ).catch(() => []);

  // A position score needs an unrestricted search. A candidate score needs that exact root.
  const best = verifyPosition ? (await search(1)).find(isMate) : undefined;
  const bestKey = best ? root(best.move) : null;
  const roots = new Set(
    extremeMoves.flatMap(({ uci }) => {
      const key = root(uci);
      return key && key !== bestKey ? [key] : [];
    }),
  );
  if (signal.aborted) return analysis;
  const candidates = roots.size ? await search(roots.size, [...roots]) : [];
  const mates = new Map<string, EngineCandidate>();
  for (const candidate of candidates) {
    const key = root(candidate.move);
    if (key && roots.has(key) && isMate(candidate)) mates.set(key, candidate);
  }
  if (best && bestKey) mates.set(bestKey, best);
  if (signal.aborted || !mates.size) return analysis;

  const mateLines = { ...lines };
  const withMate = (uci: string, candidate: EngineCandidate) => {
    mateLines[uci] = [uci, ...(candidate.principalVariation?.slice(1) ?? [])];
    return { ...engineMove(candidate), uci };
  };
  const moves = position.moves.map((move) => {
    const mate = mates.get(root(move.uci) ?? "");
    return mate ? withMate(move.uci, mate) : move;
  });
  let bestMove = position.bestMove;
  if (best && bestKey) {
    const index = moves.findIndex(({ uci }) => root(uci) === bestKey);
    const verified = index >= 0 ? moves.splice(index, 1)[0]! : withMate(bestKey, best);
    moves.unshift(verified);
    bestMove = verified.uci;
  }
  return {
    position: {
      ...position,
      bestMove,
      moves,
      ...(positionEvaluation.type === "mate" ? {} : { mate: best && bestKey ? best.score : null }),
    },
    lines: mateLines,
  };
};

export const createAnalysisMoveComposer = (fen: string, lineCount: number, plyCount: number) => {
  const board = positionForAnalysis(fen);
  const rootMoveKey = (uci: string) => (board && canonicalAtomicMoveUci(board, uci)) ?? uci;
  const withMoves = (
    position: AtomicDbPosition,
    moves: AtomicDbPosition["moves"],
  ): AtomicDbPosition => {
    const bestKey = position.bestMove ? rootMoveKey(position.bestMove) : null;
    const bestMove = bestKey && moves.find((move) => rootMoveKey(move.uci) === bestKey)?.uci;
    return { ...position, moves, bestMove: bestMove || position.bestMove };
  };
  const linesForMoves = (
    moves: AtomicDbPosition["moves"],
    ...sources: Record<string, string[]>[]
  ): Record<string, string[]> => {
    const byMove = new Map<string, string[]>();
    for (const source of sources) {
      for (const [uci, line] of Object.entries(source)) {
        const key = rootMoveKey(uci);
        const previous = byMove.get(key);
        if (!previous || Math.min(line.length, plyCount) > previous.length) {
          byMove.set(key, line.slice(0, plyCount));
        }
      }
    }
    return Object.fromEntries(
      moves
        .slice(0, lineCount)
        .map(({ uci }) => [uci, [uci, ...(byMove.get(rootMoveKey(uci))?.slice(1) ?? [])]]),
    );
  };
  const engineCandidatesByMove = (candidates: EngineCandidate[]): Map<string, EngineCandidate> => {
    const moves = new Map<string, EngineCandidate>();
    for (const candidate of candidates) {
      const key = rootMoveKey(candidate.move);
      if (!moves.has(key)) moves.set(key, candidate);
    }
    return moves;
  };
  const engineLinesFor = (candidates: EngineCandidate[]): Record<string, string[]> =>
    Object.fromEntries(
      candidates.map((candidate) => [
        candidate.move,
        candidate.principalVariation ?? [candidate.move],
      ]),
    );

  const databaseResult = (position: AtomicDbPosition, lines: AnalysisLines): PositionAnalysis => {
    if (!board) return { position, lines };
    const replays = (root: string, tail: string[]): boolean => {
      const replay = board.clone();
      for (const uci of [root, ...tail]) {
        const move = moveFromUci(replay, uci);
        if (!move) return false;
        replay.play(move);
      }
      return true;
    };
    const aliases = new Map<string, string>();
    const moves = new Map<string, AtomicDbPosition["moves"][number]>();
    for (const move of position.moves) {
      // A Chess960 landing square can also be a genuine king move. Only treat it as an
      // alternate castling encoding when the continuation supports that interpretation.
      const castle = atomicCastleFromKingDestination(board, move.uci);
      const tail = lines[move.uci]?.slice(1) ?? [];
      const explicitCastle = castle && position.moves.find((entry) => entry.uci === castle);
      const castleTail = castle ? lines[castle]?.slice(1) : undefined;
      const ambiguous = castle && castle !== rootMoveKey(move.uci);
      if (ambiguous && tail.length && replays(castle, tail)) {
        const sameLine =
          explicitCastle &&
          move.score === explicitCastle.score &&
          move.mate === explicitCastle.mate &&
          move.point === explicitCastle.point &&
          tail.length === castleTail?.length &&
          tail.every((uci, index) => uci === castleTail[index]);
        if (sameLine || !replays(move.uci, tail)) aliases.set(move.uci, castle);
      }
      const uci = aliases.get(move.uci) ?? move.uci;
      const key = rootMoveKey(uci);
      const previous = moves.get(key);
      if (
        !previous ||
        (getAtomicDbMoveEvaluation(previous, fen).type === "unknown" &&
          getAtomicDbMoveEvaluation(move, fen).type !== "unknown")
      ) {
        moves.set(key, uci === move.uci ? move : { ...move, uci });
      }
    }
    const normalizedLines: AnalysisLines = { ...lines };
    for (const [alias, castle] of aliases) {
      const line = lines[alias]!;
      if (line.length > (normalizedLines[castle]?.length ?? 0)) {
        normalizedLines[castle] = [castle, ...line.slice(1)];
      }
      delete normalizedLines[alias];
    }
    const bestMove = position.bestMove && (aliases.get(position.bestMove) ?? position.bestMove);
    return {
      position: withMoves({ ...position, bestMove }, [...moves.values()]),
      lines: normalizedLines,
    };
  };

  const engineResult = (candidates: EngineCandidate[], database?: PositionAnalysis) => {
    const unique = engineCandidatesByMove(candidates);
    let position: AtomicDbPosition;
    if (database) {
      const retained = analyzedAtomicDbMoves(fen, database.position);
      for (const move of retained) unique.delete(rootMoveKey(move.uci));
      position = withMoves(
        database.position,
        [...retained, ...Array.from(unique.values(), engineMove)].slice(0, lineCount),
      );
    } else {
      position = enginePosition([...unique.values()].slice(0, lineCount));
    }
    const lines = linesForMoves(position.moves, database?.lines ?? {}, engineLinesFor(candidates));
    for (const move of position.moves.slice(0, lineCount)) {
      const verifiedLine = database?.lines[move.uci];
      if (verifiedLine && move.origin === "engine" && move.mate !== null) {
        lines[move.uci] = verifiedLine.slice(0, plyCount);
      }
    }
    return { position, lines };
  };
  return { databaseResult, linesForMoves, engineResult };
};
