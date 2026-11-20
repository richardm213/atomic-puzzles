import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DAILY_PUZZLE_ATTEMPT_LIMIT,
  isTimestampInUtcDay,
} from "../../../shared/domain/puzzles/dailyAttemptLimit";
import type { PuzzleGradingState } from "../../../shared/domain/puzzles/puzzleGrading";
import { ApiError } from "../../lib/api/postApi";
import { recordCustomPuzzleSetProgress } from "../../lib/puzzles/customPuzzleSets";
import { puzzleQueryKeys } from "../../lib/puzzles/puzzleQueries";
import {
  fetchPuzzleProgressRowsForUsername,
  fetchPuzzleRatingExclusions,
  recordPuzzleProgress,
} from "../../lib/supabase/puzzleProgress";
import type { PuzzleRatingEvent } from "../../lib/supabase/puzzleUserRatings";
import { getErrorMessage } from "../../utils/errors";
import { addValueToSet, removeValueFromSet, toPuzzleKey } from "./puzzleSolverState";

export const SERVER_CUSTOM_SET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const usePuzzleProgress = ({
  username,
  normalizedUsername,
  routeCustomSetId,
  testMode,
  isAuthLoading,
  setLoadingError,
  onRatingEvent,
}: {
  username: string | undefined;
  normalizedUsername: string;
  routeCustomSetId: string;
  testMode: boolean;
  isAuthLoading: boolean;
  setLoadingError: (error: string) => void;
  onRatingEvent: (puzzleId: string, event: PuzzleRatingEvent) => void;
}) => {
  const queryClient = useQueryClient();
  const attemptedPuzzleIdsUsername = testMode ? "" : normalizedUsername;
  const gradingStatesRef = useRef(new Map<string, PuzzleGradingState>());
  const retryProgressWriteRef = useRef<(() => Promise<void>) | null>(null);
  const [progressSaveError, setProgressSaveError] = useState("");
  const [progressSaving, setProgressSaving] = useState(false);
  const [attemptedPuzzleIds, setAttemptedPuzzleIds] = useState<Set<string>>(() => new Set());
  const [solvedPuzzleIds, setSolvedPuzzleIds] = useState<Set<string>>(() => new Set());
  const [unratedPuzzleIds, setUnratedPuzzleIds] = useState<Set<string>>(() => new Set());
  const [permanentUnratedIds, setPermanentUnratedIds] = useState<Set<string>>(() => new Set());
  const [gradingAvailability, setGradingAvailability] = useState(new Map<string, string | null>());
  const [ratingExclusions, setRatingExclusions] = useState<Map<string, string>>(() => new Map());
  const [dailyAttemptCount, setDailyAttemptCount] = useState(0);
  const [attemptedPuzzleIdsOwner, setAttemptedPuzzleIdsOwner] = useState<string | null>(null);
  const [submittedPuzzleIds, setSubmittedPuzzleIds] = useState<Set<string>>(() => new Set());
  const progressWriteQueueRef = useRef(Promise.resolve());
  const countedTodayPuzzleIdsRef = useRef<Set<string>>(new Set());
  const attemptedPuzzleIdsReady =
    !isAuthLoading &&
    (!attemptedPuzzleIdsUsername || attemptedPuzzleIdsOwner === attemptedPuzzleIdsUsername);
  useEffect(() => {
    if (isAuthLoading || testMode) return undefined;

    let isCurrent = true;
    const account = attemptedPuzzleIdsUsername;

    if (!account) {
      setRatingExclusions(new Map());
      setPermanentUnratedIds(new Set());
      setAttemptedPuzzleIds(new Set());
      setSolvedPuzzleIds(new Set());
      setUnratedPuzzleIds(new Set());
      setDailyAttemptCount(0);
      countedTodayPuzzleIdsRef.current = new Set();
      setAttemptedPuzzleIdsOwner("");
      return undefined;
    }

    gradingStatesRef.current.clear();
    setGradingAvailability(new Map());
    setAttemptedPuzzleIds(new Set());
    setRatingExclusions(new Map());
    setPermanentUnratedIds(new Set());
    setSolvedPuzzleIds(new Set());
    setUnratedPuzzleIds(new Set());
    setDailyAttemptCount(0);
    countedTodayPuzzleIdsRef.current = new Set();
    setAttemptedPuzzleIdsOwner(null);

    const loadAttemptedPuzzleIds = async () => {
      try {
        const [progressRows, exclusions] = await Promise.all([
          fetchPuzzleProgressRowsForUsername(account, { throwOnError: true }),
          fetchPuzzleRatingExclusions(account),
        ]);
        if (isCurrent) {
          setPermanentUnratedIds(
            new Set(exclusions.filter((row) => row.permanent).map((row) => String(row.puzzle_id))),
          );
          setRatingExclusions(
            new Map(exclusions.map((row) => [String(row.puzzle_id), row.expires_at])),
          );
          setGradingAvailability(
            new Map(
              progressRows.map((row) => [String(row.puzzle_id), row.grading_available_at ?? null]),
            ),
          );
          const todayRows = progressRows.filter((row) => isTimestampInUtcDay(row.first_attempt_at));
          setAttemptedPuzzleIds(
            new Set(
              progressRows.filter((row) => row.rated !== false).map((row) => String(row.puzzle_id)),
            ),
          );
          setSolvedPuzzleIds(
            new Set(
              progressRows
                .filter((row) => row.has_solved ?? row.puzzle_correct)
                .map((row) => String(row.puzzle_id)),
            ),
          );
          setUnratedPuzzleIds(
            new Set(
              progressRows.filter((row) => row.rated === false).map((row) => String(row.puzzle_id)),
            ),
          );
          countedTodayPuzzleIdsRef.current = new Set(todayRows.map((row) => String(row.puzzle_id)));
          setDailyAttemptCount(todayRows.length);
          setAttemptedPuzzleIdsOwner(account);
        }
      } catch (error) {
        if (!isCurrent) return;
        setAttemptedPuzzleIds(new Set());
        setSolvedPuzzleIds(new Set());
        setUnratedPuzzleIds(new Set());
        countedTodayPuzzleIdsRef.current = new Set();
        setDailyAttemptCount(0);
        setLoadingError("Unable to check puzzle rating eligibility. Please reload to try again.");
        globalThis.console?.error(error);
      }
    };

    void loadAttemptedPuzzleIds();

    return () => {
      isCurrent = false;
    };
  }, [attemptedPuzzleIdsUsername, isAuthLoading, setLoadingError, testMode]);

  const enqueuePuzzleProgressWrite = useCallback(
    ({
      puzzleId,
      puzzleCorrect,
      incorrectMove,
      correctMove,
      attemptDurationMs,
      attemptPgn,
      resigned = false,
    }: {
      puzzleId: string | number | null | undefined;
      puzzleCorrect: boolean;
      incorrectMove: string | null;
      correctMove: string | null;
      attemptDurationMs: number | null;
      attemptPgn?: string;
      resigned?: boolean;
    }): void => {
      const normalizedPuzzleId = toPuzzleKey(puzzleId);
      if (!normalizedPuzzleId || !username) return;
      const grading = gradingStatesRef.current.get(normalizedPuzzleId);
      const isInitialResult = !resigned && !grading?.hasAttempted;
      setProgressSaveError("");
      setProgressSaving(true);
      const attempt = { id: crypto.randomUUID(), pgn: attemptPgn || '[Result "*"]\n\n*', resigned };
      const isFirstRecordedAttempt =
        isInitialResult && !countedTodayPuzzleIdsRef.current.has(normalizedPuzzleId);

      const input = {
        username,
        puzzleId: normalizedPuzzleId,
        puzzleCorrect,
        attemptDurationMs,
        incorrectMove,
        correctMove,
        attempt,
      };
      const write = async (): Promise<void> => {
        setProgressSaveError("");
        setProgressSaving(true);
        try {
          const result = await recordPuzzleProgress({
            ...input,
            attempt: {
              ...attempt,
              runId: gradingStatesRef.current.get(normalizedPuzzleId)?.runId ?? null,
            },
          });
          retryProgressWriteRef.current = null;
          const recorded = result?.graded ?? grading?.graded;
          if (recorded) {
            if (
              isFirstRecordedAttempt &&
              !countedTodayPuzzleIdsRef.current.has(normalizedPuzzleId)
            ) {
              countedTodayPuzzleIdsRef.current.add(normalizedPuzzleId);
              setDailyAttemptCount((current) => Math.min(DAILY_PUZZLE_ATTEMPT_LIMIT, current + 1));
            }
            if (!resigned) {
              setSubmittedPuzzleIds((current) => addValueToSet(current, normalizedPuzzleId));
              if (puzzleCorrect)
                setSolvedPuzzleIds((current) => addValueToSet(current, normalizedPuzzleId));
              if (SERVER_CUSTOM_SET_ID_PATTERN.test(routeCustomSetId)) {
                void recordCustomPuzzleSetProgress(
                  routeCustomSetId,
                  normalizedPuzzleId,
                  puzzleCorrect,
                )
                  .then(() => queryClient.invalidateQueries({ queryKey: ["custom-puzzle-sets"] }))
                  .catch((error) => globalThis.console?.error(error));
              }
            }
          }
          if (result?.grading) {
            await queryClient.cancelQueries({
              queryKey: ["puzzle-grading", normalizedUsername, normalizedPuzzleId],
            });
            setGradingAvailability((current) =>
              new Map(current).set(normalizedPuzzleId, result.grading!.availableAt),
            );
            gradingStatesRef.current.set(normalizedPuzzleId, result.grading);
            queryClient.setQueryData(
              ["puzzle-grading", normalizedUsername, normalizedPuzzleId],
              result.grading,
            );
            if (recorded)
              void queryClient.invalidateQueries({
                queryKey: ["puzzle-attempts", normalizedPuzzleId],
              });
          }
          if (result?.unratedUntil) {
            setRatingExclusions((current) =>
              new Map(current).set(normalizedPuzzleId, result.unratedUntil!),
            );
          }
          if (result?.rated) {
            setAttemptedPuzzleIds((current) => addValueToSet(current, normalizedPuzzleId));
            setUnratedPuzzleIds((current) => removeValueFromSet(current, normalizedPuzzleId));
          }
          if (recorded) void queryClient.invalidateQueries({ queryKey: puzzleQueryKeys.progress });
          if (result?.rated) {
            void queryClient.invalidateQueries({ queryKey: puzzleQueryKeys.userRating });
            void queryClient.invalidateQueries({ queryKey: puzzleQueryKeys.ratingEvents });
          }
          if (result?.ratingEvent) onRatingEvent(normalizedPuzzleId, result.ratingEvent);
        } catch (error) {
          if (error instanceof ApiError && error.code === "daily_puzzle_attempt_limit") {
            setDailyAttemptCount(DAILY_PUZZLE_ATTEMPT_LIMIT);
          }
          retryProgressWriteRef.current = write;
          setProgressSaveError(
            getErrorMessage(error, "Unable to save this attempt. Please retry."),
          );
          globalThis.console?.error(error);
        } finally {
          setProgressSaving(false);
        }
      };
      progressWriteQueueRef.current = progressWriteQueueRef.current.catch(() => {}).then(write);
    },
    [queryClient, username, normalizedUsername, routeCustomSetId, onRatingEvent],
  );

  return {
    gradingStatesRef,
    retryProgressWriteRef,
    progressSaveError,
    progressSaving,
    attemptedPuzzleIds,
    solvedPuzzleIds,
    unratedPuzzleIds,
    permanentUnratedIds,
    gradingAvailability,
    ratingExclusions,
    dailyAttemptCount,
    submittedPuzzleIds,
    progressWriteQueueRef,
    countedTodayPuzzleIdsRef,
    attemptedPuzzleIdsUsername,
    attemptedPuzzleIdsReady,
    setDailyAttemptCount,
    setProgressSaveError,
    setPermanentUnratedIds,
    enqueuePuzzleProgressWrite,
  };
};
