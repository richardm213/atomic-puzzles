import type { EngineCandidate } from "../practice/fairyStockfish";

export const ENDGAME_EVALUATION_DEPTH = 15;
const DRAW_WINDOW_CP = 20;
const LOST_THRESHOLD_CP = -200;

const bestEvaluation = (candidates: EngineCandidate[]): EngineCandidate | null =>
  [...candidates].sort((left, right) => left.multipv - right.multipv)[0] ?? null;

export const engineStartIsLongerThanMateInFive = (candidates: EngineCandidate[]): boolean => {
  const best = bestEvaluation(candidates);
  if (!best || (best.depth ?? 0) < ENDGAME_EVALUATION_DEPTH) return false;
  if (best.scoreType === "mate") return best.score > 5;
  return best.score > DRAW_WINDOW_CP;
};

export const classifyEndgameEngineEvaluation = (
  candidates: EngineCandidate[],
): "winning" | "draw" | "lost" | "unknown" => {
  const best = bestEvaluation(candidates);
  if (!best || (best.depth ?? 0) < ENDGAME_EVALUATION_DEPTH) return "unknown";
  if (best.scoreType === "mate") return best.score > 0 ? "winning" : "lost";
  if (Math.abs(best.score) <= DRAW_WINDOW_CP) return "draw";
  if (best.score <= LOST_THRESHOLD_CP) return "lost";
  return "winning";
};
