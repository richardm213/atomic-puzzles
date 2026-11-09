import {
  type AtomicTablebaseResponse,
  probeAtomicTablebase,
} from "../atomicTablebase/lichessAtomicTablebase";

import type { EndgameMode } from "./endgamePractice";

export { probeAtomicTablebase };

export const equalBestTablebaseDefenseUcis = (response: AtomicTablebaseResponse): string[] => {
  const bestMove = response.moves[0];
  if (!bestMove) return [];
  return response.moves
    .filter(
      (candidate) =>
        candidate.category === bestMove.category &&
        (bestMove.dtz === null
          ? candidate.dtz === null
          : candidate.dtz !== null && Math.abs(candidate.dtz) === Math.abs(bestMove.dtz)),
    )
    .map((candidate) => candidate.uci);
};

export const chooseEqualTablebaseDefense = (
  response: AtomicTablebaseResponse,
  random: () => number = Math.random,
): string | null => {
  const equalMoves = equalBestTablebaseDefenseUcis(response);
  if (!equalMoves.length) return null;
  return (
    equalMoves[Math.min(equalMoves.length - 1, Math.floor(random() * equalMoves.length))] ?? null
  );
};

/** Only use DTZ as a lower bound, never as an exact mate distance. */
export const classifyTablebaseStart = (
  mode: EndgameMode,
  result: AtomicTablebaseResponse,
): "accept" | "reject" | "engine" => {
  if (mode !== "rook-bishop-vs-king") return "engine";
  if (result.checkmate || result.stalemate || result.variant_win || result.variant_loss)
    return "reject";
  if (["draw", "loss", "blessed-loss", "syzygy-loss"].includes(result.category)) return "reject";
  // Winning KRB vs bare K has no pawn moves or non-terminal captures. A large
  // DTZ therefore rules out mate in five. Leave a two-ply margin for rounding;
  // small or missing DTZ remains an engine decision, not an automatic rejection.
  const distance = result.precise_dtz ?? result.dtz;
  return result.category === "win" && distance !== null && distance > 11 ? "accept" : "engine";
};
