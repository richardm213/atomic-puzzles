import {
  type AtomicTablebaseResponse,
  probeAtomicTablebase,
} from "../atomicTablebase/lichessAtomicTablebase";
import { isAtomicTablebasePosition } from "../atomicTablebase/material";

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
  result: AtomicTablebaseResponse,
): "accept" | "reject" | "engine" => {
  if (result.checkmate || result.stalemate || result.variant_win || result.variant_loss)
    return "reject";
  if (["draw", "loss", "blessed-loss", "syzygy-loss"].includes(result.category)) return "reject";
  // Mate also ends a DTZ sequence. A large distance to the next pawn move,
  // capture or mate rules out a quick mate in any material configuration.
  // Keep a rounding margin; a small DTZ can just mean an early pawn move or
  // capture, so it must stay an engine decision, not an automatic rejection.
  const distance = result.precise_dtz ?? result.dtz;
  return result.category === "win" && distance !== null && distance > 11 ? "accept" : "engine";
};

export const probeEndgameTablebase = async (
  fen: string,
  signal: AbortSignal,
): Promise<AtomicTablebaseResponse | null> => {
  if (!isAtomicTablebasePosition(fen) || signal.aborted) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(abort, 1_200);
  try {
    return await probeAtomicTablebase(fen, controller.signal);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
};

export const classifyTablebaseEvaluation = (
  result: AtomicTablebaseResponse,
): "winning" | "draw" | "lost" | "unknown" => {
  if (result.category === "win") return "winning";
  if (["draw", "cursed-win", "blessed-loss"].includes(result.category)) return "draw";
  if (result.category === "loss") return "lost";
  return "unknown";
};
