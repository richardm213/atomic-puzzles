import "./PuzzleSolver.css";

import {
  faArrowUpRightFromSquare,
  faCheck,
  faCircleInfo,
  faClockRotateLeft,
  faComment,
  faMagnifyingGlassChart,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  formatPuzzleSetDate,
  formatPuzzleSetPlayers,
  puzzleSetMetadataFromRow,
} from "../../../shared/domain/puzzles/puzzleSetMetadata";
import { buildPieceStyle } from "../../components/Chessboard/boardStyle";
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
import { useCopyFeedback } from "../../hooks/useCopyFeedback";
import {
  fetchCustomPuzzleSet,
  getOrderedPuzzleIndexesForCustomSet,
  recordCustomPuzzleSetProgress,
  refreshCustomPuzzleSet,
} from "../../lib/puzzles/customPuzzleSets";
import { updatePuzzleExplanation } from "../../lib/puzzles/puzzleExplanation";
import { type PuzzleIssueCategory, reportPuzzleIssue } from "../../lib/puzzles/puzzleIssues";
import { loadPuzzleCatalog, loadPuzzlesById, type Puzzle } from "../../lib/puzzles/puzzleLibrary";
import {
  getPuzzleMotifParent,
  normalizePuzzleMotifTags,
  puzzleMotifs,
} from "../../lib/puzzles/puzzleMotifs";
import { puzzleQueryKeys } from "../../lib/puzzles/puzzleQueries";
import { getOrderedPuzzleIndexesForEvent, isAwcPuzzleEvent } from "../../lib/puzzles/puzzleSets";
import { ensurePuzzlePgnHeaders } from "../../lib/puzzles/puzzleSubmission";
import { updatePuzzleTags } from "../../lib/puzzles/puzzleTags";
import {
  mergeAdditiveSolutionLine,
  movePrefix,
  serializeSanLinesToPgn,
} from "../../lib/puzzles/solutionPgn";
import {
  fetchAttemptedPuzzleIds,
  fetchPuzzleAttemptsForPuzzle,
  type PuzzleProgressWithUsernameRow,
  recordPuzzleProgress,
} from "../../lib/supabase/puzzleProgress";
import type {
  AttemptResolved,
  ChessboardState,
  PlaybackCommand,
  SolutionNavigation,
} from "../../types/chessboard";
import { formatLocalDateTime } from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";
import { castlingRightsFromFen } from "./castlingRights";
import { materialCountFromFen, type MaterialPieceRole } from "./materialCount";

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
const SOLVED_BEFORE_BADGE_LABEL = "You've solved this puzzle before";
const OPA_STYLE_BADGE_LABEL =
  "Only the best moves are accepted. Weaker alternatives are rejected even if they also lead to mate.";
const OTHER_PUZZLE_ATTEMPTS_LIMIT = 30;
const PUZZLE_PREFETCH_COUNT = 3;
const PUZZLE_TAG_EDITOR = "seaside_tiramisu";
const PUZZLE_EXPLANATION_LEGACY_AUTHOR = "admin";
const PUZZLE_EXPLANATION_LEGACY_EDITOR = "seaside_tiramisu";

