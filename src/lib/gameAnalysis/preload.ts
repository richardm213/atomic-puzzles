import type {
  GameAnalysisRecord,
  StoredAtomicDbPosition,
} from "../../../shared/domain/gameAnalysis";
import type { AtomicDbOutcome, AtomicDbPosition } from "../../utils/atomicDb";
import {
  clearPreloadedAtomicDbGamePositions,
  type PreloadedAtomicDbGamePosition,
  replacePreloadedAtomicDbGamePositions,
} from "../atomicDb/analysisRepository";

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][nbrq]?$/;

const outcome = (status: string): AtomicDbOutcome =>
  status === "WHITE_WIN" || status === "BLACK_WIN" || status === "DRAW" ? status : "UNKNOWN";

const preloadPosition = (stored: StoredAtomicDbPosition): PreloadedAtomicDbGamePosition => {
  const principalVariations: Record<string, string[]> = {};
  const moves: AtomicDbPosition["moves"] = [];
  const storedMoves = stored.candidates?.length
    ? stored.candidates.map((candidate) => ({
        move: candidate.move,
        status: candidate.status,
        closure: candidate.closure,
        score: candidate.score,
        point: candidate.point,
        mate: candidate.mate,
        nodeBackedPlies: candidate.nodeBackedPlies ?? null,
        searchDepth: candidate.depth ?? null,
        pv: candidate.pv,
      }))
    : stored.lines.map((line) => ({
        move: line.move ?? line.pv[0] ?? null,
        status: "UNKNOWN",
        closure: null,
        score: line.cp,
        point: null,
        mate: line.mate,
        // A stored line's depth is the search depth used to produce the game report. It is not
        // AtomicDB's `node_backed_plies`.
        nodeBackedPlies: null,
        searchDepth: line.depth,
        pv: line.pv,
      }));
  for (const candidate of storedMoves) {
    const move = candidate.move;
    if (!move || !UCI_MOVE.test(move) || moves.some((entry) => entry.uci === move)) continue;
    const pv = candidate.pv[0] === move ? candidate.pv : [move, ...candidate.pv];
    principalVariations[move] = pv.length > 0 ? pv : [move];
    moves.push({
      uci: move,
      outcome: outcome(candidate.status),
      closure: candidate.closure,
      score: candidate.score,
      point: candidate.point,
      mate: candidate.mate,
      nodeBackedPlies: candidate.nodeBackedPlies,
      searchDepth: candidate.searchDepth,
    });
  }

  if (
    stored.bestMove &&
    UCI_MOVE.test(stored.bestMove) &&
    !moves.some((move) => move.uci === stored.bestMove)
  ) {
    moves.unshift({
      uci: stored.bestMove,
      outcome: outcome(stored.status),
      closure: stored.closure,
      score: stored.score,
      point: stored.point,
      mate: null,
      nodeBackedPlies: null,
    });
    principalVariations[stored.bestMove] = [stored.bestMove];
  }

  return {
    fen: stored.fen,
    complete: stored.candidates !== undefined,
    position: {
      key: stored.key,
      outcome: outcome(stored.status),
      closure: stored.closure,
      score: stored.score,
      point: stored.point,
      bestMove: stored.bestMove,
      moves,
    },
    principalVariations,
  };
};

export const preloadCompletedGameAnalysis = (analysis: GameAnalysisRecord | null): void => {
  if (analysis?.status !== "ready" || !analysis.result) {
    clearPreloadedAtomicDbGamePositions();
    return;
  }
  replacePreloadedAtomicDbGamePositions(analysis.result.positions.map(preloadPosition));
};
