import { canonicalAtomicMoveUci, createAtomicPosition } from "../../../shared/domain/chess/pgn";
import { type AtomicDbPosition, getAtomicDbMoveEvaluation } from "../../utils/atomicDb";
import type { EngineCandidate } from "../practice/fairyStockfish";

export type AnalysisLines = Record<string, string[]>;

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

const rootMoveKeyFor = (fen: string): ((uci: string) => string) => {
  try {
    const position = createAtomicPosition(fen);
    return (uci) => canonicalAtomicMoveUci(position, uci) ?? uci;
  } catch {
    return (uci) => uci;
  }
};

export const createAnalysisMoveComposer = (fen: string, lineCount: number, plyCount: number) => {
  const rootMoveKey = rootMoveKeyFor(fen);
  const withMoves = (
    position: AtomicDbPosition,
    moves: AtomicDbPosition["moves"],
  ): AtomicDbPosition => {
    const bestKey = position.bestMove ? rootMoveKey(position.bestMove) : null;
    const bestMove = bestKey && moves.find((move) => rootMoveKey(move.uci) === bestKey)?.uci;
    return { ...position, moves, bestMove: bestMove || position.bestMove };
  };
  const distinctPosition = (position: AtomicDbPosition): AtomicDbPosition => {
    const moves = new Map<string, AtomicDbPosition["moves"][number]>();
    for (const move of position.moves) {
      const key = rootMoveKey(move.uci);
      const previous = moves.get(key);
      if (
        !previous ||
        (getAtomicDbMoveEvaluation(previous, fen).type === "unknown" &&
          getAtomicDbMoveEvaluation(move, fen).type !== "unknown")
      ) {
        moves.set(key, move);
      }
    }
    return withMoves(position, [...moves.values()]);
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

  const engineResult = (
    candidates: EngineCandidate[],
    database?: { position: AtomicDbPosition; lines: AnalysisLines },
  ) => {
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
    return {
      position,
      lines: linesForMoves(position.moves, database?.lines ?? {}, engineLinesFor(candidates)),
    };
  };
  return { distinctPosition, linesForMoves, engineResult };
};
