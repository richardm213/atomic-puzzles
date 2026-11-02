import type { EngineCandidate } from "../practice/fairyStockfish";

const MIN_RELIABLE_DEPTH = 15;
const DRAW_WINDOW_CP = 20;
const LOST_THRESHOLD_CP = -200;

const bestEvaluation = (candidates: EngineCandidate[]): EngineCandidate | null =>
  [...candidates].sort((left, right) => left.multipv - right.multipv)[0] ?? null;

export const engineStartIsLongerThanMateInFour = (candidates: EngineCandidate[]): boolean => {
  const best = bestEvaluation(candidates);
  if (!best || (best.depth ?? 0) < MIN_RELIABLE_DEPTH) return false;
  if (best.scoreType === "mate") return best.score > 4;
  return best.score > DRAW_WINDOW_CP;
};

export const classifyEndgameEngineEvaluation = (
  candidates: EngineCandidate[],
): "winning" | "draw" | "lost" | "unknown" => {
  const best = bestEvaluation(candidates);
  if (!best || (best.depth ?? 0) < MIN_RELIABLE_DEPTH) return "unknown";
  if (best.scoreType === "mate") return best.score > 0 ? "winning" : "lost";
  if (Math.abs(best.score) <= DRAW_WINDOW_CP) return "draw";
  if (best.score <= LOST_THRESHOLD_CP) return "lost";
  return "winning";
};
