import {
  type AtomicTablebaseResponse,
  probeAtomicTablebase,
} from "../atomicTablebase/lichessAtomicTablebase";

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
