import { type MutableRefObject, useCallback, useMemo } from "react";

import { getPuzzleUnratedReason } from "../../lib/puzzles/puzzleAttemptRating";
import type { Puzzle } from "../../lib/puzzles/puzzleLibrary";
import { shuffleIndexes } from "./puzzleSolverState";

export const PUZZLE_PREFETCH_COUNT = 3;
export const usePuzzleSelection = ({
  puzzles,
  activePuzzleIndex,
  shouldSkipAuthor,
  unavailablePuzzleIds,
  attemptedPuzzleIds,
  unratedPuzzleIds,
  countedTodayPuzzleIdsRef,
  skipAttemptedPuzzles,
  attemptedPuzzleIdsReady,
  gradingAvailability,
  waitingForAuthorAliases,
  visitedPuzzleIds,
  ratingExclusions,
  permanentUnratedIds,
  normalizedUsername,
}: {
  puzzles: Puzzle[];
  activePuzzleIndex: number;
  shouldSkipAuthor: (author: unknown) => boolean;
  unavailablePuzzleIds: ReadonlySet<string>;
  attemptedPuzzleIds: ReadonlySet<string>;
  unratedPuzzleIds: ReadonlySet<string>;
  countedTodayPuzzleIdsRef: MutableRefObject<Set<string>>;
  skipAttemptedPuzzles: boolean;
  attemptedPuzzleIdsReady: boolean;
  gradingAvailability: ReadonlyMap<string, string | null>;
  waitingForAuthorAliases: boolean;
  visitedPuzzleIds: ReadonlySet<string>;
  ratingExclusions: ReadonlyMap<string, string>;
  permanentUnratedIds: ReadonlySet<string>;
  normalizedUsername: string;
}) => {
  const puzzleCountInCatalog = puzzles.length;
  // Shuffling the order separately keeps prefetched candidates stable as details load.
  const shuffledPuzzleIndexes = useMemo(
    () => shuffleIndexes(Array.from({ length: puzzleCountInCatalog }, (_, index) => index)),
    [puzzleCountInCatalog],
  );
  const isSelectablePuzzle = useCallback(
    (index: number) => {
      const puzzle = puzzles[index];
      return Boolean(
        puzzle &&
        !shouldSkipAuthor(puzzle.author) &&
        !unavailablePuzzleIds.has(String(puzzle.puzzleId)),
      );
    },
    [puzzles, shouldSkipAuthor, unavailablePuzzleIds],
  );
  const hasRecordedAttempt = useCallback(
    (key: string) =>
      attemptedPuzzleIds.has(key) ||
      unratedPuzzleIds.has(key) ||
      countedTodayPuzzleIdsRef.current.has(key),
    [attemptedPuzzleIds, countedTodayPuzzleIdsRef, unratedPuzzleIds],
  );
  const canReceivePuzzle = useCallback(
    (index: number) => {
      if (!isSelectablePuzzle(index)) return false;
      if (!skipAttemptedPuzzles) return true;
      const key = String(puzzles[index]!.puzzleId);
      return attemptedPuzzleIdsReady && !hasRecordedAttempt(key) && !gradingAvailability.has(key);
    },
    [
      attemptedPuzzleIdsReady,
      gradingAvailability,
      hasRecordedAttempt,
      isSelectablePuzzle,
      puzzles,
      skipAttemptedPuzzles,
    ],
  );
  const upcomingPuzzleIndexes = useMemo(() => {
    if (!attemptedPuzzleIdsReady || waitingForAuthorAliases) return [];

    const now = new Date();
    const isEligible = (index: number): boolean => {
      const puzzle = puzzles[index];
      if (!puzzle || index === activePuzzleIndex || !canReceivePuzzle(index)) return false;
      const key = String(puzzle.puzzleId);
      if (visitedPuzzleIds.has(key)) return false;
      if (gradingAvailability.has(key)) {
        const availableAt = gradingAvailability.get(key);
        const excludedUntil = ratingExclusions.get(key);
        return (
          !permanentUnratedIds.has(key) &&
          !(excludedUntil && Date.parse(excludedUntil) > now.getTime()) &&
          Boolean(availableAt && Date.parse(availableAt) <= now.getTime())
        );
      }
      return (
        getPuzzleUnratedReason({
          username: normalizedUsername,
          author: puzzle.author,
          createdAt: puzzle.created_at,
          hasUnratedAttempt: unratedPuzzleIds.has(key),
          excludedUntil: ratingExclusions.get(key),
          permanentlyUnrated: permanentUnratedIds.has(key),
          now,
        }) === null
      );
    };

    const upcoming: number[] = [];
    for (let position = shuffledPuzzleIndexes.length - 1; position >= 0; position -= 1) {
      const index = shuffledPuzzleIndexes[position]!;
      if (isEligible(index)) upcoming.push(index);
      if (upcoming.length === PUZZLE_PREFETCH_COUNT) break;
    }
    return upcoming;
  }, [
    activePuzzleIndex,
    attemptedPuzzleIdsReady,
    canReceivePuzzle,
    normalizedUsername,
    permanentUnratedIds,
    puzzles,
    ratingExclusions,
    shuffledPuzzleIndexes,
    gradingAvailability,
    unratedPuzzleIds,
    visitedPuzzleIds,
    waitingForAuthorAliases,
  ]);
  return { isSelectablePuzzle, hasRecordedAttempt, canReceivePuzzle, upcomingPuzzleIndexes };
};
