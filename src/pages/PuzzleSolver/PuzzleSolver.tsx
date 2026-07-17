import "./PuzzleSolver.css";

import {
  faArrowUpRightFromSquare,
  faCheck,
  faCircleInfo,
  faClockRotateLeft,
  faMagnifyingGlassChart,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Chessboard } from "../../components/Chessboard/Chessboard";
import { PuzzleCommunity } from "../../components/PuzzleCommunity/PuzzleCommunity";
import { Seo } from "../../components/Seo/Seo";
import {
  continuationOptionsAt,
  SolutionMoveTree,
  SolutionPlaybackControls,
} from "../../components/SolutionMoveNavigation/SolutionMoveNavigation";
import {
  activeLineIndex,
  matchingLineIndexes,
  sortMatchingLineIndexes,
} from "../../components/VariationTree/VariationTree";
import { useAppSettings } from "../../context/AppSettings";
import { useAuth } from "../../context/AuthContext";
import { useBoardWheelNavigation } from "../../hooks/useBoardWheelNavigation";
import { loadPuzzleCatalog, loadPuzzlesById, type Puzzle } from "../../lib/puzzles/puzzleLibrary";
import { getOrderedPuzzleIndexesForEvent } from "../../lib/puzzles/puzzleSets";
import { movePrefix, serializeSanLinesToPgn } from "../../lib/puzzles/solutionPgn";
import {
  fetchAttemptedPuzzleIds,
  fetchPuzzleAttemptsForPuzzle,
  type PuzzleProgressWithUsernameRow,
  recordPuzzleProgress,
} from "../../lib/supabase/supabasePuzzleProgress";
import type {
  AttemptResolved,
  ChessboardState,
  PlaybackCommand,
  SolutionNavigation,
} from "../../types/chessboard";
import { copyTextToClipboard } from "../../utils/clipboard";
import { formatLocalDateTime } from "../../utils/formatters";
import { castlingRightsFromFen } from "./castlingRights";

const lichessAnalysisUrl = (fen: string | null | undefined): string => {
  if (!fen) return "https://lichess.org/analysis/atomic";
  return `https://lichess.org/analysis/atomic/${fen.replaceAll(" ", "_")}`;
};

const orientationFromFen = (fen: string | undefined): "black" | "white" => {
  const turn = fen?.split(" ")?.[1];
  return turn === "b" ? "black" : "white";
};

const parsePuzzleId = (puzzleIdParam: string | null | undefined): number | null => {
  if (!puzzleIdParam) return null;
  const puzzleId = Number.parseInt(String(puzzleIdParam), 10);
  if (Number.isNaN(puzzleId)) return null;
  return puzzleId;
};

const toPuzzleKey = (puzzleId: unknown): string =>
  puzzleId === undefined || puzzleId === null ? "" : String(puzzleId).trim();

const ATTEMPTED_PUZZLE_BADGE_LABEL = "You've already attempted this puzzle before";
const OTHER_PUZZLE_ATTEMPTS_LIMIT = 30;
const PUZZLE_PREFETCH_COUNT = 3;

const formatElapsedTime = (milliseconds: number): string => {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

type PuzzleInfoTab = "solution" | "explanation" | "attempts";

const addValueToSet = (currentSet: Set<string>, value: string): Set<string> => {
  if (!value) return currentSet;
  const next = new Set(currentSet);
  next.add(value);
  return next;
};

const puzzleIndexFromParam = (
  puzzles: import("../../lib/puzzles/puzzleLibrary").Puzzle[],
  puzzleIdParam: string | null | undefined,
): number => {
  const puzzleId = parsePuzzleId(puzzleIdParam);
  if (puzzleId === null) return -1;

  const puzzleIndex = puzzles.findIndex((puzzle) => puzzle.puzzleId === puzzleId);
  return puzzleIndex;
};

const randomInt = (max: number): number => {
  if (!Number.isInteger(max) || max <= 0) return 0;

  const cryptoObject = window.crypto;
  if (!cryptoObject?.getRandomValues) {
    return Math.floor(Math.random() * max);
  }

  const maxUint32 = 0x100000000;
  const limit = maxUint32 - (maxUint32 % max);
  const values = new Uint32Array(1);

  do {
    cryptoObject.getRandomValues(values);
  } while ((values[0] ?? 0) >= limit);

  return (values[0] ?? 0) % max;
};

const shuffleIndexes = (indexes: number[]): number[] => {
  const shuffled = [...indexes];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    const a = shuffled[index]!;
    const b = shuffled[swapIndex]!;
    shuffled[index] = b;
    shuffled[swapIndex] = a;
  }

  return shuffled;
};

type CompletionFeedback = {
  type: string;
  icon: string;
  title: string;
};
const buildCompletionFeedback = (
  nextBoardState: ChessboardState,
  hadWrongAttempt: boolean,
): CompletionFeedback | null => {
  if (nextBoardState.solved) {
    return hadWrongAttempt
      ? {
          type: "retrySuccess",
          icon: "↺",
          title: "Correct",
        }
      : {
          type: "correct",
          icon: "✓",
          title: "Correct",
        };
  }

  if (nextBoardState.showWrongMove) {
    return {
      type: "wrong",
      icon: "×",
      title: "Incorrect",
    };
  }

  if (nextBoardState.showRetryMove) {
    return {
      type: "retry",
      icon: "↺",
      title: "Try again: better move",
    };
  }

  return null;
};

const createInitialBoardState = (): ChessboardState => ({
  fen: "",
  turn: "",
  status: "Loading puzzles...",
  error: "",
  lineMoves: [] as string[],
  solutionLines: [] as string[][],
  solutionLineIndex: 0,
  lineIndex: 0,
  viewingSolution: false,
  showWrongMove: false,
  showRetryMove: false,
  solved: false,
});

const createInitialBoardSnapshot = () => ({
  fen: "",
  lineIndex: 0,
  solutionLineIndex: 0,
  viewingSolution: false,
});

const SOLVE_MODE = "solve";
const ANALYSIS_MODE = "analysis";
const SOLUTION_UNLOCK_HINT = "Make at least one attempt before viewing the solution.";