const formatElapsedTime = (milliseconds: number): string => {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

type PuzzleInfoTab = "solution" | "explanation" | "attempts" | "comments";

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
const SERVER_CUSTOM_SET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PuzzleSolverPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    puzzleId: routePuzzleId = "",
    setKey: routeSetKey = "",
    setId: routeCustomSetId = "",
  } = useParams({ strict: false });
  const { isLoading: isAuthLoading, login, user } = useAuth();
  const { pieceSet, showPuzzleTimer } = useAppSettings();
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [attemptedPuzzleIds, setAttemptedPuzzleIds] = useState<Set<string>>(() => new Set());
  const [attemptedPuzzleIdsOwner, setAttemptedPuzzleIdsOwner] = useState<string | null>(null);
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
  const [explanationEditorOpen, setExplanationEditorOpen] = useState(false);
  const [explanationDraft, setExplanationDraft] = useState("");
  const [explanationSaveStatus, setExplanationSaveStatus] = useState<
    | { state: "idle" }
    | { state: "saving" }
    | { state: "saved" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const [pinnedSolutionLineIndex, setPinnedSolutionLineIndex] = useState<number | null>(null);
  const { copy: copyPgn, copyLabel: copyPgnLabel, resetCopyFeedback } = useCopyFeedback();
  const [otherPuzzleAttemptsStatus, setOtherPuzzleAttemptsStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [otherPuzzleAttempts, setOtherPuzzleAttempts] = useState<PuzzleProgressWithUsernameRow[]>(
    [],
  );
  const [motifEditorOpen, setMotifEditorOpen] = useState(false);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [reportIssueCategory, setReportIssueCategory] = useState<PuzzleIssueCategory>(
    "missing_alternate_solution",
  );
  const [reportIssueDetails, setReportIssueDetails] = useState("");
  const [reportIssueStatus, setReportIssueStatus] = useState<
    | { state: "idle" }
    | { state: "submitting" }
    | { state: "success" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const [selectedMotifTag, setSelectedMotifTag] = useState<string | null>(null);
  const [motifSaveStatus, setMotifSaveStatus] = useState<
    | { state: "idle" }
    | { state: "saving" }
    | { state: "saved" }
    | { state: "error"; message: string }
  >({ state: "idle" });
  const [boardState, setBoardState] = useState(createInitialBoardState);
  const previousBoardSnapshotRef = useRef<ReturnType<typeof createInitialBoardSnapshot>>(
    createInitialBoardSnapshot(),
  );
  const interactionModeRef = useRef(SOLVE_MODE);
  const hadWrongAttemptRef = useRef(false);
  const lockedCompletionFeedbackRef = useRef<CompletionFeedback | null>(null);
  const mobileFeedbackIdRef = useRef(0);
  const boardPanelRef = useRef<HTMLDivElement | null>(null);
  const motifDialogRef = useRef<HTMLDialogElement | null>(null);
  const reportIssueDialogRef = useRef<HTMLDialogElement | null>(null);
  const upcomingPuzzleIndexesRef = useRef<number[]>([]);
  const loadingPuzzleIdsRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);
  const initialRoutePuzzleIdRef = useRef(parsePuzzleId(routePuzzleId));
  const progressWriteQueueRef = useRef(Promise.resolve());
  const attemptedPuzzleIdsRef = useRef<Set<string>>(new Set());
  const activePuzzleKeyRef = useRef("");
  const elapsedTimeMsRef = useRef(0);
  const [elapsedTimeMs, setElapsedTimeMs] = useState(0);
  const [elapsedTimerRunning, setElapsedTimerRunning] = useState(false);
  const [customSetRefreshState, setCustomSetRefreshState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "empty"; message: string }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const customPuzzleSetQuery = useQuery({
    queryKey: ["custom-puzzle-sets", routeCustomSetId],
    queryFn: () => fetchCustomPuzzleSet(routeCustomSetId),
    enabled: Boolean(SERVER_CUSTOM_SET_ID_PATTERN.test(routeCustomSetId) && user?.username),
    retry: false,
  });
  const customPuzzleSet = customPuzzleSetQuery.data;
  const isCustomSetRoute = Boolean(routeCustomSetId);
  const attemptedPuzzleIdsUsername = normalizeUsername(user?.username);
  const attemptedPuzzleIdsReady =
    !isAuthLoading &&
    (!attemptedPuzzleIdsUsername || attemptedPuzzleIdsOwner === attemptedPuzzleIdsUsername);
  const orderedSetPuzzleIndexes = useMemo(
    () =>
      customPuzzleSet
        ? getOrderedPuzzleIndexesForCustomSet(puzzles, customPuzzleSet)
        : getOrderedPuzzleIndexesForEvent(puzzles, routeSetKey),
    [customPuzzleSet, puzzles, routeSetKey],
  );
  const isCustomSetSolveMode = Boolean(routeCustomSetId && customPuzzleSet);
  const isSetSolveMode = Boolean(
    orderedSetPuzzleIndexes.length > 0 && (routeSetKey || isCustomSetSolveMode),
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
      if (!attemptedPuzzleIdsReady) return -1;
      if (puzzles.length === 0) return -1;

      ensureUpcomingPuzzleIndexes(currentIndex);
      return upcomingPuzzleIndexesRef.current.pop() ?? -1;
    },
    [attemptedPuzzleIdsReady, ensureUpcomingPuzzleIndexes, puzzles.length],
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
      if (isCustomSetSolveMode) {
        void navigate({
          to: "/solve/custom/$setId/$puzzleId",
          params: { setId: routeCustomSetId, puzzleId: String(puzzleId) },
          replace: true,
        });
      } else if (isSetSolveMode) {
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
    [isCustomSetSolveMode, isSetSolveMode, navigate, routeCustomSetId, routeSetKey],
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
    if (isAuthLoading) return undefined;

    let isCurrent = true;
    const username = normalizeUsername(user?.username);

    if (!username) {
      setAttemptedPuzzleIds(new Set());
      setAttemptedPuzzleIdsOwner("");
      return undefined;
    }

    setAttemptedPuzzleIds(new Set());
    setAttemptedPuzzleIdsOwner(null);

    const loadAttemptedPuzzleIds = async () => {
      try {
        const attemptedIds = await fetchAttemptedPuzzleIds(username);
        if (isCurrent) {
          setAttemptedPuzzleIds(attemptedIds);
          setAttemptedPuzzleIdsOwner(username);
        }
      } catch (error) {
        if (!isCurrent) return;
        setAttemptedPuzzleIds(new Set());
        setAttemptedPuzzleIdsOwner(username);
        globalThis.console?.error(error);
      }
    };

    void loadAttemptedPuzzleIds();

    return () => {
      isCurrent = false;
    };
  }, [attemptedPuzzleIdsUsername, isAuthLoading, user?.username]);

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
    if (indexFromRoute < 0 && !attemptedPuzzleIdsReady) return;
    const initialIndex = indexFromRoute >= 0 ? indexFromRoute : getNextShuffledPuzzleIndex(-1);
    if (initialIndex < 0) return;

    setHistory([initialIndex]);
    setHistoryIndex(0);

    if (indexFromRoute < 0) {
      const puzzleId = puzzles[initialIndex]?.puzzleId;
      if (puzzleId !== undefined) {
        replaceUrlWithPuzzle(puzzleId);
      }
    }
  }, [
    attemptedPuzzleIdsReady,
    puzzles,
    historyIndex,
    routePuzzleId,
    replaceUrlWithPuzzle,
    getNextShuffledPuzzleIndex,
  ]);

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
  const activePuzzleSetMetadata = useMemo(
    () => (activePuzzle ? puzzleSetMetadataFromRow(activePuzzle) : null),
    [activePuzzle],
  );
  const fen = activePuzzle?.fen ?? "";
  const author = String(activePuzzle?.["author"] ?? "").trim() || "Unknown";
  const event = String(activePuzzle?.["event"] ?? "").trim();
  const explanation = activePuzzle?.explanation ?? "";
  const opaStyle = activePuzzle?.opa_style === true;
  const activePuzzleTags = useMemo(
    () => normalizePuzzleMotifTags(activePuzzle?.tags),
    [activePuzzle?.tags],
  );
  const selectedMotif = useMemo(
    () => puzzleMotifs.find((motif) => motif.tag === selectedMotifTag) ?? null,
    [selectedMotifTag],
  );
  const canManagePuzzleTags = user?.username?.trim().toLowerCase() === PUZZLE_TAG_EDITOR;
  const normalizedUsername = normalizeUsername(user?.username);
  const normalizedAuthor = normalizeUsername(author);
  const canManagePuzzleExplanation =
    Boolean(normalizedUsername) &&
    (normalizedUsername === normalizedAuthor ||
      (normalizedUsername === PUZZLE_EXPLANATION_LEGACY_EDITOR &&
        normalizedAuthor === PUZZLE_EXPLANATION_LEGACY_AUTHOR));
  const hasExplanation = explanation.trim().length > 0;
  const orientation = orientationFromFen(fen);
  const currentFen = boardState.fen || fen;
  const materialCount = useMemo(() => materialCountFromFen(currentFen), [currentFen]);
  const materialPieceStyle = useMemo(() => buildPieceStyle(pieceSet || "cburnett"), [pieceSet]);
  const castlingRights = castlingRightsFromFen(currentFen);
  const hasMaterialDifference = Boolean(currentFen) && materialCount.difference > 0;
  const hasAnyCastlingRights = castlingRights.white.length > 0 || castlingRights.black.length > 0;
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
  const showPuzzleSetMetadata = Boolean(
    !isCustomSetSolveMode && activePuzzleSetMetadata?.eventName,
  );
  const puzzleSetDate =
    activePuzzleSetMetadata && !isAwcPuzzleEvent(activePuzzleSetMetadata.eventName)
      ? formatPuzzleSetDate(activePuzzleSetMetadata.eventDate)
      : "";
  const puzzleSetPlayers = activePuzzleSetMetadata
    ? formatPuzzleSetPlayers(activePuzzleSetMetadata.players)
    : "";
  const isAnalysisMode = interactionMode === ANALYSIS_MODE;
  const hasPersistedAttempt = activePuzzleKey ? attemptedPuzzleIds.has(activePuzzleKey) : false;
  const hasResolvedAttempt = activePuzzleKey
    ? resolvedAttemptedPuzzleIds.has(activePuzzleKey)
    : false;
  // A custom set is a fresh solving pass. A historical attempt may still be
  // acknowledged by the badge, but it must not reveal post-attempt UI before
  // the solver finishes this pass through the puzzle.
  const hasAttemptedActivePuzzle = hasResolvedAttempt || (!isCustomSetRoute && hasPersistedAttempt);
  const attemptedPuzzleBadgeLabel = isCustomSetRoute
    ? SOLVED_BEFORE_BADGE_LABEL
    : ATTEMPTED_PUZZLE_BADGE_LABEL;
  const canViewExplanation =
    (hasExplanation || canManagePuzzleExplanation) &&
    (hasAttemptedActivePuzzle || explanationUnlockedByWrongMove);
  const showSolution = activePuzzleInfoTab === "solution";
  const showExplanation = activePuzzleInfoTab === "explanation";
  const otherPuzzleAttemptsOpen = activePuzzleInfoTab === "attempts";
  const commentsSelected = activePuzzleInfoTab === "comments";
  const boardShowsSolution = isAnalysisMode && solutionRevealed;

  useEffect(() => {
    setMotifEditorOpen(false);
    setSelectedMotifTag(null);
    setMotifSaveStatus({ state: "idle" });
    setExplanationEditorOpen(false);
    setExplanationDraft("");
    setExplanationSaveStatus({ state: "idle" });
    setReportIssueOpen(false);
    setReportIssueCategory("missing_alternate_solution");
    setReportIssueDetails("");
    setReportIssueStatus({ state: "idle" });
  }, [activePuzzleId]);

  useEffect(() => {
    const dialog = reportIssueDialogRef.current;
    if (reportIssueOpen && dialog && !dialog.open) dialog.showModal();
    if (!reportIssueOpen && dialog?.open) dialog.close();
  }, [reportIssueOpen]);

  useEffect(() => {
    if (!selectedMotif) return undefined;

    const dialog = motifDialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setSelectedMotifTag(null);
    };
    const handleDialogClick = (event: MouseEvent): void => {
      if (event.target === dialog) setSelectedMotifTag(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    dialog?.addEventListener("click", handleDialogClick);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      dialog?.removeEventListener("click", handleDialogClick);
      if (dialog?.open) dialog.close();
    };
  }, [selectedMotif]);

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
    void loadPuzzlesById(missingIds)
      .then((loadedPuzzles) => {
        if (!isMountedRef.current) return;
        mergeLoadedPuzzles(loadedPuzzles);

        const loadedIds = new Set(loadedPuzzles.map((puzzle) => String(puzzle.puzzleId)));
        const activeRequestedId = missingIds.find(
          (puzzleId) => String(puzzleId) === activePuzzleKeyRef.current,
        );
        if (activeRequestedId !== undefined && !loadedIds.has(String(activeRequestedId))) {
          setLoadingError(
            `Puzzle #${activeRequestedId} is unavailable or has no playable solution.`,
          );
        }
      })
      .catch((error) => {
        if (!isMountedRef.current) return;
        const requestIncludesActivePuzzle = missingIds.some(
          (puzzleId) => String(puzzleId) === activePuzzleKeyRef.current,
        );
        if (requestIncludesActivePuzzle) {
          setLoadingError(error instanceof Error ? error.message : "Failed to load puzzle data");
        } else {
          globalThis.console?.error(error);
        }
      })
      .finally(() => {
        missingIds.forEach((puzzleId) => loadingPuzzleIdsRef.current.delete(String(puzzleId)));
      });
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
      correctMove,
    }: {
      puzzleId: string | number | null | undefined;
      puzzleCorrect: boolean;
      incorrectMove: string | null;
      correctMove: string | null;
    }): void => {
      const normalizedPuzzleId = toPuzzleKey(puzzleId);
      if (!normalizedPuzzleId || !user?.username) return;
      if (attemptedPuzzleIdsRef.current.has(normalizedPuzzleId)) return;

      progressWriteQueueRef.current = progressWriteQueueRef.current
        .catch(() => {})
        .then(() =>
          recordPuzzleProgress({
            username: user.username,
            puzzleId: normalizedPuzzleId,
            puzzleCorrect,
            incorrectMove,
            correctMove,
          }).then(() => {
            setAttemptedPuzzleIds((current) => addValueToSet(current, normalizedPuzzleId));
            void queryClient.invalidateQueries({ queryKey: puzzleQueryKeys.progress });
          }),
        )
        .catch((error) => {
          globalThis.console?.error(error);
        });
    },
    [queryClient, user?.username],
  );

  const handleAttemptResolved = useCallback(
    ({ puzzleId, puzzleCorrect, incorrectMove, correctMove }: AttemptResolved): void => {
      setElapsedTimerRunning(false);
      const normalizedPuzzleId = toPuzzleKey(puzzleId);
      setResolvedAttemptedPuzzleIds((current) => addValueToSet(current, normalizedPuzzleId));

      enqueuePuzzleProgressWrite({
        puzzleId: normalizedPuzzleId,
        puzzleCorrect,
        incorrectMove,
        correctMove,
      });
      if (SERVER_CUSTOM_SET_ID_PATTERN.test(routeCustomSetId)) {
        void recordCustomPuzzleSetProgress(routeCustomSetId, normalizedPuzzleId, puzzleCorrect)
          .then(() =>
            queryClient.invalidateQueries({
              queryKey: ["custom-puzzle-sets"],
            }),
          )
          .catch((error) => globalThis.console?.error(error));
      }
    },
    [enqueuePuzzleProgressWrite, queryClient, routeCustomSetId],
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
    setCustomSetRefreshState({ status: "idle" });
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
    resetCopyFeedback();
    setOtherPuzzleAttemptsStatus("idle");
    setOtherPuzzleAttempts([]);
    previousBoardSnapshotRef.current = createInitialBoardSnapshot();
  }, [activePuzzleId, fen, resetCopyFeedback, resetPuzzleUiState]);

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

  const handleRefreshCustomSet = async (): Promise<void> => {
    if (!isCustomSetSolveMode || !customPuzzleSet) return;
    setCustomSetRefreshState({ status: "loading" });
    try {
      const result = await refreshCustomPuzzleSet(customPuzzleSet.id);
      queryClient.setQueryData(["custom-puzzle-sets", customPuzzleSet.id], result.set);
      void queryClient.invalidateQueries({ queryKey: ["custom-puzzle-sets"] });
      const firstAddedPuzzleId = result.addedPuzzleIds[0];
      if (firstAddedPuzzleId) {
        replaceUrlWithPuzzle(firstAddedPuzzleId);
        return;
      }
      setCustomSetRefreshState({
        status: "empty",
        message: "No new puzzles match this set’s filters.",
      });
    } catch (error) {
      setCustomSetRefreshState({
        status: "error",
        message: error instanceof Error ? error.message : "Unable to add newly matching puzzles.",
      });
    }
  };

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

    if (showSolution) {
      setActivePuzzleInfoTab(null);
      setSolutionNavigation(null);
      return;
    }

    setInteractionMode(ANALYSIS_MODE);
    setSolutionRevealed(true);
    setActivePuzzleInfoTab("solution");
    setSolutionNavigation(null);
    if (isMobileLayout) {
      window.requestAnimationFrame(() => {
        boardPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const handleSelectOtherPuzzleAttemptsTab = () => {
    if (!hasAttemptedActivePuzzle) return;

    if (otherPuzzleAttemptsOpen) {
      setActivePuzzleInfoTab(null);
      setSolutionNavigation(null);
      return;
    }

    setActivePuzzleInfoTab("attempts");
    setSolutionNavigation(null);
    if (isMobileLayout) {
      window.requestAnimationFrame(() => {
        boardPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
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

    if (showExplanation) {
      setActivePuzzleInfoTab(null);
      setSolutionNavigation(null);
      return;
    }

    setActivePuzzleInfoTab("explanation");
    setSolutionNavigation(null);
    if (isMobileLayout) {
      window.requestAnimationFrame(() => {
        boardPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const handleOpenExplanationEditor = () => {
    if (!canManagePuzzleExplanation) return;
    setExplanationDraft(explanation);
    setExplanationSaveStatus({ state: "idle" });
    setExplanationEditorOpen(true);
  };

  const handleCancelExplanationEdit = () => {
    setExplanationEditorOpen(false);
    setExplanationDraft(explanation);
    setExplanationSaveStatus({ state: "idle" });
  };

  const handleSaveExplanation = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (
      !canManagePuzzleExplanation ||
      !activePuzzleId ||
      explanationSaveStatus.state === "saving"
    ) {
      return;
    }

    setExplanationSaveStatus({ state: "saving" });
    try {
      await progressWriteQueueRef.current.catch(() => undefined);
      const savedExplanation = await updatePuzzleExplanation(activePuzzleId, explanationDraft);
      setPuzzles((current) =>
        current.map((puzzle) =>
          puzzle.puzzleId === activePuzzleId
            ? { ...puzzle, explanation: savedExplanation }
            : puzzle,
        ),
      );
      setExplanationDraft(savedExplanation);
      setExplanationEditorOpen(false);
      setExplanationSaveStatus({ state: "saved" });
    } catch (error) {
      setExplanationSaveStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Unable to update puzzle explanation.",
      });
    }
  };

  const handleSelectCommentsTab = () => {
    if (!hasAttemptedActivePuzzle) return;

    setActivePuzzleInfoTab("comments");
    setSolutionNavigation(null);
    window.requestAnimationFrame(() => {
      document
        .getElementById("puzzle-community")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
    () =>
      (boardState.customLines ?? []).reduce(
        (lines, customLine) => mergeAdditiveSolutionLine(lines, customLine).lines,
        boardState.solutionLines ?? [],
      ),
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

  const puzzlePgn = useMemo(
    () => (moveLinePgn && fen ? `${ensurePuzzlePgnHeaders("", fen)}\n\n${moveLinePgn}` : ""),
    [fen, moveLinePgn],
  );

  const handleCopyPgn = useCallback(async () => {
    if (!puzzlePgn) return;

    await copyPgn(puzzlePgn);
  }, [copyPgn, puzzlePgn]);

  const handleUpdateMotifs = async (nextTags: string[]): Promise<void> => {
    if (!canManagePuzzleTags || !activePuzzleId || motifSaveStatus.state === "saving") return;
    setMotifSaveStatus({ state: "saving" });

    try {
      const savedTags = await updatePuzzleTags(activePuzzleId, nextTags);
      setPuzzles((current) =>
        current.map((puzzle) =>
          puzzle.puzzleId === activePuzzleId ? { ...puzzle, tags: savedTags } : puzzle,
        ),
      );
      setMotifSaveStatus({ state: "saved" });
    } catch (error) {
      setMotifSaveStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Unable to update puzzle motifs.",
      });
    }
  };

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
                {attempt.puzzle_correct && attempt.correct_move ? (
                  <span
                    className="puzzleOtherAttemptMove"
                    aria-label={`Played ${attempt.correct_move}`}
                  >
                    {attempt.correct_move}
                  </span>
                ) : null}
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

  const renderPuzzleInfoTabs = (mobile = false) => (
    <div className="puzzleInfoTabs" role="tablist" aria-label="Puzzle details">
      <button
        type="button"
        role="tab"
        className={`puzzleInfoTab ${showSolution ? "active" : ""}`}
        onClick={handleSelectSolutionTab}
        disabled={!canRevealSolution}
        aria-selected={showSolution}
        aria-expanded={showSolution}
        title={showSolution ? "Hide the solution panel" : solutionButtonTitle}
      >
        <FontAwesomeIcon icon={faMagnifyingGlassChart} aria-hidden="true" />
        <span>Solution</span>
        {mobile && showSolution ? (
          <span className="puzzleInfoTabToggle" aria-hidden="true">
            ⌃
          </span>
        ) : null}
      </button>
      {hasExplanation || canManagePuzzleExplanation ? (
        <button
          type="button"
          role="tab"
          className={`puzzleInfoTab ${showExplanation ? "active" : ""}`}
          onClick={handleSelectExplanationTab}
          disabled={!canViewExplanation}
          aria-expanded={showExplanation}
          aria-selected={showExplanation}
          title={
            showExplanation
              ? "Hide the puzzle explanation"
              : !canViewExplanation
                ? "Attempt this puzzle before viewing or editing the explanation."
                : canManagePuzzleExplanation
                  ? hasExplanation
                    ? "View or edit the puzzle explanation"
                    : "Add a puzzle explanation"
                  : "View the puzzle explanation"
          }
        >
          <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
          <span>{mobile ? "Explain" : "Explanation"}</span>
          {mobile && showExplanation ? (
            <span className="puzzleInfoTabToggle" aria-hidden="true">
              ⌃
            </span>
          ) : null}
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
          otherPuzzleAttemptsOpen
            ? "Hide other attempts"
            : hasAttemptedActivePuzzle
              ? "View other attempts for this puzzle"
              : "Attempt this puzzle before viewing other attempts."
        }
      >
        <FontAwesomeIcon icon={faUsers} aria-hidden="true" />
        <span>{mobile ? "Attempts" : "Other attempts"}</span>
        {mobile && otherPuzzleAttemptsOpen ? (
          <span className="puzzleInfoTabToggle" aria-hidden="true">
            ⌃
          </span>
        ) : null}
      </button>
      {mobile ? (
        <button
          type="button"
          role="tab"
          className={`puzzleInfoTab ${commentsSelected ? "active" : ""}`}
          onClick={handleSelectCommentsTab}
          disabled={!hasAttemptedActivePuzzle}
          aria-selected={commentsSelected}
          title={
            hasAttemptedActivePuzzle
              ? "Jump to the puzzle discussion"
              : "Attempt this puzzle before viewing comments."
          }
        >
          <FontAwesomeIcon icon={faComment} aria-hidden="true" />
          <span>Comments</span>
        </button>
      ) : null}
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
            <div className="puzzleExplanationHeader">
              <strong>Explanation</strong>
              {canManagePuzzleExplanation && !explanationEditorOpen ? (
                <button
                  type="button"
                  className="puzzleExplanationEditButton"
                  onClick={handleOpenExplanationEditor}
                >
                  {hasExplanation ? "Edit" : "Add explanation"}
                </button>
              ) : null}
            </div>
            {explanationEditorOpen ? (
              <form className="puzzleExplanationForm" onSubmit={handleSaveExplanation}>
                <label htmlFor={`puzzle-explanation-${activePuzzleId}`}>Puzzle explanation</label>
                <textarea
                  id={`puzzle-explanation-${activePuzzleId}`}
                  value={explanationDraft}
                  maxLength={5000}
                  rows={5}
                  onChange={(event) => setExplanationDraft(event.target.value)}
                  disabled={explanationSaveStatus.state === "saving"}
                />
                <div className="puzzleExplanationFormActions">
                  <button
                    type="button"
                    onClick={handleCancelExplanationEdit}
                    disabled={explanationSaveStatus.state === "saving"}
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={explanationSaveStatus.state === "saving"}>
                    {explanationSaveStatus.state === "saving" ? "Saving…" : "Save explanation"}
                  </button>
                </div>
              </form>
            ) : hasExplanation ? (
              <p>{explanation}</p>
            ) : (
              <p className="puzzleExplanationEmpty">No explanation has been added yet.</p>
            )}
            {explanationSaveStatus.state === "saved" ? (
              <span className="puzzleExplanationMessage success">Explanation saved.</span>
            ) : null}
            {explanationSaveStatus.state === "error" ? (
              <span className="puzzleExplanationMessage error" role="alert">
                {explanationSaveStatus.message}
              </span>
            ) : null}
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
        {renderPuzzleInfoTabs(mobile)}
        {panel}
      </div>
    );
  };

  const renderCastlingRights = () =>
    hasAnyCastlingRights ? (
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

  const renderPuzzleMotifs = () => {
    if (!hasAttemptedActivePuzzle) return null;
    const savingMotifs = motifSaveStatus.state === "saving";
    const availableMotifs = puzzleMotifs.filter((motif) => !activePuzzleTags.includes(motif.tag));
    const availableTagSet = new Set(availableMotifs.map((motif) => motif.tag));
    const orderedAvailableMotifs = availableMotifs
      .filter((motif) => !motif.parentTag || !availableTagSet.has(motif.parentTag))
      .flatMap((motif) => [
        motif,
        ...availableMotifs.filter((candidate) => candidate.parentTag === motif.tag),
      ]);

    return (
      <section className="puzzleMotifsPanel" aria-label="Puzzle tags">
        <div className="puzzleMotifsHeader">
          <div>
            <span>Tags</span>
          </div>
        </div>

        <div
          className="puzzleMotifAppliedList"
          aria-label="Tags on this puzzle"
          aria-busy={savingMotifs}
        >
          {activePuzzleTags.length > 0 ? (
            activePuzzleTags.map((tag) => {
              const motif = puzzleMotifs.find((entry) => entry.tag === tag);
              const parentMotif = motif ? getPuzzleMotifParent(motif) : undefined;

              return (
                <div className="puzzleMotifAppliedTag" key={tag}>
                  <button
                    type="button"
                    className="puzzleMotifDefinitionButton"
                    onClick={() => setSelectedMotifTag(tag)}
                    aria-label={`View definition for ${motif?.name ?? tag}`}
                  >
                    {parentMotif ? (
                      <small className="puzzleMotifAppliedParent">{parentMotif.name} ›</small>
                    ) : null}
                    {motif?.name ?? tag}
                  </button>
                  {canManagePuzzleTags ? (
                    <button
                      type="button"
                      className="puzzleMotifRemoveButton"
                      aria-label={`Remove ${tag}`}
                      title={`Remove ${tag}`}
                      disabled={savingMotifs}
                      onClick={() =>
                        void handleUpdateMotifs(activePuzzleTags.filter((entry) => entry !== tag))
                      }
                    >
                      <span aria-hidden="true">−</span>
                    </button>
                  ) : null}
                </div>
              );
            })
          ) : (
            <em>No tags yet.</em>
          )}
        </div>

        {canManagePuzzleTags ? (
          <button
            type="button"
            className="puzzleMotifsAddButton"
            aria-expanded={motifEditorOpen}
            disabled={savingMotifs || availableMotifs.length === 0}
            onClick={() => {
              setMotifEditorOpen((open) => !open);
              setMotifSaveStatus({ state: "idle" });
            }}
          >
            <span aria-hidden="true">{motifEditorOpen ? "−" : "+"}</span>
            {motifEditorOpen ? "Close tag picker" : "Add tag"}
          </button>
        ) : null}

        {motifEditorOpen && canManagePuzzleTags ? (
          <div className="puzzleMotifPicker" role="region" aria-label="Add puzzle tag">
            <div className="puzzleMotifPickerHeading">
              <strong>Add tag</strong>
              <span>{availableMotifs.length} available</span>
            </div>
            <div className="puzzleMotifPickerOptions puzzleMotifPickerOptionsFlat">
              {orderedAvailableMotifs.map((motif) => {
                const parentMotif = getPuzzleMotifParent(motif);
                return (
                  <button
                    key={motif.tag}
                    type="button"
                    className={parentMotif ? "puzzleMotifChildOption" : undefined}
                    aria-label={`Add ${motif.tag}`}
                    title={motif.description}
                    disabled={savingMotifs}
                    onClick={() => void handleUpdateMotifs([...activePuzzleTags, motif.tag])}
                  >
                    <span className="puzzleMotifPickerOptionLabel">
                      {parentMotif ? <small>{parentMotif.name} ›</small> : null}
                      <span>{motif.name}</span>
                    </span>
                    <strong aria-hidden="true">+</strong>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {motifSaveStatus.state === "saving" ? (
          <p className="puzzleMotifsMessage" role="status">
            Updating tags…
          </p>
        ) : null}

        {motifSaveStatus.state === "saved" ? (
          <p className="puzzleMotifsMessage success" role="status">
            Tags updated.
          </p>
        ) : null}
        {motifSaveStatus.state === "error" ? (
          <p className="puzzleMotifsMessage error" role="alert">
            {motifSaveStatus.message}
          </p>
        ) : null}
      </section>
    );
  };

  const renderMotifDefinitionDialog = () =>
    selectedMotif ? (
      <dialog
        ref={motifDialogRef}
        className="puzzleMotifDefinitionDialog"
        aria-labelledby="puzzle-motif-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          setSelectedMotifTag(null);
        }}
      >
        <div className="puzzleMotifDefinitionCard">
          <div className="puzzleMotifDefinitionHeading">
            <div>
              <span>
                {getPuzzleMotifParent(selectedMotif)?.name ?? "Atomic motif"}
                {selectedMotif.parentTag ? " submotif" : ""}
              </span>
              <h2 id="puzzle-motif-dialog-title">{selectedMotif.name}</h2>
            </div>
            <button
              type="button"
              className="puzzleMotifDefinitionClose"
              onClick={() => setSelectedMotifTag(null)}
              aria-label="Close tag definition"
            >
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          </div>
          <p>{selectedMotif.description}</p>
          <span className="puzzleMotifDefinitionTag">{selectedMotif.tag}</span>
        </div>
      </dialog>
    ) : null;

  const closeReportIssueDialog = () => {
    setReportIssueOpen(false);
    setReportIssueStatus({ state: "idle" });
  };

  const submitPuzzleIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activePuzzleId || !user?.username || reportIssueStatus.state === "submitting") return;
    if (reportIssueCategory === "other" && !reportIssueDetails.trim()) {
      setReportIssueStatus({ state: "error", message: "Describe the issue." });
      return;
    }
    setReportIssueStatus({ state: "submitting" });
    try {
      await progressWriteQueueRef.current.catch(() => undefined);
      await reportPuzzleIssue(activePuzzleId, reportIssueCategory, reportIssueDetails.trim());
      setReportIssueStatus({ state: "success" });
    } catch (reportError) {
      setReportIssueStatus({
        state: "error",
        message: reportError instanceof Error ? reportError.message : "Unable to report issue.",
      });
    }
  };

  const renderReportIssueDialog = () => (
    <dialog
      ref={reportIssueDialogRef}
      className="puzzleIssueDialog"
      aria-labelledby="puzzle-issue-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        closeReportIssueDialog();
      }}
    >
      <div className="puzzleIssueDialogCard">
        <header className="puzzleIssueDialogHeading">
          <h2 id="puzzle-issue-dialog-title">Report puzzle issue</h2>
          <button type="button" onClick={closeReportIssueDialog} aria-label="Close issue report">
            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
          </button>
        </header>
        {reportIssueStatus.state === "success" ? (
          <div className="puzzleIssueSuccess" role="status">
            <strong>Report sent</strong>
            <p>Thanks. The puzzle will be reviewed.</p>
            <button type="button" onClick={closeReportIssueDialog}>
              Done
            </button>
          </div>
        ) : user?.username ? (
          <form className="puzzleIssueForm" onSubmit={(event) => void submitPuzzleIssue(event)}>
            <fieldset disabled={reportIssueStatus.state === "submitting"}>
              <legend>What’s wrong?</legend>
              <label>
                <input
                  type="radio"
                  name="puzzle-issue-category"
                  value="missing_alternate_solution"
                  checked={reportIssueCategory === "missing_alternate_solution"}
                  onChange={() => setReportIssueCategory("missing_alternate_solution")}
                />
                <span>Missing alternate solution</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="puzzle-issue-category"
                  value="incorrect_solution"
                  checked={reportIssueCategory === "incorrect_solution"}
                  onChange={() => setReportIssueCategory("incorrect_solution")}
                />
                <span>Incorrect solution</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="puzzle-issue-category"
                  value="other"
                  checked={reportIssueCategory === "other"}
                  onChange={() => setReportIssueCategory("other")}
                />
                <span>Other</span>
              </label>
            </fieldset>
            <label className="puzzleIssueDetailsField">
              <span>Details {reportIssueCategory === "other" ? "(required)" : "(optional)"}</span>
              <textarea
                rows={4}
                maxLength={2000}
                required={reportIssueCategory === "other"}
                value={reportIssueDetails}
                disabled={reportIssueStatus.state === "submitting"}
                onChange={(event) => setReportIssueDetails(event.target.value)}
                placeholder="Include the move or line that needs review."
              />
            </label>
            {reportIssueStatus.state === "error" ? (
              <p className="puzzleIssueFormError" role="alert">
                {reportIssueStatus.message}
              </p>
            ) : null}
            <div className="puzzleIssueFormActions">
              <button type="button" onClick={closeReportIssueDialog}>
                Cancel
              </button>
              <button
                type="submit"
                className="primary"
                disabled={reportIssueStatus.state === "submitting"}
              >
                {reportIssueStatus.state === "submitting" ? "Sending…" : "Send report"}
              </button>
            </div>
          </form>
        ) : (
          <div className="puzzleIssueLogin">
            <p>Log in with Lichess to send this report.</p>
            <button
              type="button"
              onClick={() => void login(`${window.location.pathname}${window.location.search}`)}
            >
              Log in with Lichess
            </button>
          </div>
        )}
      </div>
    </dialog>
  );

  const renderMaterialDifference = (side: "white" | "black") => {
    const label = side === "white" ? "White" : "Black";
    const pieces = side === "white" ? materialCount.whitePieces : materialCount.blackPieces;
    const status = pieces.length
      ? `${label} material difference: ${pieces.join(", ")}`
      : `${label} has no extra pieces`;

    return (
      <div className={`materialDifference ${side}`} aria-label={status} title={status}>
        <span className="materialDifferenceSide">{label}</span>
        <span className="materialDifferencePieces" aria-live="polite">
          {pieces.map((role: MaterialPieceRole, index: number) => (
            <span
              className={`materialDifferencePiece ${role}`}
              style={{
                maskImage: `var(--cg-piece-white-${role})`,
                WebkitMaskImage: `var(--cg-piece-white-${role})`,
              }}
              aria-hidden="true"
              key={`${role}-${index}`}
            />
          ))}
        </span>
      </div>
    );
  };

  return (
    <div className="page puzzlePage" style={materialPieceStyle}>
      <Seo
        title={activePuzzleId ? `Puzzle #${activePuzzleId}` : "Solve a Puzzle"}
        description={
          activePuzzleId
            ? `Solve atomic chess puzzle ${activePuzzleId} and play through the full forcing line.`
            : "Solve atomic chess puzzles drawn from real games and community analysis."
        }
        path={
          activePuzzleId
            ? isCustomSetSolveMode
              ? `/solve/custom/${encodeURIComponent(routeCustomSetId)}/${activePuzzleId}`
              : isSetSolveMode
                ? `/solve/set/${encodeURIComponent(routeSetKey)}/${activePuzzleId}`
                : `/solve/${activePuzzleId}`
            : "/solve"
        }
      />
      {renderMotifDefinitionDialog()}
      {renderReportIssueDialog()}
      <div className="panel puzzlePanel">
        <header className="puzzleHeader">
          <div className="puzzleHeaderTopline">
            <h1>{activePuzzleId ? `Puzzle ${activePuzzleId}` : "Puzzle"}</h1>
            <div className="puzzleHeaderStatus">
              {!isMobileLayout && showPuzzleTimer ? (
                <div
                  className="puzzleElapsedTimer desktop"
                  aria-label={`Elapsed time ${formatElapsedTime(elapsedTimeMs)}`}
                >
                  <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
                  <span>{formatElapsedTime(elapsedTimeMs)}</span>
                </div>
              ) : null}
              {hasPersistedAttempt ? (
                <span
                  className="puzzleAttemptedBadge"
                  role="img"
                  tabIndex={0}
                  title={attemptedPuzzleBadgeLabel}
                  aria-label={attemptedPuzzleBadgeLabel}
                  data-tooltip={attemptedPuzzleBadgeLabel}
                >
                  <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
                </span>
              ) : null}
              {opaStyle ? (
                <span
                  className="puzzleOpaBadge"
                  tabIndex={0}
                  title={OPA_STYLE_BADGE_LABEL}
                  aria-label={`OPA style: ${OPA_STYLE_BADGE_LABEL}`}
                  data-tooltip={OPA_STYLE_BADGE_LABEL}
                >
                  OPA style
                </span>
              ) : null}
              <div className="puzzleCount" aria-label="Puzzle count">
                <span>{puzzleOrdinal ?? "-"}</span>
                <small>of {puzzleCount || "-"}</small>
              </div>
            </div>
          </div>

          {showPuzzleSetMetadata && activePuzzleSetMetadata ? (
            <section className="puzzleHeaderSetMetadata" aria-label="Puzzle set details">
              <strong>{activePuzzleSetMetadata.eventName}</strong>
              {puzzleSetDate || puzzleSetPlayers ? (
                <span className="puzzleHeaderSetDetails">
                  {puzzleSetDate ? (
                    <time dateTime={activePuzzleSetMetadata.eventDate}>{puzzleSetDate}</time>
                  ) : null}
                  {puzzleSetDate && puzzleSetPlayers ? <span aria-hidden="true">·</span> : null}
                  {puzzleSetPlayers ? <span>{puzzleSetPlayers}</span> : null}
                </span>
              ) : null}
            </section>
          ) : null}

          <div className="puzzleHeaderMetadata">
            <div className="puzzleHeaderMeta" title={author}>
              <span>Created by</span>
              <strong>{author}</strong>
            </div>
            {event && !showPuzzleSetMetadata ? (
              <div className="puzzleHeaderEvent" title={event}>
                {event}
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

        {renderPuzzleMotifs()}

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
                You finished all {puzzleCount} puzzles
                {isCustomSetSolveMode
                  ? ` in ${customPuzzleSet?.label ?? "this dashboard set"}`
                  : event
                    ? ` in ${event}`
                    : ""}
                .
              </p>
            </div>
            <div className="puzzleSetCompleteActions">
              {isCustomSetSolveMode && customPuzzleSet?.tags.length ? (
                <button
                  type="button"
                  className="puzzleSetCompleteLink primary"
                  onClick={() => void handleRefreshCustomSet()}
                  disabled={customSetRefreshState.status === "loading"}
                >
                  {customSetRefreshState.status === "loading"
                    ? "Checking for new puzzles…"
                    : "Add new matching puzzles"}
                </button>
              ) : null}
              <Link
                className={`puzzleSetCompleteLink ${
                  isCustomSetSolveMode && customPuzzleSet?.tags.length ? "" : "primary"
                }`.trim()}
                to="/solve"
              >
                Continue with regular puzzles
              </Link>
              <Link
                className="puzzleSetCompleteLink"
                to={isCustomSetSolveMode ? "/solve/custom-sets" : "/solve/sets"}
              >
                {isCustomSetSolveMode ? "Back to custom sets" : "Back to puzzle sets"}
              </Link>
              {customSetRefreshState.status === "empty" ||
              customSetRefreshState.status === "error" ? (
                <p
                  className={`puzzleSetRefreshMessage ${customSetRefreshState.status}`}
                  role={customSetRefreshState.status === "error" ? "alert" : "status"}
                >
                  {customSetRefreshState.message}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {!isMobileLayout ? (
          <div className="puzzleDetails">
            {hasAnyCastlingRights || hasMaterialDifference ? (
              <div className="puzzlePositionSummary">
                {renderCastlingRights()}
                {hasMaterialDifference ? (
                  <div className="materialDifferencePanel" aria-label="Material difference">
                    <span className="materialDifferenceLabel">Material</span>
                    {renderMaterialDifference("white")}
                    {renderMaterialDifference("black")}
                  </div>
                ) : null}
              </div>
            ) : null}
            {renderPuzzleInfoSection()}
          </div>
        ) : null}
      </div>

      <div className="boardWrap">
        <div
          ref={boardPanelRef}
          className={`boardFrame ${feedback ? `hasFeedback ${feedback.type}` : ""}`}
        >
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
                title={attemptedPuzzleBadgeLabel}
                aria-label={attemptedPuzzleBadgeLabel}
                data-tooltip={attemptedPuzzleBadgeLabel}
              >
                <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
              </span>
            ) : null}
            {opaStyle ? (
              <span
                className="puzzleOpaBadge"
                tabIndex={0}
                title={OPA_STYLE_BADGE_LABEL}
                aria-label={`OPA style: ${OPA_STYLE_BADGE_LABEL}`}
                data-tooltip={OPA_STYLE_BADGE_LABEL}
              >
                OPA style
              </span>
            ) : null}
            <span className="mobilePuzzleAuthor" title={author}>
              {author}
            </span>
          </div>
          {hasAttemptedActivePuzzle ? (
            <div id="mobile-puzzle-vote-slot" className="mobilePuzzleVoteSlot" />
          ) : null}
          {hasAnyCastlingRights || hasMaterialDifference ? (
            <div className="mobilePositionSummary">
              {hasAnyCastlingRights ? (
                <div className="mobileCastlingRights">{renderCastlingRights()}</div>
              ) : null}
              {hasMaterialDifference ? (
                <div className="mobileMaterialDifference">
                  <div className="materialDifferencePanel" aria-label="Material difference">
                    <span className="materialDifferenceLabel">Material</span>
                    {renderMaterialDifference("white")}
                    {renderMaterialDifference("black")}
                  </div>
                </div>
              ) : null}
            </div>
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
        <p className="puzzleIssuePrompt">
          Something wrong with this puzzle?
          <button type="button" onClick={() => setReportIssueOpen(true)}>
            Report issue
          </button>
        </p>
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
