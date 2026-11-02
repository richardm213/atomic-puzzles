export {
  type AtomicTablebaseResponse,
  probeAtomicTablebase,
  type TablebaseCategory,
  tablebaseSideIsLosing,
  tablebaseSideIsWinning,
} from "../atomicTablebase/lichessAtomicTablebase";

import type { AtomicTablebaseResponse } from "../atomicTablebase/lichessAtomicTablebase";

export const tablebaseStartIsLongerThanMateInFour = (
  response: AtomicTablebaseResponse,
): boolean => {
  const winningCategory =
    response.category === "win" ||
    response.category === "syzygy-win" ||
    response.category === "maybe-win" ||
    response.category === "cursed-win";
  const distance = response.dtm ?? response.precise_dtz ?? response.dtz;
  return winningCategory && !response.variant_loss && distance !== null && Math.abs(distance) >= 9;
};

export const tablebasePositionIsDrawn = (response: AtomicTablebaseResponse): boolean =>
  response.stalemate || response.category === "draw";

export const longestTablebaseDefenseUcis = (
  response: AtomicTablebaseResponse,
  allowedUcis?: ReadonlySet<string>,
): string[] => {
  const first = response.moves[0];
  if (!first) return [];
  const bestCategoryMoves = response.moves.filter(
    (move) => move.category === first.category && (!allowedUcis || allowedUcis.has(move.uci)),
  );
  const firstAllowed = bestCategoryMoves[0];
  if (!firstAllowed) return [];
  const measuredMoves = bestCategoryMoves.filter((move) => move.dtz !== null);
  if (!measuredMoves.length) return [firstAllowed.uci];
  const longestDtz = Math.max(...measuredMoves.map((move) => Math.abs(move.dtz ?? 0)));
  return measuredMoves
    .filter((move) => Math.abs(move.dtz ?? 0) === longestDtz)
    .map((move) => move.uci);
};

export const connectionAwareTablebaseDefenseUcis = (
  response: AtomicTablebaseResponse,
  connectedUcis: ReadonlySet<string>,
  random: () => number = Math.random,
): string[] => {
  const longestOverall = longestTablebaseDefenseUcis(response);
  if (!longestOverall.length) return [];

  const connectedLongest = longestOverall.filter((uci) => connectedUcis.has(uci));
  if (connectedLongest.length) return connectedLongest;
  if (!connectedUcis.size || random() < 0.25) return longestOverall;

  return longestTablebaseDefenseUcis(response, connectedUcis);
};