export const PuzzleSolverPage = () => {
  const navigate = useNavigate();
  const { puzzleId: routePuzzleId = "", setKey: routeSetKey = "" } = useParams({
    strict: false,
  });
  const { getAccessToken, user } = useAuth();
  const { showPuzzleTimer } = useAppSettings();
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [attemptedPuzzleIds, setAttemptedPuzzleIds] = useState<Set<string>>(() => new Set());
  const [resolvedAttemptedPuzzleIds, setResolvedAttemptedPuzzleIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [loadingError, setLoadingError] = useState("");
  const [history, setHistory] = useState<number[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [mobileFeedback, setMobileFeedback] = useState<{
    type: string;
    icon: string;
    title: string;
    id: number;
    fading: boolean;
  } | null>(null);
  const [activePuzzleInfoTab, setActivePuzzleInfoTab] = useState<PuzzleInfoTab | null>(null);
  const [solutionRevealed, setSolutionRevealed] = useState(false);
  const [solutionNavigation, setSolutionNavigation] = useState<SolutionNavigation | null>(null);
  const [interactionMode, setInteractionMode] = useState(SOLVE_MODE);
  const [completionFeedback, setCompletionFeedback] = useState<{
    type: string;
    icon: string;
    title: string;
  } | null>(null);
  const [feedbackBadgeId, setFeedbackBadgeId] = useState(0);
  const [explanationUnlockedByWrongMove, setExplanationUnlockedByWrongMove] = useState(false);
  const [pinnedSolutionLineIndex, setPinnedSolutionLineIndex] = useState<number | null>(null);
  const [copyPgnLabel, setCopyPgnLabel] = useState("Copy PGN");
  const [otherPuzzleAttemptsStatus, setOtherPuzzleAttemptsStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [otherPuzzleAttempts, setOtherPuzzleAttempts] = useState<PuzzleProgressWithUsernameRow[]>(
    [],
  );
  const [boardState, setBoardState] = useState(createInitialBoardState);
  const previousBoardSnapshotRef = useRef<ReturnType<typeof createInitialBoardSnapshot>>(
    createInitialBoardSnapshot(),
  );
  const interactionModeRef = useRef(SOLVE_MODE);
  const hadWrongAttemptRef = useRef(false);
  const lockedCompletionFeedbackRef = useRef<CompletionFeedback | null>(null);
  const mobileFeedbackIdRef = useRef(0);
  const boardPanelRef = useRef<HTMLDivElement | null>(null);
  const upcomingPuzzleIndexesRef = useRef<number[]>([]);
  const loadingPuzzleIdsRef = useRef<Set<string>>(new Set());
  const initialRoutePuzzleIdRef = useRef(parsePuzzleId(routePuzzleId));
  const progressWriteQueueRef = useRef(Promise.resolve());
  const attemptedPuzzleIdsRef = useRef<Set<string>>(new Set());
  const activePuzzleKeyRef = useRef("");
  const elapsedTimeMsRef = useRef(0);
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [elapsedTimerRunning, setElapsedTimerRunning] = useState(false);
  const orderedSetPuzzleIndexes = useMemo(
    () => getOrderedPuzzleIndexesForEvent(puzzles, routeSetKey),
    [puzzles, routeSetKey],
  );
  const isSetSolveMode = Boolean(routeSetKey && orderedSetPuzzleIndexes.length > 0);

  const ensureUpcomingPuzzleIndexes = useCallback(
    (currentIndex: number): number => {
      if (upcomingPuzzleIndexesRef.current.length === 0) {
        const candidateIndexes = puzzles
          .map((_, index) => index)
          .filter(
            (index) =>
              index !== currentIndex &&
              !attemptedPuzzleIds.has(String(puzzles[index]?.puzzleId ?? "")),
          );
        upcomingPuzzleIndexesRef.current = shuffleIndexes(candidateIndexes);
      }

      return upcomingPuzzleIndexesRef.current.length;
    },
    [attemptedPuzzleIds, puzzles],
  );

  const getNextShuffledPuzzleIndex = useCallback(
    (currentIndex: number): number => {
      if (puzzles.length === 0) return -1;
      if (puzzles.length === 1) return 0;

      ensureUpcomingPuzzleIndexes(currentIndex);
      return upcomingPuzzleIndexesRef.current.pop() ?? -1;
    },
    [ensureUpcomingPuzzleIndexes, puzzles.length],
  );

  const mergeLoadedPuzzles = useCallback((loadedPuzzles: Puzzle[]): void => {
    if (loadedPuzzles.length === 0) return;

    const loadedById = new Map(
      loadedPuzzles.map((puzzle) => [String(puzzle.puzzleId), puzzle] as const),
    );
    setPuzzles((current) =>
      current.map((puzzle) => loadedById.get(String(puzzle.puzzleId)) ?? puzzle),
    );
  }, []);

  const replaceUrlWithPuzzle = useCallback(
    (puzzleId: string | number): void => {
      if (isSetSolveMode) {
        void navigate({
          to: "/solve/set/$setKey/$puzzleId",
          params: { setKey: routeSetKey, puzzleId: String(puzzleId) },
          replace: true,
        });
      } else {
        void navigate({
          to: "/solve/$puzzleId",
          params: { puzzleId: String(puzzleId) },
          replace: true,
        });
      }
    },
    [isSetSolveMode, navigate, routeSetKey],
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia("(max-width: 680px)");
    const updateLayout = () => setIsMobileLayout(mediaQuery.matches);
    updateLayout();

    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    let isCurrent = true;

    const loadPuzzles = async () => {
      try {
        setLoadingError("");
        const initialPuzzleId = initialRoutePuzzleIdRef.current;
        const [catalog, initialPuzzles] = await Promise.all([
          loadPuzzleCatalog(),
          initialPuzzleId === null ? Promise.resolve([]) : loadPuzzlesById([initialPuzzleId]),
        ]);
        if (!isCurrent) return;

        const initialPuzzlesById = new Map(
          initialPuzzles.map((puzzle) => [String(puzzle.puzzleId), puzzle] as const),
        );
        setPuzzles(
          catalog.map((puzzle) => initialPuzzlesById.get(String(puzzle.puzzleId)) ?? puzzle),
        );
      } catch (error) {
        if (!isCurrent) return;
        setPuzzles([]);
        setLoadingError(error instanceof Error ? error.message : "Failed to load puzzles");
      }
    };

    void loadPuzzles();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    const loadAttemptedPuzzleIds = async () => {
      try {
        const attemptedIds: Set<string> = user?.username
          ? await fetchAttemptedPuzzleIds(user.username)
          : new Set<string>();
        if (isCurrent) setAttemptedPuzzleIds(attemptedIds);
      } catch (error) {
        if (!isCurrent) return;
        setAttemptedPuzzleIds(new Set());
        globalThis.console?.error(error);
      }
    };

    void loadAttemptedPuzzleIds();

    return () => {
      isCurrent = false;
    };
  }, [user?.username]);

  useEffect(() => {
    upcomingPuzzleIndexesRef.current = [];
  }, [attemptedPuzzleIds, puzzles]);

  useEffect(() => {
    attemptedPuzzleIdsRef.current = attemptedPuzzleIds;
  }, [attemptedPuzzleIds]);

  useEffect(() => {
    setBoardState((prev) => {
      if (loadingError) {
        return {
          ...prev,
          status: "Puzzle load error",
          error: loadingError,
        };
      }

      if (!loadingError && prev.error) {
        return {
          ...prev,
          status: "",
          error: "",
        };
      }

      return prev;
    });
  }, [loadingError]);

  useEffect(() => {
    if (puzzles.length === 0) return;
    if (historyIndex >= 0) return;

    const indexFromRoute = puzzleIndexFromParam(puzzles, routePuzzleId);
    const initialIndex = indexFromRoute >= 0 ? indexFromRoute : getNextShuffledPuzzleIndex(-1);

    setHistory([initialIndex]);
    setHistoryIndex(0);

    if (indexFromRoute < 0) {
      const puzzleId = puzzles[initialIndex]?.puzzleId;
      if (puzzleId !== undefined) {
        replaceUrlWithPuzzle(puzzleId);
      }
    }
  }, [puzzles, historyIndex, routePuzzleId, replaceUrlWithPuzzle, getNextShuffledPuzzleIndex]);

  useEffect(() => {
    if (puzzles.length === 0) return;
    if (historyIndex < 0) return;

    const selectedIndex = puzzleIndexFromParam(puzzles, routePuzzleId);
    if (selectedIndex < 0) return;

    if (historyIndex >= 0 && history[historyIndex] === selectedIndex) return;

    const existingHistoryPosition = history.findIndex((entry) => entry === selectedIndex);
    if (existingHistoryPosition >= 0) {
      setHistoryIndex(existingHistoryPosition);
      return;
    }

    const truncatedHistory = historyIndex >= 0 ? history.slice(0, historyIndex + 1) : [];
    setHistory([...truncatedHistory, selectedIndex]);
    setHistoryIndex(truncatedHistory.length);
  }, [puzzles, routePuzzleId, history, historyIndex]);

  const activePuzzleIndex: number = historyIndex >= 0 ? (history[historyIndex] ?? -1) : -1;
  const activePuzzle = activePuzzleIndex >= 0 ? (puzzles[activePuzzleIndex] ?? null) : null;
  const activePuzzleId = activePuzzle?.puzzleId;
  const activePuzzleKey = toPuzzleKey(activePuzzleId);
  const fen = activePuzzle?.fen ?? "";
  const author = String(activePuzzle?.["author"] ?? "").trim() || "Unknown";
  const event = String(activePuzzle?.["event"] ?? "").trim();
  const explanation = activePuzzle?.explanation ?? "";
  const hasExplanation = explanation.trim().length > 0;
  const orientation = orientationFromFen(fen);
  const currentFen = boardState.fen || fen;
  const castlingRights = castlingRightsFromFen(currentFen);
  const hasCastlingRights = castlingRights.white.length > 0 || castlingRights.black.length > 0;
  const startAnalysisUrl = lichessAnalysisUrl(fen);
  const currentAnalysisUrl = lichessAnalysisUrl(currentFen);
  const activeSetPuzzlePosition = isSetSolveMode
    ? orderedSetPuzzleIndexes.indexOf(activePuzzleIndex)
    : -1;
  const puzzleOrdinal = isSetSolveMode
    ? activeSetPuzzlePosition >= 0
      ? activeSetPuzzlePosition + 1
      : null
    : activePuzzleIndex >= 0
      ? activePuzzleIndex + 1
      : null;
  const puzzleCount = isSetSolveMode ? orderedSetPuzzleIndexes.length : puzzles.length;
  const canGoToPreviousPuzzle = isSetSolveMode ? activeSetPuzzlePosition > 0 : historyIndex > 0;
  const canGoToNextPuzzle = isSetSolveMode
    ? activeSetPuzzlePosition >= 0 && activeSetPuzzlePosition < orderedSetPuzzleIndexes.length - 1
    : puzzles.length > 0;
  const hasCompletedPuzzleSet = isSetSolveMode && !canGoToNextPuzzle && boardState.solved;
  const isAnalysisMode = interactionMode === ANALYSIS_MODE;
  const hasPersistedAttempt = activePuzzleKey ? attemptedPuzzleIds.has(activePuzzleKey) : false;
  const hasResolvedAttempt = activePuzzleKey
    ? resolvedAttemptedPuzzleIds.has(activePuzzleKey)
    : false;
  const hasAttemptedActivePuzzle = hasPersistedAttempt || hasResolvedAttempt;
  const canViewExplanation =
    hasExplanation && (hasAttemptedActivePuzzle || explanationUnlockedByWrongMove);
  const showSolution = activePuzzleInfoTab === "solution";
  const showExplanation = activePuzzleInfoTab === "explanation";
  const otherPuzzleAttemptsOpen = activePuzzleInfoTab === "attempts";
  const boardShowsSolution = isAnalysisMode && solutionRevealed;

  useEffect(() => {
    if (activePuzzleIndex < 0 || !activePuzzleId) return undefined;

    let candidateIndexes: number[];
    if (isSetSolveMode) {
      candidateIndexes = orderedSetPuzzleIndexes.slice(
        activeSetPuzzlePosition + 1,
        activeSetPuzzlePosition + 1 + PUZZLE_PREFETCH_COUNT,
      );
    } else {
      ensureUpcomingPuzzleIndexes(activePuzzleIndex);
      candidateIndexes = upcomingPuzzleIndexesRef.current.slice(-PUZZLE_PREFETCH_COUNT).reverse();
    }

    const candidateIds = [
      activePuzzleId,
      ...candidateIndexes.flatMap((index) => {
        const puzzleId = puzzles[index]?.puzzleId;
        return puzzleId === undefined ? [] : [puzzleId];
      }),
    ];
    const missingIds = candidateIds.filter((puzzleId) => {
      const key = String(puzzleId);
      const puzzle = puzzles.find((entry) => entry.puzzleId === puzzleId);
      return !puzzle?.fen && !loadingPuzzleIdsRef.current.has(key);
    });
    if (missingIds.length === 0) return undefined;

    missingIds.forEach((puzzleId) => loadingPuzzleIdsRef.current.add(String(puzzleId)));
    let isCurrent = true;
    void loadPuzzlesById(missingIds)
      .then((loadedPuzzles) => {
        if (!isCurrent) return;
        mergeLoadedPuzzles(loadedPuzzles);
        if (
          missingIds.some((puzzleId) => puzzleId === activePuzzleId) &&
          !loadedPuzzles.some((puzzle) => puzzle.puzzleId === activePuzzleId)
        ) {
          setLoadingError(`Puzzle #${activePuzzleId} is unavailable or has no playable solution.`);
        }
      })
      .catch((error) => {
        if (!isCurrent) return;
        setLoadingError(error instanceof Error ? error.message : "Failed to load puzzle data");
      })
      .finally(() => {
        missingIds.forEach((puzzleId) => loadingPuzzleIdsRef.current.delete(String(puzzleId)));
      });

    return () => {
      isCurrent = false;
    };
  }, [
    activePuzzleId,
    activePuzzleIndex,
    activeSetPuzzlePosition,
    ensureUpcomingPuzzleIndexes,
    isSetSolveMode,
    mergeLoadedPuzzles,
    orderedSetPuzzleIndexes,
    puzzles,
  ]);

  useEffect(() => {
    activePuzzleKeyRef.current = activePuzzleKey;
  }, [activePuzzleKey]);

  const enqueuePuzzleProgressWrite = useCallback(
    ({
      puzzleId,
      puzzleCorrect,
      incorrectMove,
    }: {
      puzzleId: string | number | null | undefined;
      puzzleCorrect: boolean;
      incorrectMove: string | null;
    }): void => {
      const normalizedPuzzleId = toPuzzleKey(puzzleId);
      if (!normalizedPuzzleId || !user?.username) return;
      if (attemptedPuzzleIdsRef.current.has(normalizedPuzzleId)) return;

      progressWriteQueueRef.current = progressWriteQueueRef.current
        .catch(() => {})
        .then(() =>
          recordPuzzleProgress({
            accessToken: getAccessToken(),
            username: user.username,
            puzzleId: normalizedPuzzleId,
            puzzleCorrect,
            incorrectMove,
          }).then(() => {
            setAttemptedPuzzleIds((current) => addValueToSet(current, normalizedPuzzleId));
          }),
        )
        .catch((error) => {
          globalThis.console?.error(error);
        });
    },
    [getAccessToken, user?.username],
  );

  const handleAttemptResolved = useCallback(
    ({ puzzleId, puzzleCorrect, incorrectMove }: AttemptResolved): void => {
      setElapsedTimerRunning(false);
      const normalizedPuzzleId = toPuzzleKey(puzzleId);
      setResolvedAttemptedPuzzleIds((current) => addValueToSet(current, normalizedPuzzleId));

      enqueuePuzzleProgressWrite({
        puzzleId: normalizedPuzzleId,
        puzzleCorrect,
        incorrectMove,
      });
    },
    [enqueuePuzzleProgressWrite],
  );

  const resetPuzzleUiState = useCallback(() => {
    setActivePuzzleInfoTab(null);
    setSolutionRevealed(false);
    setSolutionNavigation(null);
    setInteractionMode(SOLVE_MODE);
    setCompletionFeedback(null);
    setFeedbackBadgeId(0);
    setExplanationUnlockedByWrongMove(false);
    lockedCompletionFeedbackRef.current = null;
    setPinnedSolutionLineIndex(null);
    hadWrongAttemptRef.current = false;
  }, []);

  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);

  useEffect(() => {
    if (activePuzzleIndex < 0) return;

    upcomingPuzzleIndexesRef.current = upcomingPuzzleIndexesRef.current.filter(
      (index) => index !== activePuzzleIndex,
    );
  }, [activePuzzleIndex]);

  useEffect(() => {
    resetPuzzleUiState();
    elapsedTimeMsRef.current = 0;
    setElapsedTimeMs(0);
    setElapsedTimerRunning(Boolean(activePuzzleId && fen));
    setMobileFeedback(null);
    setCopyPgnLabel("Copy PGN");
    setOtherPuzzleAttemptsStatus("idle");
    setOtherPuzzleAttempts([]);
    previousBoardSnapshotRef.current = createInitialBoardSnapshot();
  }, [activePuzzleId, fen, resetPuzzleUiState]);

  useEffect(() => {
    if (!elapsedTimerRunning) return;

    let lastTick = window.performance.now();
    const updateElapsedTime = (): void => {
      const now = window.performance.now();
      elapsedTimeMsRef.current += now - lastTick;
      lastTick = now;
      setElapsedTimeMs(elapsedTimeMsRef.current);
    };
    const interval = window.setInterval(updateElapsedTime, 250);

    return () => {
      updateElapsedTime();
      window.clearInterval(interval);
    };
  }, [elapsedTimerRunning]);

  useEffect(() => {
    if (!mobileFeedback) return undefined;

    const clearFeedbackTimer = window.setTimeout(() => {
      setMobileFeedback((current) =>
        current?.id === mobileFeedback.id
          ? {
              ...current,
              fading: true,
            }
          : current,
      );
    }, 1800);

    const removeFeedbackTimer = window.setTimeout(() => {
      setMobileFeedback((current) => (current?.id === mobileFeedback.id ? null : current));
    }, 2200);

    return () => {
      window.clearTimeout(clearFeedbackTimer);
      window.clearTimeout(removeFeedbackTimer);
    };
  }, [mobileFeedback]);

  const isRetryFeedbackActive = Boolean(
    boardState.showRetryMove && !boardState.viewingSolution && !boardState.solved,
  );
  const canRevealSolution = Boolean(fen) && hasAttemptedActivePuzzle && !isRetryFeedbackActive;
  const solutionButtonTitle = isRetryFeedbackActive
    ? "Find the better move before viewing the solution."
    : hasAttemptedActivePuzzle
      ? "View the solution"
      : SOLUTION_UNLOCK_HINT;
  const feedback = completionFeedback;

  const handleNextPuzzle = () => {
    if (puzzles.length === 0) return;
    resetPuzzleUiState();

    if (isSetSolveMode) {
      const nextIndex = orderedSetPuzzleIndexes[activeSetPuzzlePosition + 1];
      const nextPuzzle = nextIndex !== undefined ? puzzles[nextIndex] : undefined;
      if (nextPuzzle) replaceUrlWithPuzzle(nextPuzzle.puzzleId);
      return;
    }

    if (historyIndex < history.length - 1) {
      const nextHistoryIndex = historyIndex + 1;
      setHistoryIndex(nextHistoryIndex);
      const nextPuzzleIndex = history[nextHistoryIndex];
      const nextPuzzle = nextPuzzleIndex !== undefined ? puzzles[nextPuzzleIndex] : undefined;
      if (nextPuzzle) replaceUrlWithPuzzle(nextPuzzle.puzzleId);
      return;
    }

    const nextIndex = getNextShuffledPuzzleIndex(activePuzzleIndex);
    if (nextIndex < 0) return;

    const truncated = history.slice(0, historyIndex + 1);
    setHistory([...truncated, nextIndex]);
    setHistoryIndex(truncated.length);
    const nextPuzzle = puzzles[nextIndex];
    if (nextPuzzle) replaceUrlWithPuzzle(nextPuzzle.puzzleId);
  };

  const handlePreviousPuzzle = () => {
    if (!canGoToPreviousPuzzle) return;
    resetPuzzleUiState();

    if (isSetSolveMode) {
      const previousIndex = orderedSetPuzzleIndexes[activeSetPuzzlePosition - 1];
      const previousPuzzle = previousIndex !== undefined ? puzzles[previousIndex] : undefined;
      if (previousPuzzle) replaceUrlWithPuzzle(previousPuzzle.puzzleId);
      return;
    }

    const previousHistoryIndex = historyIndex - 1;
    setHistoryIndex(previousHistoryIndex);
    const previousPuzzleIndex = history[previousHistoryIndex];
    const previousPuzzle =
      previousPuzzleIndex !== undefined ? puzzles[previousPuzzleIndex] : undefined;
    if (previousPuzzle) replaceUrlWithPuzzle(previousPuzzle.puzzleId);
  };

  const handleSelectSolutionTab = () => {
    if (!canRevealSolution) return;

    setInteractionMode(ANALYSIS_MODE);
    setSolutionRevealed(true);
    setActivePuzzleInfoTab("solution");
    setSolutionNavigation(null);
  };

  const handleSelectOtherPuzzleAttemptsTab = () => {
    if (!hasAttemptedActivePuzzle) return;

    setActivePuzzleInfoTab("attempts");
    setSolutionNavigation(null);
    if (!activePuzzleKey || otherPuzzleAttemptsStatus === "loaded") return;

    const puzzleKeyForRequest = activePuzzleKey;
    setOtherPuzzleAttemptsStatus("loading");
    void fetchPuzzleAttemptsForPuzzle(puzzleKeyForRequest, {
      limit: OTHER_PUZZLE_ATTEMPTS_LIMIT,
    })
      .then((rows) => {
        if (activePuzzleKeyRef.current !== puzzleKeyForRequest) return;
        setOtherPuzzleAttempts(rows);
        setOtherPuzzleAttemptsStatus("loaded");
      })
      .catch((error) => {
        if (activePuzzleKeyRef.current !== puzzleKeyForRequest) return;
        globalThis.console?.error(error);
        setOtherPuzzleAttempts([]);
        setOtherPuzzleAttemptsStatus("error");
      });
  };

  const handleSelectExplanationTab = () => {
    if (!canViewExplanation) return;
    setActivePuzzleInfoTab("explanation");
    setSolutionNavigation(null);
  };

  const showMobileFeedback = useCallback((nextFeedback: CompletionFeedback): void => {
    mobileFeedbackIdRef.current += 1;
    setMobileFeedback({
      ...nextFeedback,
      id: mobileFeedbackIdRef.current,
      fading: false,
    });
  }, []);

  const handleBoardStateChange = useCallback(
    (nextBoardState: ChessboardState): void => {
      const previousBoardSnapshot = previousBoardSnapshotRef.current;
      const boardPositionChanged =
        previousBoardSnapshot.fen !== nextBoardState.fen ||
        previousBoardSnapshot.lineIndex !== nextBoardState.lineIndex ||
        previousBoardSnapshot.solutionLineIndex !== nextBoardState.solutionLineIndex ||
        previousBoardSnapshot.viewingSolution !== nextBoardState.viewingSolution;
      const nextCompletionFeedback = buildCompletionFeedback(
        nextBoardState,
        hadWrongAttemptRef.current,
      );
      const shouldShowTransientFeedback =
        nextCompletionFeedback !== null && !nextBoardState.viewingSolution;
      const lockedCompletionFeedback =
        nextCompletionFeedback?.type === "retry" || nextCompletionFeedback?.type === "wrong"
          ? null
          : (nextCompletionFeedback ?? lockedCompletionFeedbackRef.current);
      const enteringAnalysisMode =
        interactionModeRef.current !== ANALYSIS_MODE &&
        nextCompletionFeedback !== null &&
        nextCompletionFeedback.type !== "wrong" &&
        nextCompletionFeedback.type !== "retry";

      setBoardState(nextBoardState);

      if (isMobileLayout) {
        if (shouldShowTransientFeedback) {
          showMobileFeedback(nextCompletionFeedback);
        } else if (interactionModeRef.current === SOLVE_MODE && boardPositionChanged) {
          setMobileFeedback(null);
        }
      }

      if (nextBoardState.showWrongMove) {
        hadWrongAttemptRef.current = true;
        if (hasExplanation) {
          setExplanationUnlockedByWrongMove(true);
          setActivePuzzleInfoTab("explanation");
        }
      }

      if (shouldShowTransientFeedback) {
        setFeedbackBadgeId((current) => current + 1);
      }

      if (nextCompletionFeedback?.type === "retry" || nextCompletionFeedback?.type === "wrong") {
        lockedCompletionFeedbackRef.current = null;
      } else if (nextCompletionFeedback) {
        lockedCompletionFeedbackRef.current = nextCompletionFeedback;
      }

      if (enteringAnalysisMode && nextCompletionFeedback) {
        setInteractionMode(ANALYSIS_MODE);
        setCompletionFeedback(nextCompletionFeedback);
      } else if (nextCompletionFeedback) {
        setCompletionFeedback(nextCompletionFeedback);
      } else if (lockedCompletionFeedback) {
        setCompletionFeedback(lockedCompletionFeedback);
      } else {
        setCompletionFeedback(null);
      }

      if (
        interactionModeRef.current === ANALYSIS_MODE &&
        boardShowsSolution &&
        previousBoardSnapshot.viewingSolution &&
        previousBoardSnapshot.solutionLineIndex !== nextBoardState.solutionLineIndex
      ) {
        setPinnedSolutionLineIndex(nextBoardState.solutionLineIndex ?? null);
      }

      previousBoardSnapshotRef.current = {
        fen: nextBoardState.fen,
        lineIndex: nextBoardState.lineIndex ?? 0,
        solutionLineIndex: nextBoardState.solutionLineIndex ?? 0,
        viewingSolution: nextBoardState.viewingSolution ?? false,
      };

      if (nextBoardState.solved) {
        setSolutionNavigation(null);
      }
    },
    [boardShowsSolution, hasExplanation, isMobileLayout, showMobileFeedback],
  );

  const handleMoveClick = useCallback((lineIndex: number, moveIndex: number): void => {
    setPinnedSolutionLineIndex(lineIndex);
    setSolutionNavigation({
      type: "solution",
      line: lineIndex,
      ply: moveIndex + 1,
    });
  }, []);

  const solutionLineCount = boardState.solutionLines?.length ?? 0;
  const allVariationLines = useMemo(
    () => [...(boardState.solutionLines ?? []), ...(boardState.customLines ?? [])],
    [boardState.customLines, boardState.solutionLines],
  );

  const handleVariationMoveClick = useCallback(
    (lineIndex: number, moveIndex: number): void => {
      if (lineIndex < solutionLineCount) {
        handleMoveClick(lineIndex, moveIndex);
        return;
      }

      setSolutionNavigation({
        type: "custom",
        line: lineIndex - solutionLineCount,
        ply: moveIndex + 1,
      });
    },
    [handleMoveClick, solutionLineCount],
  );

  const handlePlaybackCommand = useCallback((command: PlaybackCommand): void => {
    setSolutionNavigation({ type: "command", command });
  }, []);

  const currentAnalysisMoves = useMemo(
    () => boardState.lineMoves?.slice(0, boardState.lineIndex) ?? [],
    [boardState.lineMoves, boardState.lineIndex],
  );

  const matchingSolutionLineIndexes = useMemo(
    () => matchingLineIndexes(boardState.solutionLines, currentAnalysisMoves),
    [boardState.solutionLines, currentAnalysisMoves],
  );

  const sortedMatchingSolutionLineIndexes = useMemo(
    () =>
      sortMatchingLineIndexes(
        boardState.solutionLines ?? [],
        currentAnalysisMoves.length,
        matchingSolutionLineIndexes,
      ),
    [boardState.solutionLines, currentAnalysisMoves.length, matchingSolutionLineIndexes],
  );

  const activeSolutionLineIndex = useMemo(
    () =>
      activeLineIndex(
        sortedMatchingSolutionLineIndexes,
        pinnedSolutionLineIndex,
        boardState.solutionLineIndex,
      ),
    [boardState.solutionLineIndex, pinnedSolutionLineIndex, sortedMatchingSolutionLineIndexes],
  );
  const activeSolutionLine = boardState.solutionLines?.[activeSolutionLineIndex] ?? [];
  const mainSolutionLine = boardState.solutionLines?.[0] ?? [];
  const isOnSolutionPath =
    matchingSolutionLineIndexes.length > 0 &&
    activeSolutionLine.length >= currentAnalysisMoves.length;
  const activeVariationLineIndex = boardState.viewingSolution
    ? activeSolutionLineIndex
    : solutionLineCount + (boardState.customLineIndex ?? 0);

  useEffect(() => {
    if (!boardShowsSolution || !isOnSolutionPath) return;
    if (solutionNavigation) return;
    if (boardState.solutionLineIndex === activeSolutionLineIndex) return;

    setSolutionNavigation({
      type: "solution",
      line: activeSolutionLineIndex,
      ply: currentAnalysisMoves.length,
    });
  }, [
    activeSolutionLineIndex,
    boardState.solutionLineIndex,
    currentAnalysisMoves.length,
    boardShowsSolution,
    isOnSolutionPath,
    solutionNavigation,
  ]);

  const variationOptionList = useMemo(
    () => continuationOptionsAt(allVariationLines, currentAnalysisMoves),
    [allVariationLines, currentAnalysisMoves],
  );

  const moveLinePgn = useMemo(() => {
    if (allVariationLines.length) {
      return serializeSanLinesToPgn(fen, allVariationLines);
    }

    if (!boardState.lineMoves?.length) return "";

    return boardState.lineMoves
      .map((move, index) => `${movePrefix(index, index % 2 === 1)}${move}`.trim())
      .join(" ");
  }, [allVariationLines, boardState.lineMoves, fen]);

  const handleCopyPgn = useCallback(async () => {
    if (!moveLinePgn) return;

    const copied = await copyTextToClipboard(moveLinePgn);
    setCopyPgnLabel(copied ? "Copied" : "Copy failed");

    window.setTimeout(() => {
      setCopyPgnLabel("Copy PGN");
    }, 1800);
  }, [moveLinePgn]);

  const currentLineLength =
    boardShowsSolution && canRevealSolution
      ? activeSolutionLine.length
      : (boardState.lineMoves?.length ?? 0);
  const currentPly = boardState.lineIndex ?? 0;
  const isAtMainSolutionEnd =
    boardShowsSolution &&
    canRevealSolution &&
    (boardState.solutionLineIndex ?? 0) === 0 &&
    currentPly >= mainSolutionLine.length;
  const canPlaybackStart = currentPly > 0;
  const canPlaybackPrevious = currentPly > 0;
  const canPlaybackNext = currentPly < currentLineLength;
  const canPlaybackEnd =
    boardShowsSolution && canRevealSolution ? !isAtMainSolutionEnd : currentPly < currentLineLength;

  useBoardWheelNavigation({
    boardPanelRef,
    canStepBack: boardShowsSolution && canRevealSolution && canPlaybackPrevious,
    canStepForward: boardShowsSolution && canRevealSolution && canPlaybackNext,
    onNavigate: handlePlaybackCommand,
  });

  const renderPlaybackControls = () => (
    <SolutionPlaybackControls
      canStart={Boolean(fen) && canPlaybackStart}
      canPrevious={Boolean(fen) && canPlaybackPrevious}
      canNext={Boolean(fen) && canPlaybackNext}
      canEnd={Boolean(fen) && canPlaybackEnd}
      onNavigate={handlePlaybackCommand}
    />
  );

  const renderMoveLine = (className = "lineBox") => (
    <div className={className}>
      <div className="lineHeader">
        <div className="fenLabel">Solution</div>
        <div className="solutionHeaderActions">
          {renderPlaybackControls()}
          <button
            type="button"
            className="fenAnalyzeButton"
            onClick={handleCopyPgn}
            disabled={!moveLinePgn}
          >
            {copyPgnLabel === "Copied" ? (
              <FontAwesomeIcon className="copyPgnCheck" icon={faCheck} aria-hidden="true" />
            ) : null}
            {copyPgnLabel}
          </button>
        </div>
      </div>
      {boardState.solutionLines?.length ? (
        <SolutionMoveTree
          lines={allVariationLines}
          options={variationOptionList}
          currentPly={currentAnalysisMoves.length}
          activeLineIndex={activeVariationLineIndex}
          onSelect={handleVariationMoveClick}
        />
      ) : (
        <code>No solution available</code>
      )}
    </div>
  );

  const renderAnalysisActions = (mobile = false) => (
    <div className={mobile ? "mobileAnalyzeActions" : "analysisButtonsRow"}>
      <a
        className={`fenAnalyzeButton ${mobile ? "mobileAnalyzeButton" : ""} ${
          !fen ? "disabled" : ""
        }`}
        href={startAnalysisUrl}
        target="_blank"
        rel="noreferrer"
        aria-disabled={!fen}
        onClick={(event) => {
          if (!fen) event.preventDefault();
        }}
      >
        <span className="fenAnalyzeIcon" aria-hidden="true">
          <FontAwesomeIcon icon={faMagnifyingGlassChart} />
        </span>
        <span className="fenAnalyzeText">
          <span>Analyze</span>
          <strong>Puzzle</strong>
        </span>
        <FontAwesomeIcon className="fenAnalyzeExternalIcon" icon={faArrowUpRightFromSquare} />
      </a>
      <a
        className={`fenAnalyzeButton ${mobile ? "mobileAnalyzeButton" : ""} ${
          !currentFen ? "disabled" : ""
        }`}
        href={currentAnalysisUrl}
        target="_blank"
        rel="noreferrer"
        aria-disabled={!currentFen}
        onClick={(event) => {
          if (!currentFen) event.preventDefault();
        }}
      >
        <span className="fenAnalyzeIcon" aria-hidden="true">
          <FontAwesomeIcon icon={faMagnifyingGlassChart} />
        </span>
        <span className="fenAnalyzeText">
          <span>Analyze</span>
          <strong>Current Position</strong>
        </span>
        <FontAwesomeIcon className="fenAnalyzeExternalIcon" icon={faArrowUpRightFromSquare} />
      </a>
    </div>
  );

  const renderOtherPuzzleAttemptsPanel = () => (
    <div className="puzzleOtherAttemptsPanel" aria-live="polite">
      {otherPuzzleAttemptsStatus === "loading" ? (
        <div className="puzzleOtherAttemptsState">Loading attempts...</div>
      ) : otherPuzzleAttemptsStatus === "error" ? (
        <div className="puzzleOtherAttemptsState">Could not load attempts.</div>
      ) : otherPuzzleAttempts.length > 0 ? (
        <ul className="puzzleOtherAttemptsList" aria-label="Other puzzle attempts">
          {otherPuzzleAttempts.map((attempt) => (
            <li
              key={`${attempt.username}-${attempt.first_attempt_at}`}
              className={`puzzleOtherAttemptRow ${
                attempt.puzzle_correct ? "correct" : "incorrect"
              }`}
            >
              <Link
                className="puzzleOtherAttemptUser"
                to="/@/$username/puzzles"
                params={{ username: attempt.username }}
              >
                {attempt.username}
              </Link>
              <span
                className={`puzzleOtherAttemptResult ${
                  attempt.puzzle_correct ? "correct" : "incorrect"
                }`}
              >
                <FontAwesomeIcon
                  icon={attempt.puzzle_correct ? faCheck : faXmark}
                  aria-hidden="true"
                />
                <span>{attempt.puzzle_correct ? "Correct" : "Incorrect"}</span>
                {!attempt.puzzle_correct && attempt.incorrect_move ? (
                  <span
                    className="puzzleOtherAttemptMove"
                    aria-label={`Played ${attempt.incorrect_move}`}
                  >
                    {attempt.incorrect_move}
                  </span>
                ) : null}
              </span>
              <time className="puzzleOtherAttemptTime" dateTime={attempt.first_attempt_at}>
                {formatLocalDateTime(attempt.first_attempt_at)}
              </time>
            </li>
          ))}
        </ul>
      ) : (
        <div className="puzzleOtherAttemptsState">No other attempts yet.</div>
      )}
    </div>
  );

  const renderPuzzleInfoTabs = () => (
    <div className="puzzleInfoTabs" role="tablist" aria-label="Puzzle details">
      <button
        type="button"
        role="tab"
        className={`puzzleInfoTab ${showSolution ? "active" : ""}`}
        onClick={handleSelectSolutionTab}
        disabled={!canRevealSolution}
        aria-selected={showSolution}
        title={solutionButtonTitle}
      >
        <FontAwesomeIcon icon={faMagnifyingGlassChart} aria-hidden="true" />
        <span>Solution</span>
      </button>
      {hasExplanation ? (
        <button
          type="button"
          role="tab"
          className={`puzzleInfoTab ${showExplanation ? "active" : ""}`}
          onClick={handleSelectExplanationTab}
          disabled={!canViewExplanation}
          aria-selected={showExplanation}
          title={
            canViewExplanation
              ? "View the puzzle explanation"
              : "Make a wrong move to unlock the explanation."
          }
        >
          <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
          <span>Explanation</span>
        </button>
      ) : null}
      <button
        type="button"
        role="tab"
        className={`puzzleInfoTab ${otherPuzzleAttemptsOpen ? "active" : ""}`}
        onClick={handleSelectOtherPuzzleAttemptsTab}
        disabled={
          !hasAttemptedActivePuzzle || !activePuzzleKey || otherPuzzleAttemptsStatus === "loading"
        }
        aria-expanded={otherPuzzleAttemptsOpen}
        aria-selected={otherPuzzleAttemptsOpen}
        title={
          hasAttemptedActivePuzzle
            ? "View other attempts for this puzzle"
            : "Attempt this puzzle before viewing other attempts."
        }
      >
        <FontAwesomeIcon icon={faUsers} aria-hidden="true" />
        <span>Other attempts</span>
      </button>
    </div>
  );

  const renderPuzzleInfoPanel = (mobile = false) => {
    if (showSolution && canRevealSolution) {
      return (
        <div className="puzzleInfoPanel">
          {renderAnalysisActions(mobile)}
          {renderMoveLine(mobile ? "lineBox mobileLineBox" : "lineBox")}
        </div>
      );
    }

    if (otherPuzzleAttemptsOpen && hasAttemptedActivePuzzle) {
      return <div className="puzzleInfoPanel">{renderOtherPuzzleAttemptsPanel()}</div>;
    }

    if (showExplanation && canViewExplanation) {
      return (
        <div className="puzzleInfoPanel">
          <section className="puzzleExplanation" aria-live="polite">
            <strong>Explanation</strong>
            <p>{explanation}</p>
          </section>
        </div>
      );
    }

    return null;
  };

  const renderPuzzleInfoSection = (mobile = false) => {
    const panel = renderPuzzleInfoPanel(mobile);

    return (
      <div className={`puzzleInfoStack ${panel ? "hasContent" : ""}`}>
        {renderPuzzleInfoTabs()}
        {panel}
      </div>
    );
  };

  const renderCastlingRights = () =>
    hasCastlingRights ? (
      <div
        className="castlingRightsBar"
        aria-label={`Castling rights. White: ${castlingRights.white.join(", ") || "none"}. Black: ${castlingRights.black.join(", ") || "none"}.`}
        title="Castling rights; a listed right may not be a legal move in the current position"
      >
        <span className="castlingRightsLabel">Castling</span>
        <span className="castlingRightsSide white">
          <span aria-hidden="true">White</span>
          <strong>{castlingRights.white.join(" · ") || "—"}</strong>
        </span>
        <span className="castlingRightsSide black">
          <span aria-hidden="true">Black</span>
          <strong>{castlingRights.black.join(" · ") || "—"}</strong>
        </span>
      </div>
    ) : null;

  return (
    <div className="page puzzlePage">
      <Seo
        title={activePuzzleId ? `Puzzle #${activePuzzleId}` : "Solve a Puzzle"}
        description={
          activePuzzleId
            ? `Solve atomic chess puzzle ${activePuzzleId} and play through the full forcing line.`
            : "Solve atomic chess puzzles drawn from real games and community analysis."
        }
        path={
          activePuzzleId
            ? isSetSolveMode
              ? `/solve/set/${encodeURIComponent(routeSetKey)}/${activePuzzleId}`
              : `/solve/${activePuzzleId}`
            : "/solve"
        }
      />
      <div className="panel puzzlePanel">
        <header className="puzzleHeader">
          <div className="puzzleHeaderTopline">
            <span className="puzzleHeaderEyebrow">Atomic puzzle</span>
            <div className="puzzleHeaderStatus">
              {hasPersistedAttempt ? (
                <span
                  className="puzzleAttemptedBadge"
                  role="img"
                  tabIndex={0}
                  title={ATTEMPTED_PUZZLE_BADGE_LABEL}
                  aria-label={ATTEMPTED_PUZZLE_BADGE_LABEL}
                  data-tooltip={ATTEMPTED_PUZZLE_BADGE_LABEL}
                >
                  <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
                </span>
              ) : null}
              <div className="puzzleCount" aria-label="Puzzle count">
                <span>{puzzleOrdinal ?? "-"}</span>
                <small>of {puzzleCount || "-"}</small>
              </div>
            </div>
          </div>

          <div className="puzzleHeaderTitle">
            <h1>Solve the Atomic Tactic</h1>
          </div>

          <div className="puzzleHeaderMetadata">
            <div className="puzzleHeaderMeta" title={author}>
              <span>Created by</span>
              <strong>{author}</strong>
            </div>
            {event ? (
              <div className="puzzleHeaderMeta" title={event}>
                <span>Event</span>
                <strong>{event}</strong>
              </div>
            ) : null}
          </div>

          {!isMobileLayout ? (
            <nav className="puzzleActions" aria-label="Puzzle navigation">
              <button
                type="button"
                onClick={handlePreviousPuzzle}
                disabled={!canGoToPreviousPuzzle}
              >
                <span className="puzzleActionArrow" aria-hidden="true">
                  ‹
                </span>
                Previous
              </button>
              <button type="button" onClick={handleNextPuzzle} disabled={!canGoToNextPuzzle}>
                Next
                <span className="puzzleActionArrow" aria-hidden="true">
                  ›
                </span>
              </button>
            </nav>
          ) : null}
        </header>

        {!isMobileLayout && hasAttemptedActivePuzzle ? (
          <div id="desktop-puzzle-vote-slot" className="puzzleVoteSlot" />
        ) : null}

        {boardState.error ? <div className="errorText">{boardState.error}</div> : null}
        {loadingError ? <div className="errorText">{loadingError}</div> : null}
        {hasCompletedPuzzleSet ? (
          <section className="puzzleSetComplete" role="status" aria-live="polite">
            <div className="puzzleSetCompleteCopy">
              <span>Set complete</span>
              <h2>Puzzle set complete</h2>
              <p>
                You finished all {puzzleCount} puzzles{event ? ` in ${event}` : ""}.
              </p>
            </div>
            <div className="puzzleSetCompleteActions">
              <Link className="puzzleSetCompleteLink primary" to="/solve">
                Continue with regular puzzles
              </Link>
              <Link className="puzzleSetCompleteLink" to="/solve/sets">
                Back to puzzle sets
              </Link>
            </div>
          </section>
        ) : null}

        {!isMobileLayout ? (
          <div className="puzzleDetails">
            {renderCastlingRights()}
            {renderPuzzleInfoSection()}
          </div>
        ) : null}
      </div>

      <div className="boardWrap">
        <div
          ref={boardPanelRef}
          className={`boardFrame ${feedback ? `hasFeedback ${feedback.type}` : ""}`}
        >
          {showPuzzleTimer ? (
            <div
              className="puzzleElapsedTimer"
              aria-label={`Elapsed time ${formatElapsedTime(elapsedTimeMs)}`}
            >
              <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
              <span>{formatElapsedTime(elapsedTimeMs)}</span>
            </div>
          ) : null}
          {!isMobileLayout && feedback ? (
            <div
              className={`feedbackBadge ${feedback.type}`}
              aria-live="polite"
              key={feedbackBadgeId}
            >
              <span className="feedbackIcon" aria-hidden="true">
                {feedback.icon}
              </span>
              <strong>{feedback.title}</strong>
            </div>
          ) : null}
          <div className="boardStage">
            {fen ? (
              <Chessboard
                puzzleId={activePuzzleId}
                fen={fen}
                orientation={orientation}
                coordinates
                solution={activePuzzle?.solution ?? ""}
                showSolution={boardShowsSolution}
                analysisMode={isAnalysisMode}
                captureNavigationShortcuts
                solutionNavigation={solutionNavigation}
                onNavigateHandled={() => setSolutionNavigation(null)}
                onAttemptResolved={handleAttemptResolved}
                onStateChange={handleBoardStateChange}
              />
            ) : (
              <div className="emptyBoard">Waiting for puzzle data...</div>
            )}
          </div>
          {isMobileLayout && mobileFeedback ? (
            <div
              className={`mobileFeedbackOverlay ${mobileFeedback.type} ${
                mobileFeedback.fading ? "fading" : ""
              }`.trim()}
              aria-live="polite"
              aria-atomic="true"
              key={mobileFeedback.id}
            >
              <span className="mobileFeedbackIcon" aria-hidden="true">
                {mobileFeedback.icon}
              </span>
              <strong className="mobileFeedbackText">{mobileFeedback.title}</strong>
            </div>
          ) : null}
        </div>
      </div>

      {isMobileLayout ? (
        <>
          <div className="mobilePuzzleStatus" aria-label="Puzzle details">
            <div className="puzzleCount" aria-label="Puzzle count">
              <span>{puzzleOrdinal ?? "-"}</span>
              <small>of {puzzles.length || "-"}</small>
            </div>
            {hasPersistedAttempt ? (
              <span
                className="puzzleAttemptedBadge"
                role="img"
                tabIndex={0}
                title={ATTEMPTED_PUZZLE_BADGE_LABEL}
                aria-label={ATTEMPTED_PUZZLE_BADGE_LABEL}
                data-tooltip={ATTEMPTED_PUZZLE_BADGE_LABEL}
              >
                <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
              </span>
            ) : null}
            <span className="mobilePuzzleAuthor" title={author}>
              {author}
            </span>
          </div>
          {hasAttemptedActivePuzzle ? (
            <div id="mobile-puzzle-vote-slot" className="mobilePuzzleVoteSlot" />
          ) : null}
          {hasCastlingRights ? (
            <div className="mobileCastlingRights">{renderCastlingRights()}</div>
          ) : null}
        </>
      ) : null}

      {isMobileLayout ? (
        <div className="mobileWorkflowPanel">
          <div className="mobileActionCard">{renderPuzzleInfoSection(true)}</div>
        </div>
      ) : null}

      {isMobileLayout ? (
        <div className="mobileBottomNav" aria-label="Puzzle navigation">
          <button type="button" onClick={handlePreviousPuzzle} disabled={!canGoToPreviousPuzzle}>
            Prev
          </button>
          <button type="button" onClick={handleNextPuzzle} disabled={!canGoToNextPuzzle}>
            Next
          </button>
        </div>
      ) : null}

      {hasAttemptedActivePuzzle ? (
        <PuzzleCommunity
          puzzleId={activePuzzleId}
          voteTargetId={isMobileLayout ? "mobile-puzzle-vote-slot" : "desktop-puzzle-vote-slot"}
        />
      ) : null}
    </div>
  );
};
