import {
  replacePreloadedAtomicDbGamePositions,
  type PreloadedAtomicDbGamePosition,
} from "../atomicDb/analysisRepository";
import type { AtomicDbOutcome, AtomicDbPosition } from "../../utils/atomicDb";
import type {
  GameAnalysisRecord,
  StoredAtomicDbPosition,
} from "../../../shared/domain/gameAnalysis";

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][nbrq]?$/;

const outcome = (status: string): AtomicDbOutcome =>
  status === "WHITE_WIN" || status === "BLACK_WIN" || status === "DRAW" ? status : "UNKNOWN";

const preloadPosition = (stored: StoredAtomicDbPosition): PreloadedAtomicDbGamePosition => {
  const principalVariations: Record<string, string[]> = {};
  const moves: AtomicDbPosition["moves"] = [];
  for (const line of stored.lines) {
    const move = line.move ?? line.pv[0] ?? null;
    if (!move || !UCI_MOVE.test(move) || moves.some((entry) => entry.uci === move)) continue;
    const pv = line.pv[0] === move ? line.pv : [move, ...line.pv];
    principalVariations[move] = pv.length > 0 ? pv : [move];
    moves.push({
      uci: move,
      outcome: "UNKNOWN",
      closure: null,
      score: line.cp,
      point: null,
      mate: line.mate,
      backedPlies: Math.max(0, Math.floor(line.depth ?? 0)),
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
      backedPlies: 0,
    });
    principalVariations[stored.bestMove] = [stored.bestMove];
  }

  return {
    fen: stored.fen,
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
  if (analysis?.status !== "ready" || !analysis.result) return;
  replacePreloadedAtomicDbGamePositions(analysis.result.positions.map(preloadPosition));
};
