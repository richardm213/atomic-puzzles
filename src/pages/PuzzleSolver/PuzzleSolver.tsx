import "./PuzzleSolver.css";

import {
  faChevronLeft,
  faChevronRight,
  faClockRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import {
  DAILY_PUZZLE_ATTEMPT_LIMIT,
  DAILY_PUZZLE_ATTEMPT_LIMIT_MESSAGE,
  DAILY_PUZZLE_LOAD_BLOCKED_MESSAGE,
  isTimestampInUtcDay,
  utcDayBounds,
} from "../../../shared/domain/puzzles/dailyAttemptLimit";
import { rewindPuzzleLeadIn } from "../../../shared/domain/puzzles/gameHistory";
import { PUZZLE_ADMIN_USERNAME } from "../../../shared/domain/puzzles/puzzleAdmin";
import {
  normalizePuzzleLevel,
  type PuzzleLevel,
  puzzleLevelLabel,
} from "../../../shared/domain/puzzles/puzzleRating";
import {
  formatPuzzleSetDate,
  puzzleSetMetadataFromRow,
} from "../../../shared/domain/puzzles/puzzleSetMetadata";
import { Chessboard } from "../../components/Chessboard/Chessboard";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { PuzzleCommunity } from "../../components/PuzzleCommunity/PuzzleCommunity";
import { PuzzleTagVotingPanel } from "../../components/PuzzleTagVotingPanel/PuzzleTagVotingPanel";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import {
  activeLineIndex,
  matchingLineIndexes,
  sortMatchingLineIndexes,
} from "../../components/VariationTree/VariationTree";
import { useAppSettings } from "../../context/AppSettings";
import { useAuth } from "../../context/AuthContext";
import { useBoardItemShortcuts } from "../../hooks/useBoardItemShortcuts";
import { useBoardWheelNavigation } from "../../hooks/useBoardWheelNavigation";
import { boardLineNavigation, getBoardLineState } from "../../lib/analysis/boardState";
import { ApiError } from "../../lib/api/postApi";
import {
  fetchCustomPuzzleSet,
  getOrderedPuzzleIndexesForCustomSet,
  recordCustomPuzzleSetProgress,
  refreshCustomPuzzleSet,
} from "../../lib/puzzles/customPuzzleSets";
import {
  getOrderedPuzzleIndexesForDashboardSet,
  readDashboardPuzzleSet,
} from "../../lib/puzzles/dashboardPuzzleSets";
import { getPuzzleUnratedReason } from "../../lib/puzzles/puzzleAttemptRating";
import { updatePuzzleExplanation } from "../../lib/puzzles/puzzleExplanation";
import { type PuzzleIssueCategory, reportPuzzleIssue } from "../../lib/puzzles/puzzleIssues";
import { loadPuzzlesById } from "../../lib/puzzles/puzzleLibrary";
import { normalizePuzzleMotifTags } from "../../lib/puzzles/puzzleMotifs";
import {
  puzzlePlayerNicknamesQueryOptions,
  puzzleQueryKeys,
  puzzleUserRatingQueryOptions,
} from "../../lib/puzzles/puzzleQueries";
import { puzzleRatingFromRow, updatePuzzleRating } from "../../lib/puzzles/puzzleRating";
import {
  getOrderedPuzzleIndexesForEvent,
  getPuzzleSetSourceId,
  isAwcPuzzleEvent,
} from "../../lib/puzzles/puzzleSets";
import {
  fetchPuzzleAttemptsForPuzzle,
  fetchPuzzleProgressRowsForUsername,
  type PuzzleProgressWithUsernameRow,
  recordPuzzleProgress,
} from "../../lib/supabase/puzzleProgress";
import type { PuzzleRatingEvent } from "../../lib/supabase/puzzleUserRatings";
import type { AsyncActionStatus } from "../../types/async";
import type {
  AttemptResolved,
  ChessboardState,
  PlaybackCommand,
  SolutionNavigation,
} from "../../types/chessboard";
import { orientationFromFen } from "../../utils/chessNotation";
import { getErrorMessage } from "../../utils/errors";
import { formatElapsedDuration, formatSignedDecimal } from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";
import { BlindPuzzlePanel } from "./BlindPuzzlePanel";
import { PuzzleAnalysisPanel } from "./PuzzleAnalysisPanel";
import { PuzzleInfoSection, type PuzzleInfoTab } from "./PuzzleInfoSection";
import { PuzzleIssueDialog, type PuzzleIssueStatus } from "./PuzzleIssueDialog";
import { PuzzlePositionRows } from "./PuzzlePositionRows";
import {
  addValueToSet,
  buildCompletionFeedback,
  type CompletionFeedback,
  createInitialBoardSnapshot,
  createInitialBoardState,
  createInitialPuzzleSession,
  excludePuzzleIntroTime,
  getPuzzleAttemptStartedAt,
  puzzleIndexFromParam,
  puzzleSessionReducer,
  removeValueFromSet,
  shuffleIndexes,
  toPuzzleKey,
} from "./puzzleSolverState";
import { usePuzzleCatalog } from "./usePuzzleCatalog";

const ATTEMPTED_PUZZLE_BADGE_LABEL = "You've already attempted this puzzle before";
const SOLVED_BEFORE_BADGE_LABEL = "You've solved this puzzle before";
const OPA_STYLE_BADGE_LABEL =
  "Only the best moves are accepted. Weaker alternatives are rejected even if they also lead to mate.";
const OTHER_PUZZLE_ATTEMPTS_LIMIT = 30;
const PUZZLE_PREFETCH_COUNT = 3;
const MAX_PUZZLE_ATTEMPT_DURATION_MS = 60 * 60 * 1000;
const PUZZLE_EXPLANATION_LEGACY_AUTHOR = "admin";
const PUZZLE_EXPLANATION_LEGACY_EDITOR = "seaside_tiramisu";

// Keep in sync with the stacked layout in PuzzleSolver.css.
const PUZZLE_STACKED_LAYOUT_QUERY =
  "(max-width: 460px), (max-width: 600px) and (min-height: calc(min(100vw - 16px, 548px) + 184px))";

const SOLUTION_UNLOCK_HINT = "Make at least one attempt before viewing the solution.";
const SERVER_CUSTOM_SET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PuzzleElapsedTimer = ({
  elapsedTimeMs,
  running,
  readElapsedTimeMs,
}: {
  elapsedTimeMs: number;
  running: boolean;
  readElapsedTimeMs: () => number;
}) => {
  const [displayedElapsedTimeMs, setDisplayedElapsedTimeMs] = useState(elapsedTimeMs);

  useEffect(() => {
    setDisplayedElapsedTimeMs(elapsedTimeMs);
    if (!running) return undefined;

    const updateDisplayedTime = (): void => {
      setDisplayedElapsedTimeMs(readElapsedTimeMs());
    };
    const interval = window.setInterval(updateDisplayedTime, 250);

    return () => window.clearInterval(interval);
  }, [elapsedTimeMs, readElapsedTimeMs, running]);

  const formattedElapsedTime = formatElapsedDuration(displayedElapsedTimeMs);

  return (
    <div className="puzzleElapsedTimer desktop" aria-label={`Elapsed time ${formattedElapsedTime}`}>
      <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
      <span>{formattedElapsedTime}</span>
    </div>
  );
};

const loadTestPuzzlesById = (puzzleIds: Array<number | string>) => loadPuzzlesById(puzzleIds, true);

export const PuzzleTestPage = () => {
  const { isLoading, user } = useAuth();
  if (isLoading) return <RouteLoadingFallback />;
  if (normalizeUsername(user?.username) !== PUZZLE_ADMIN_USERNAME) {
    return (
      <div className="page">
        <Seo title="Puzzle test" path="/admin/puzzle-test" robots="noindex,nofollow" />
        <section className="panel">
          <h1>Puzzle test</h1>
          <p>This page is restricted.</p>
        </section>
      </div>
    );
  }
  return <PuzzleSolverPage testMode />;
};

export const PuzzleSolverPage = ({ testMode = false }: { testMode?: boolean }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    puzzleId: routePuzzleId = "",
    setKey: routeSetKey = "",
    setId: routeCustomSetId = "",
    dashboardSetId: routeDashboardSetId = "",
  } = useParams({ strict: false });
  const { isLoading: isAuthLoading, login, user } = useAuth();
  const normalizedUsername = normalizeUsername(user?.username);
  const userPuzzleRatingQuery = useQuery({
    ...puzzleUserRatingQueryOptions(normalizedUsername),
    enabled: Boolean(normalizedUsername),
  });
  const { showPuzzleTimer, blindPuzzles } = useAppSettings();
  const loadDetails = testMode ? loadTestPuzzlesById : loadPuzzlesById;
  const { puzzles, setPuzzles, loadingError, setLoadingError, mergeLoadedPuzzles } =
    usePuzzleCatalog(routePuzzleId, routeSetKey || routeDashboardSetId, loadDetails);
  const [attemptedPuzzleIds, setAttemptedPuzzleIds] = useState<Set<string>>(() => new Set());
  const [solvedPuzzleIds, setSolvedPuzzleIds] = useState<Set<string>>(() => new Set());
  const [unratedPuzzleIds, setUnratedPuzzleIds] = useState<Set<string>>(() => new Set());
  const [dailyAttemptCount, setDailyAttemptCount] = useState(0);
  const [attemptedPuzzleIdsOwner, setAttemptedPuzzleIdsOwner] = useState<string | null>(null);
  const [resolvedAttemptedPuzzleIds, setResolvedAttemptedPuzzleIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [blindEntry, setBlindEntry] = useState<{
    key: string;
    eligible: boolean;
    resolved: boolean;
  } | null>(null);
  const [{ history, historyIndex }, setPuzzleHistory] = useState<{
    history: number[];
    historyIndex: number;
  }>({ history: [], historyIndex: -1 });
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [mobileFeedback, setMobileFeedback] = useState<{
    type: string;
    icon: string;
    title: string;
    id: number;
    fading: boolean;
  } | null>(null);
  const [activePuzzleInfoTab, setActivePuzzleInfoTab] = useState<PuzzleInfoTab | null>(null);
  const [solutionNavigation, setSolutionNavigation] = useState<SolutionNavigation | null>(null);
  const [analysisPreviewMove, setAnalysisPreviewMove] = useState<string | null>(null);
  const [analysisEngineMoves, setAnalysisEngineMoves] = useState<readonly string[] | null>(null);
  const [puzzleSession, dispatchPuzzleSession] = useReducer(
    puzzleSessionReducer,
    undefined,
    createInitialPuzzleSession,
  );
  const puzzleSessionRef = useRef(puzzleSession);
  puzzleSessionRef.current = puzzleSession;
  const [attemptRatingFeedback, setAttemptRatingFeedback] = useState<PuzzleRatingEvent | null>(
    null,
  );
  const [feedbackBadgeId, setFeedbackBadgeId] = useState(0);
  const [explanationEditorOpen, setExplanationEditorOpen] = useState(false);
  const [explanationDraft, setExplanationDraft] = useState("");
  const [explanationSaveStatus, setExplanationSaveStatus] = useState<AsyncActionStatus>({
    state: "idle",
  });
  const [pinnedSolutionLineIndex, setPinnedSolutionLineIndex] = useState<number | null>(null);
  const [otherPuzzleAttemptsStatus, setOtherPuzzleAttemptsStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [otherPuzzleAttempts, setOtherPuzzleAttempts] = useState<PuzzleProgressWithUsernameRow[]>(
    [],
  );
  const [ratingEditorOpen, setRatingEditorOpen] = useState(false);
  const [ratingDraftLevel, setRatingDraftLevel] = useState<PuzzleLevel>(1);
  const [ratingSaveStatus, setRatingSaveStatus] = useState<AsyncActionStatus>({ state: "idle" });
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [reportIssueCategory, setReportIssueCategory] = useState<PuzzleIssueCategory>(
    "missing_alternate_solution",
  );
  const [reportIssueDetails, setReportIssueDetails] = useState("");
  const [reportIssueStatus, setReportIssueStatus] = useState<PuzzleIssueStatus>({ state: "idle" });
  const [boardState, setBoardState] = useState(createInitialBoardState);
  const previousBoardSnapshotRef = useRef<ReturnType<typeof createInitialBoardSnapshot>>(
    createInitialBoardSnapshot(),
  );
  const mobileFeedbackIdRef = useRef(0);
  const boardPanelRef = useRef<HTMLDivElement | null>(null);
  const reportIssueDialogRef = useRef<HTMLDialogElement | null>(null);
  const upcomingPuzzleIndexesRef = useRef<number[]>([]);
  const visitedPuzzleIdsRef = useRef<Set<string>>(new Set());
  const loadingPuzzleIdsRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);
  const progressWriteQueueRef = useRef(Promise.resolve());
  const attemptedPuzzleIdsRef = useRef<Set<string>>(new Set());
  const unratedPuzzleIdsRef = useRef<Set<string>>(new Set());
  const countedTodayPuzzleIdsRef = useRef<Set<string>>(new Set());
  const activePuzzleKeyRef = useRef("");
  const elapsedTimeMsRef = useRef(0);
  const elapsedTimerStartedAtRef = useRef<number | null>(null);
  const elapsedTimerExpiredRef = useRef(false);
  const [finishedIntroKey, setFinishedIntroKey] = useState("");
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
  const playerNicknamesQuery = useQuery(puzzlePlayerNicknamesQueryOptions());
  const customPuzzleSet = customPuzzleSetQuery.data;
  const customSetPuzzleIds = customPuzzleSet?.puzzleIds;
  useEffect(() => {
    if (!customSetPuzzleIds?.length || !puzzles.length) return;
    setPuzzles((current) => {
      const knownIds = new Set(current.map((puzzle) => puzzle.puzzleId));
      const missing = customSetPuzzleIds.filter((id) => !knownIds.has(id));
      // The saved set can be newer than the cached public puzzle index.
      return missing.length
        ? [
            ...current,
            ...missing.map((id) => ({
              id,
              puzzleId: id,
              fen: "",
              solution: "",
              explanation: "",
              tags: [],
            })),
          ]
        : current;
    });
  }, [customSetPuzzleIds, puzzles.length, setPuzzles]);
  const isCustomSetRoute = Boolean(routeCustomSetId);
  const dashboardPuzzleSet = useMemo(
    () => readDashboardPuzzleSet(routeDashboardSetId),
    [routeDashboardSetId],
  );
  const attemptedPuzzleIdsUsername = testMode ? "" : normalizedUsername;
  const attemptedPuzzleIdsReady =
    !isAuthLoading &&
    (!attemptedPuzzleIdsUsername || attemptedPuzzleIdsOwner === attemptedPuzzleIdsUsername);
  const orderedSetPuzzleIndexes = useMemo(
    () =>
      dashboardPuzzleSet
        ? getOrderedPuzzleIndexesForDashboardSet(puzzles, dashboardPuzzleSet)
        : customPuzzleSet
          ? getOrderedPuzzleIndexesForCustomSet(puzzles, customPuzzleSet)
          : getOrderedPuzzleIndexesForEvent(puzzles, routeSetKey),
    [customPuzzleSet, dashboardPuzzleSet, puzzles, routeSetKey],
  );
  const isCustomSetSolveMode = Boolean(routeCustomSetId && customPuzzleSet);
  const isDashboardSetSolveMode = Boolean(routeDashboardSetId && dashboardPuzzleSet);
  const isSetSolveMode = Boolean(
    orderedSetPuzzleIndexes.length > 0 &&
    (routeSetKey || isCustomSetSolveMode || isDashboardSetSolveMode),
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
              !visitedPuzzleIdsRef.current.has(String(puzzles[index]?.puzzleId ?? "")) &&
              !attemptedPuzzleIds.has(String(puzzles[index]?.puzzleId ?? "")) &&
              !unratedPuzzleIds.has(String(puzzles[index]?.puzzleId ?? "")),
          );
        upcomingPuzzleIndexesRef.current = shuffleIndexes(candidateIndexes);
      }

      return upcomingPuzzleIndexesRef.current.length;
    },
    [attemptedPuzzleIds, puzzles, unratedPuzzleIds],
  );

  const getNextShuffledPuzzleIndex = useCallback(
    (currentIndex: number): number => {
      if (!attemptedPuzzleIdsReady) return -1;
      if (puzzles.length === 0) return -1;

      ensureUpcomingPuzzleIndexes(currentIndex);
      return upcomingPuzzleIndexesRef.current.at(-1) ?? -1;
    },
    [attemptedPuzzleIdsReady, ensureUpcomingPuzzleIndexes, puzzles.length],
  );

  const replaceUrlWithPuzzle = useCallback(
    (puzzleId: string | number): void => {
      if (testMode) {
        void navigate({
          to: "/admin/puzzle-test/{-$puzzleId}",
          params: { puzzleId: String(puzzleId) },
          replace: true,
        });
      } else if (isDashboardSetSolveMode) {
        void navigate({
          to: "/solve/dashboard/$dashboardSetId/$puzzleId",
          params: { dashboardSetId: routeDashboardSetId, puzzleId: String(puzzleId) },
          replace: true,
        });
      } else if (isCustomSetSolveMode) {
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
    [
      isCustomSetSolveMode,
      isDashboardSetSolveMode,
      isSetSolveMode,
      navigate,
      routeCustomSetId,
      routeDashboardSetId,
      routeSetKey,
      testMode,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(PUZZLE_STACKED_LAYOUT_QUERY);
    const updateLayout = () => setIsMobileLayout(mediaQuery.matches);
    updateLayout();

    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (isAuthLoading || testMode) return undefined;

    let isCurrent = true;
    const username = attemptedPuzzleIdsUsername;

    if (!username) {
      setAttemptedPuzzleIds(new Set());
      setSolvedPuzzleIds(new Set());
      setUnratedPuzzleIds(new Set());
      setDailyAttemptCount(0);
      countedTodayPuzzleIdsRef.current = new Set();
      setAttemptedPuzzleIdsOwner("");
      return undefined;
    }

    setAttemptedPuzzleIds(new Set());
    setSolvedPuzzleIds(new Set());
    setUnratedPuzzleIds(new Set());
    setDailyAttemptCount(0);
    countedTodayPuzzleIdsRef.current = new Set();
    setAttemptedPuzzleIdsOwner(null);

    const loadAttemptedPuzzleIds = async () => {
      try {
        const progressRows = await fetchPuzzleProgressRowsForUsername(username);
        if (isCurrent) {
          const todayRows = progressRows.filter((row) => isTimestampInUtcDay(row.first_attempt_at));
          setAttemptedPuzzleIds(
            new Set(
              progressRows.filter((row) => row.rated !== false).map((row) => String(row.puzzle_id)),
            ),
          );
          setSolvedPuzzleIds(
            new Set(
              progressRows.filter((row) => row.puzzle_correct).map((row) => String(row.puzzle_id)),
            ),
          );
          setUnratedPuzzleIds(
            new Set(
              progressRows.filter((row) => row.rated === false).map((row) => String(row.puzzle_id)),
            ),
          );
          countedTodayPuzzleIdsRef.current = new Set(todayRows.map((row) => String(row.puzzle_id)));
          setDailyAttemptCount(todayRows.length);
          setAttemptedPuzzleIdsOwner(username);
        }
      } catch (error) {
        if (!isCurrent) return;
        setAttemptedPuzzleIds(new Set());
        setSolvedPuzzleIds(new Set());
        setUnratedPuzzleIds(new Set());
        countedTodayPuzzleIdsRef.current = new Set();
        setDailyAttemptCount(0);
        setAttemptedPuzzleIdsOwner(username);
        globalThis.console?.error(error);
      }
    };

    void loadAttemptedPuzzleIds();

    return () => {
      isCurrent = false;
    };
  }, [attemptedPuzzleIdsUsername, isAuthLoading, testMode]);

  useEffect(() => {
    attemptedPuzzleIdsRef.current = attemptedPuzzleIds;
  }, [attemptedPuzzleIds]);

  useEffect(() => {
    unratedPuzzleIdsRef.current = unratedPuzzleIds;
  }, [unratedPuzzleIds]);

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

  const routePuzzleIndex = useMemo(
    () => puzzleIndexFromParam(puzzles, routePuzzleId),
    [puzzles, routePuzzleId],
  );
  const historyPuzzleIndex = history[historyIndex] ?? -1;
  // The URL selects the board. Record history in the same render so a pending
  // URL change cannot briefly switch the board and then send it back again.
  if (routePuzzleIndex >= 0 && routePuzzleIndex !== historyPuzzleIndex) {
    const existingIndex = history.indexOf(routePuzzleIndex);
    setPuzzleHistory(
      existingIndex >= 0
        ? { history, historyIndex: existingIndex }
        : {
            history: [...history.slice(0, historyIndex + 1), routePuzzleIndex],
            historyIndex: historyIndex + 1,
          },
    );
  }

  const testPuzzleUnavailable =
    testMode && Boolean(routePuzzleId) && puzzles.length > 0 && routePuzzleIndex < 0;

  useEffect(() => {
    if (historyIndex >= 0 || routePuzzleIndex >= 0 || testPuzzleUnavailable) return;

    const initialIndex = getNextShuffledPuzzleIndex(-1);
    const puzzleId = puzzles[initialIndex]?.puzzleId;
    if (puzzleId === undefined) return;

    setPuzzleHistory({ history: [initialIndex], historyIndex: 0 });
    replaceUrlWithPuzzle(puzzleId);
  }, [
    getNextShuffledPuzzleIndex,
    historyIndex,
    puzzles,
    replaceUrlWithPuzzle,
    routePuzzleIndex,
    testPuzzleUnavailable,
  ]);

  const activePuzzleIndex = routePuzzleIndex >= 0 ? routePuzzleIndex : historyPuzzleIndex;
  const activePuzzle = activePuzzleIndex >= 0 ? (puzzles[activePuzzleIndex] ?? null) : null;
  const activePuzzleId = activePuzzle?.puzzleId;
  const activePuzzleKey = toPuzzleKey(activePuzzleId);
  const activePuzzleSetMetadata = useMemo(
    () => (activePuzzle ? puzzleSetMetadataFromRow(activePuzzle, routeSetKey) : null),
    [activePuzzle, routeSetKey],
  );
  const fen = activePuzzle?.fen ?? "";
  const author = String(activePuzzle?.["author"] ?? "").trim() || "Unknown";
  const authorDashboardUsername = author === "Unknown" ? "" : normalizeUsername(author);
  const event = String(activePuzzle?.["event"] ?? "").trim();
  const explanation = activePuzzle?.explanation ?? "";
  const opaStyle = activePuzzle?.opa_style === true;
  const activePuzzleTags = useMemo(
    () => normalizePuzzleMotifTags(activePuzzle?.tags),
    [activePuzzle?.tags],
  );
  const canManagePuzzleRating = !testMode && normalizedUsername === PUZZLE_ADMIN_USERNAME;
  const activePuzzleRating = useMemo(() => puzzleRatingFromRow(activePuzzle), [activePuzzle]);
  const normalizedAuthor = normalizeUsername(activePuzzle?.author);
  const isPuzzleExplanationEditor =
    !testMode &&
    Boolean(normalizedUsername) &&
    (normalizedUsername === normalizedAuthor ||
      (normalizedUsername === PUZZLE_EXPLANATION_LEGACY_EDITOR &&
        normalizedAuthor === PUZZLE_EXPLANATION_LEGACY_AUTHOR));
  const hasExplanation = explanation.trim().length > 0;
  const orientation = orientationFromFen(fen);
  const currentFen = boardState.fen || fen;
  const activeSetPuzzlePosition = isSetSolveMode
    ? orderedSetPuzzleIndexes.indexOf(activePuzzleIndex)
    : -1;
  const puzzleCount = isSetSolveMode ? orderedSetPuzzleIndexes.length : puzzles.length;
  const dailyLimitReached = dailyAttemptCount >= DAILY_PUZZLE_ATTEMPT_LIMIT;
  const canGoToPreviousPuzzle = isSetSolveMode ? activeSetPuzzlePosition > 0 : historyIndex > 0;
  const nextSetPuzzleIndex = isSetSolveMode
    ? orderedSetPuzzleIndexes[activeSetPuzzlePosition + 1]
    : undefined;
  const nextSetPuzzleKey =
    nextSetPuzzleIndex === undefined ? "" : String(puzzles[nextSetPuzzleIndex]?.puzzleId ?? "");
  const nextSetPuzzleWasAttempted = Boolean(
    nextSetPuzzleKey &&
    (attemptedPuzzleIds.has(nextSetPuzzleKey) || unratedPuzzleIds.has(nextSetPuzzleKey)),
  );
  const nextHistoryPuzzleIndex =
    historyIndex >= 0 && historyIndex < history.length - 1 ? history[historyIndex + 1] : undefined;
  const nextHistoryPuzzleKey =
    nextHistoryPuzzleIndex === undefined
      ? ""
      : String(puzzles[nextHistoryPuzzleIndex]?.puzzleId ?? "");
  const nextHistoryPuzzleWasAttempted = Boolean(
    nextHistoryPuzzleKey &&
    (attemptedPuzzleIds.has(nextHistoryPuzzleKey) ||
      unratedPuzzleIds.has(nextHistoryPuzzleKey) ||
      countedTodayPuzzleIdsRef.current.has(nextHistoryPuzzleKey)),
  );
  const canGoToNextPuzzle = isSetSolveMode
    ? activeSetPuzzlePosition >= 0 &&
      activeSetPuzzlePosition < orderedSetPuzzleIndexes.length - 1 &&
      (!dailyLimitReached || nextSetPuzzleWasAttempted)
    : puzzles.length > 0 &&
      (!dailyLimitReached ||
        (nextHistoryPuzzleIndex !== undefined && nextHistoryPuzzleWasAttempted));
  const hasCompletedPuzzleSet = isSetSolveMode && !canGoToNextPuzzle && boardState.solved;

  useEffect(() => {
    if (!dailyLimitReached) return undefined;
    const resetAt = Date.parse(utcDayBounds().end);
    const timeout = window.setTimeout(
      () => {
        countedTodayPuzzleIdsRef.current = new Set();
        setDailyAttemptCount(0);
      },
      Math.max(0, resetAt - Date.now()) + 50,
    );
    return () => window.clearTimeout(timeout);
  }, [dailyLimitReached]);
  const showPuzzleSetMetadata = Boolean(
    !isCustomSetSolveMode && !isDashboardSetSolveMode && activePuzzleSetMetadata?.eventName,
  );
  const puzzleSetDate =
    activePuzzleSetMetadata && !isAwcPuzzleEvent(activePuzzleSetMetadata.eventName)
      ? formatPuzzleSetDate(activePuzzleSetMetadata.eventDate)
      : "";
  const hasMultiplePlayers = (activePuzzle?.players ?? []).some(
    (player) => player.trim().toLocaleLowerCase() === "multiple",
  );
  const whitePlayer = hasMultiplePlayers ? "" : (activePuzzleSetMetadata?.whitePlayer ?? "");
  const blackPlayer = hasMultiplePlayers ? "" : (activePuzzleSetMetadata?.blackPlayer ?? "");
  const playerNicknames = useMemo(
    () =>
      new Map(
        (playerNicknamesQuery.data ?? []).map((row) => [
          normalizeUsername(row.username),
          row.nickname.trim(),
        ]),
      ),
    [playerNicknamesQuery.data],
  );
  const authorLabel = playerNicknames.get(authorDashboardUsername) || author;
  const whitePlayerLabel = playerNicknames.get(normalizeUsername(whitePlayer)) || whitePlayer;
  const blackPlayerLabel = playerNicknames.get(normalizeUsername(blackPlayer)) || blackPlayer;
  const hasKnownPlayers = Boolean(whitePlayer && blackPlayer);
  const puzzleSetParticipants =
    hasKnownPlayers || hasMultiplePlayers ? [] : (activePuzzleSetMetadata?.players ?? []);
  const puzzleSetParticipantsLabel =
    puzzleSetParticipants.length === 2
      ? `${puzzleSetParticipants[0]} vs ${puzzleSetParticipants[1]}`
      : puzzleSetParticipants.join(" · ");
  const isAnalysisMode = puzzleSession.mode === "analysis";
  const hasPersistedAttempt = activePuzzleKey ? attemptedPuzzleIds.has(activePuzzleKey) : false;
  const hasSolvedPuzzle = activePuzzleKey ? solvedPuzzleIds.has(activePuzzleKey) : false;
  const hasUnratedAttempt = activePuzzleKey ? unratedPuzzleIds.has(activePuzzleKey) : false;
  const unratedReason = testMode
    ? null
    : getPuzzleUnratedReason({
        username: normalizedUsername,
        author,
        createdAt: activePuzzle?.created_at,
        hasUnratedAttempt,
      });
  const blindEntryKey = JSON.stringify([
    attemptedPuzzleIdsUsername,
    routeSetKey,
    routeCustomSetId,
    routeDashboardSetId,
    activePuzzleKey,
  ]);
  const blindEntryReady = attemptedPuzzleIdsReady && blindEntry?.key === blindEntryKey;
  const blindPlies = blindPuzzles?.enabled ? blindPuzzles.plies : 0;
  useLayoutEffect(() => {
    if (!blindPlies) {
      setBlindEntry(null);
      return;
    }
    if (!activePuzzleKey || !attemptedPuzzleIdsReady) return;
    // Decide once the puzzle details are loaded; a first attempt must not rewind mid-visit.
    setBlindEntry((entry) => {
      if (entry?.key === blindEntryKey) return entry;
      if (!fen) return null;
      return {
        key: blindEntryKey,
        eligible:
          testMode ||
          unratedReason !== null ||
          hasPersistedAttempt ||
          hasSolvedPuzzle ||
          countedTodayPuzzleIdsRef.current.has(activePuzzleKey),
        resolved: false,
      };
    });
  }, [
    activePuzzleKey,
    attemptedPuzzleIdsReady,
    blindEntryKey,
    blindPlies,
    fen,
    hasPersistedAttempt,
    hasSolvedPuzzle,
    testMode,
    unratedReason,
  ]);
  const leadIn = activePuzzle?.leadIn;
  const blindLeadIn = useMemo(
    () =>
      leadIn && blindPlies && blindEntryReady && blindEntry?.eligible && !dailyLimitReached
        ? rewindPuzzleLeadIn(leadIn, blindPlies)
        : null,
    [blindPlies, dailyLimitReached, leadIn, blindEntry?.eligible, blindEntryReady],
  );
  const blindMode = Boolean(blindLeadIn);
  const blindPosition = !isAnalysisMode ? blindLeadIn : null;
  const autoplayIntro = Boolean(
    activePuzzle?.intro &&
    !blindMode &&
    !dailyLimitReached &&
    (!hasSolvedPuzzle || isCustomSetRoute || isDashboardSetSolveMode),
  );
  const introPending = autoplayIntro && finishedIntroKey !== activePuzzleKey;
  const handleIntroEnd = useCallback(
    (durationMs: number, completed: boolean) => {
      if (!testMode && !hasSolvedPuzzle) excludePuzzleIntroTime(activePuzzleKey, durationMs);
      if (completed) setFinishedIntroKey(activePuzzleKey);
    },
    [activePuzzleKey, hasSolvedPuzzle, testMode],
  );
  const shouldShowPuzzleTimer = showPuzzleTimer && attemptedPuzzleIdsReady && !hasSolvedPuzzle;
  const unratedLabel =
    unratedReason === "existing-unrated"
      ? "Your latest attempt is unrated. Wait one month after that attempt for a rated try."
      : "Your attempts are unrated for one month after this puzzle was published.";
  const hasResolvedAttempt = activePuzzleKey
    ? resolvedAttemptedPuzzleIds.has(activePuzzleKey)
    : false;
  // A custom or dashboard set is a fresh solving pass. A historical attempt may still be
  // acknowledged by the badge, but it must not reveal post-attempt UI before
  // the solver finishes this pass through the puzzle.
  const hasAttemptedActivePuzzle = blindMode
    ? Boolean(blindEntry?.resolved)
    : hasResolvedAttempt || (!isCustomSetRoute && !isDashboardSetSolveMode && hasPersistedAttempt);
  const boardShowsSolution = isAnalysisMode && puzzleSession.solutionRevealed;
  const canViewPostAttemptDetails = testMode
    ? puzzleSession.attempt === "solved" || boardShowsSolution
    : hasAttemptedActivePuzzle;
  const sourceMatchId = activePuzzle
    ? getPuzzleSetSourceId(activePuzzle, Number.parseInt(routeSetKey, 10))
    : "";
  const canLinkSourceMatch = Boolean(
    hasAttemptedActivePuzzle && !routeSetKey && !routeCustomSetId && sourceMatchId,
  );
  const attemptedPuzzleBadgeLabel =
    isCustomSetRoute || isDashboardSetSolveMode
      ? SOLVED_BEFORE_BADGE_LABEL
      : ATTEMPTED_PUZZLE_BADGE_LABEL;
  // A creator's unrated solve still unlocks editing in analysis, including on revisit.
  const canManagePuzzleExplanation =
    isPuzzleExplanationEditor &&
    isAnalysisMode &&
    (hasAttemptedActivePuzzle || (hasUnratedAttempt && puzzleSession.attempt === "solved"));
  const canViewExplanation =
    canManagePuzzleExplanation ||
    ((hasExplanation || isPuzzleExplanationEditor) &&
      (canViewPostAttemptDetails || (!testMode && puzzleSession.attempt === "wrong")));
  const showSolution = activePuzzleInfoTab === "solution";
  const showExplanation = activePuzzleInfoTab === "explanation";
  const otherPuzzleAttemptsOpen = activePuzzleInfoTab === "attempts";

  useEffect(() => {
    setRatingEditorOpen(false);
    setRatingSaveStatus({ state: "idle" });
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

  useLayoutEffect(() => {
    activePuzzleKeyRef.current = activePuzzleKey;
    if (activePuzzleKey) visitedPuzzleIdsRef.current.add(activePuzzleKey);
    if (activePuzzleIndex < 0) return;

    const upcoming = upcomingPuzzleIndexesRef.current;
    if (upcoming.at(-1) === activePuzzleIndex) {
      upcoming.pop();
    } else {
      const index = upcoming.indexOf(activePuzzleIndex);
      if (index >= 0) upcoming.splice(index, 1);
    }
  }, [activePuzzleIndex, activePuzzleKey]);

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

    const missingIds = [...new Set([activePuzzleIndex, ...candidateIndexes])].flatMap((index) => {
      const puzzle = puzzles[index];
      if (!puzzle || puzzle.fen) return [];
      const key = String(puzzle.puzzleId);
      if (loadingPuzzleIdsRef.current.has(key)) return [];
      if (dailyLimitReached && !attemptedPuzzleIds.has(key) && !unratedPuzzleIds.has(key)) {
        return [];
      }
      return [puzzle.puzzleId];
    });
    if (missingIds.length === 0) return undefined;

    missingIds.forEach((puzzleId) => loadingPuzzleIdsRef.current.add(String(puzzleId)));
    void loadDetails(missingIds)
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
          setLoadingError(getErrorMessage(error, "Failed to load puzzle data"));
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
    attemptedPuzzleIds,
    dailyLimitReached,
    ensureUpcomingPuzzleIndexes,
    isSetSolveMode,
    loadDetails,
    mergeLoadedPuzzles,
    orderedSetPuzzleIndexes,
    puzzles,
    setLoadingError,
    unratedPuzzleIds,
  ]);

  const enqueuePuzzleProgressWrite = useCallback(
    ({
      puzzleId,
      puzzleCorrect,
      incorrectMove,
      correctMove,
      attemptDurationMs,
    }: {
      puzzleId: string | number | null | undefined;
      puzzleCorrect: boolean;
      incorrectMove: string | null;
      correctMove: string | null;
      attemptDurationMs: number | null;
    }): void => {
      const normalizedPuzzleId = toPuzzleKey(puzzleId);
      if (!normalizedPuzzleId || !user?.username) return;
      if (attemptedPuzzleIdsRef.current.has(normalizedPuzzleId)) return;
      const isFirstRecordedAttempt =
        !unratedPuzzleIdsRef.current.has(normalizedPuzzleId) &&
        !countedTodayPuzzleIdsRef.current.has(normalizedPuzzleId);
      if (isFirstRecordedAttempt) {
        countedTodayPuzzleIdsRef.current.add(normalizedPuzzleId);
        setDailyAttemptCount((current) => Math.min(DAILY_PUZZLE_ATTEMPT_LIMIT, current + 1));
      }

      progressWriteQueueRef.current = progressWriteQueueRef.current
        .catch(() => {})
        .then(() =>
          recordPuzzleProgress({
            username: user.username,
            puzzleId: normalizedPuzzleId,
            puzzleCorrect,
            attemptDurationMs,
            incorrectMove,
            correctMove,
          }).then((result) => {
            if (result?.rated) {
              setAttemptedPuzzleIds((current) => addValueToSet(current, normalizedPuzzleId));
              setUnratedPuzzleIds((current) => removeValueFromSet(current, normalizedPuzzleId));
            } else if (result) {
              setUnratedPuzzleIds((current) => addValueToSet(current, normalizedPuzzleId));
            }
            void queryClient.invalidateQueries({ queryKey: puzzleQueryKeys.progress });
            void queryClient.invalidateQueries({ queryKey: puzzleQueryKeys.userRating });
            void queryClient.invalidateQueries({ queryKey: puzzleQueryKeys.ratingEvents });
            const ratingEvent = result?.ratingEvent ?? null;
            if (!ratingEvent || activePuzzleKeyRef.current !== normalizedPuzzleId) return;
            setAttemptRatingFeedback(ratingEvent);
            setFeedbackBadgeId((current) => current + 1);
            setMobileFeedback((current) => {
              if (!current) return current;
              mobileFeedbackIdRef.current += 1;
              return { ...current, id: mobileFeedbackIdRef.current, fading: false };
            });
          }),
        )
        .catch((error) => {
          if (error instanceof ApiError && error.code === "daily_puzzle_attempt_limit") {
            setDailyAttemptCount(DAILY_PUZZLE_ATTEMPT_LIMIT);
          } else if (isFirstRecordedAttempt) {
            countedTodayPuzzleIdsRef.current.delete(normalizedPuzzleId);
            setDailyAttemptCount((current) => Math.max(0, current - 1));
          }
          globalThis.console?.error(error);
        });
    },
    [queryClient, user?.username],
  );

  const handleAttemptResolved = useCallback(
    ({ puzzleId, puzzleCorrect, incorrectMove, correctMove }: AttemptResolved): void => {
      const elapsedAtAttempt = Math.max(
        0,
        elapsedTimerStartedAtRef.current === null
          ? elapsedTimeMsRef.current
          : window.performance.now() - elapsedTimerStartedAtRef.current,
      );
      const attemptDurationMs =
        elapsedTimerExpiredRef.current || elapsedAtAttempt >= MAX_PUZZLE_ATTEMPT_DURATION_MS
          ? null
          : Math.round(elapsedAtAttempt);
      elapsedTimeMsRef.current = Math.min(elapsedAtAttempt, MAX_PUZZLE_ATTEMPT_DURATION_MS);
      elapsedTimerExpiredRef.current = attemptDurationMs === null;
      elapsedTimerStartedAtRef.current = null;
      setElapsedTimeMs(elapsedTimeMsRef.current);
      setElapsedTimerRunning(false);
      const normalizedPuzzleId = toPuzzleKey(puzzleId);
      dispatchPuzzleSession({ type: "attempt-resolved", correct: puzzleCorrect });
      setBlindEntry((entry) =>
        entry?.key === blindEntryKey ? { ...entry, resolved: true } : entry,
      );
      setResolvedAttemptedPuzzleIds((current) => addValueToSet(current, normalizedPuzzleId));
      if (puzzleCorrect) {
        setSolvedPuzzleIds((current) => addValueToSet(current, normalizedPuzzleId));
      }

      // Test attempts drive the same board and analysis states, but never reach either write path.
      if (testMode) return;

      enqueuePuzzleProgressWrite({
        puzzleId: normalizedPuzzleId,
        puzzleCorrect,
        attemptDurationMs,
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
    [enqueuePuzzleProgressWrite, queryClient, blindEntryKey, routeCustomSetId, testMode],
  );

  const resetPuzzleUiState = useCallback(() => {
    setActivePuzzleInfoTab(null);
    setSolutionNavigation(null);
    setAnalysisPreviewMove(null);
    setAnalysisEngineMoves(null);
    dispatchPuzzleSession({ type: "reset" });
    setAttemptRatingFeedback(null);
    setFeedbackBadgeId(0);
    setPinnedSolutionLineIndex(null);
    setCustomSetRefreshState({ status: "idle" });
  }, []);

  useLayoutEffect(() => {
    resetPuzzleUiState();
    setFinishedIntroKey("");
    setBoardState(createInitialBoardState());
    setMobileFeedback(null);
    setOtherPuzzleAttemptsStatus("idle");
    setOtherPuzzleAttempts([]);
    previousBoardSnapshotRef.current = createInitialBoardSnapshot();
  }, [activePuzzleKey, blindMode, fen, resetPuzzleUiState]);

  useLayoutEffect(() => {
    if (!activePuzzleKey || !attemptedPuzzleIdsReady || hasResolvedAttempt) return;
    if (blindMode || isCustomSetRoute || isDashboardSetSolveMode) return;

    dispatchPuzzleSession({
      type: "hydrate",
      attempt: hasSolvedPuzzle ? "solved" : hasPersistedAttempt ? "wrong" : "unresolved",
    });
  }, [
    activePuzzleKey,
    attemptedPuzzleIdsReady,
    blindMode,
    hasPersistedAttempt,
    hasResolvedAttempt,
    hasSolvedPuzzle,
    isCustomSetRoute,
    isDashboardSetSolveMode,
  ]);

  useLayoutEffect(() => {
    const shouldStartTimer = Boolean(
      activePuzzleKey && fen && attemptedPuzzleIdsReady && !hasSolvedPuzzle && !introPending,
    );
    const elapsedBeforePageLoad =
      shouldStartTimer && !testMode
        ? Math.max(0, Date.now() - getPuzzleAttemptStartedAt(activePuzzleKey))
        : 0;
    const initialElapsedTime = Math.min(elapsedBeforePageLoad, MAX_PUZZLE_ATTEMPT_DURATION_MS);
    const timerExpired = elapsedBeforePageLoad >= MAX_PUZZLE_ATTEMPT_DURATION_MS;

    elapsedTimeMsRef.current = initialElapsedTime;
    elapsedTimerExpiredRef.current = timerExpired;
    elapsedTimerStartedAtRef.current =
      shouldStartTimer && !timerExpired ? window.performance.now() - initialElapsedTime : null;
    setElapsedTimeMs(initialElapsedTime);
    setElapsedTimerRunning(shouldStartTimer && !timerExpired);
  }, [activePuzzleKey, attemptedPuzzleIdsReady, fen, hasSolvedPuzzle, introPending, testMode]);

  useEffect(() => {
    if (!elapsedTimerRunning || elapsedTimerStartedAtRef.current === null) return undefined;
    const remainingTime = Math.max(
      0,
      MAX_PUZZLE_ATTEMPT_DURATION_MS -
        (window.performance.now() - elapsedTimerStartedAtRef.current),
    );
    const timeout = window.setTimeout(() => {
      elapsedTimeMsRef.current = MAX_PUZZLE_ATTEMPT_DURATION_MS;
      elapsedTimerExpiredRef.current = true;
      elapsedTimerStartedAtRef.current = null;
      setElapsedTimeMs(MAX_PUZZLE_ATTEMPT_DURATION_MS);
      setElapsedTimerRunning(false);
    }, remainingTime);

    return () => window.clearTimeout(timeout);
  }, [elapsedTimerRunning]);

  const readElapsedTimeMs = useCallback((): number => {
    if (elapsedTimerStartedAtRef.current === null) return elapsedTimeMsRef.current;
    const elapsed = window.performance.now() - elapsedTimerStartedAtRef.current;
    elapsedTimeMsRef.current = Math.min(elapsed, MAX_PUZZLE_ATTEMPT_DURATION_MS);
    return elapsedTimeMsRef.current;
  }, []);

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
  const canRevealSolution =
    Boolean(fen) &&
    (hasAttemptedActivePuzzle || puzzleSession.attempt === "wrong") &&
    !isRetryFeedbackActive &&
    !introPending;
  const solutionButtonTitle = isRetryFeedbackActive
    ? "Find the better move before viewing the solution."
    : hasAttemptedActivePuzzle
      ? "View the solution"
      : SOLUTION_UNLOCK_HINT;
  const feedback = puzzleSession.feedback;
  const visibleRatingFeedback =
    attemptRatingFeedback?.puzzleId === activePuzzleKey &&
    feedback &&
    (feedback.type === "correct" || feedback.type === "wrong")
      ? attemptRatingFeedback
      : null;
  const displayedUserPuzzleRating = visibleRatingFeedback
    ? visibleRatingFeedback.userRatingAfter
    : userPuzzleRatingQuery.isPending || userPuzzleRatingQuery.isError
      ? null
      : (userPuzzleRatingQuery.data?.rating ?? 2000);

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
        message: getErrorMessage(error, "Unable to refresh this set."),
      });
    }
  };

  const handleNextPuzzle = () => {
    if (!canGoToNextPuzzle) return;
    const nextIndex = isSetSolveMode
      ? nextSetPuzzleIndex
      : (nextHistoryPuzzleIndex ?? getNextShuffledPuzzleIndex(activePuzzleIndex));
    const nextPuzzle = nextIndex === undefined ? undefined : puzzles[nextIndex];
    if (nextPuzzle) replaceUrlWithPuzzle(nextPuzzle.puzzleId);
  };

  const handlePreviousPuzzle = () => {
    if (!canGoToPreviousPuzzle) return;
    const previousIndex = isSetSolveMode
      ? orderedSetPuzzleIndexes[activeSetPuzzlePosition - 1]
      : history[historyIndex - 1];
    const previousPuzzle = previousIndex === undefined ? undefined : puzzles[previousIndex];
    if (previousPuzzle) replaceUrlWithPuzzle(previousPuzzle.puzzleId);
  };

  const { previousHint, nextHint, previousAria, nextAria } = useBoardItemShortcuts({
    onPrevious: canGoToPreviousPuzzle ? handlePreviousPuzzle : undefined,
    onNext: canGoToNextPuzzle ? handleNextPuzzle : undefined,
  });

  const handleSelectSolutionTab = () => {
    if (!canRevealSolution) return;

    if (showSolution) {
      setActivePuzzleInfoTab(null);
      setSolutionNavigation(null);
      return;
    }

    dispatchPuzzleSession({ type: "enter-analysis", revealSolution: true });
    setActivePuzzleInfoTab("solution");
    setSolutionNavigation(null);
    if (isMobileLayout) {
      window.requestAnimationFrame(() => {
        boardPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const handleGiveUp = () => {
    if (puzzleSession.attempt !== "wrong" || isAnalysisMode || introPending) return;

    const elapsedAtGiveUp =
      elapsedTimerStartedAtRef.current === null
        ? elapsedTimeMsRef.current
        : Math.max(0, window.performance.now() - elapsedTimerStartedAtRef.current);
    elapsedTimeMsRef.current = Math.min(elapsedAtGiveUp, MAX_PUZZLE_ATTEMPT_DURATION_MS);
    elapsedTimerStartedAtRef.current = null;
    setElapsedTimeMs(elapsedTimeMsRef.current);
    setElapsedTimerRunning(false);
    dispatchPuzzleSession({ type: "enter-analysis", revealSolution: true });
    setActivePuzzleInfoTab("solution");
    setSolutionNavigation(null);
    setPinnedSolutionLineIndex(0);
  };

  const loadOtherPuzzleAttempts = () => {
    if (!activePuzzleKey || otherPuzzleAttemptsStatus === "loaded") return;

    const puzzleKeyForRequest = activePuzzleKey;
    setOtherPuzzleAttemptsStatus("loading");
    const fetchAttempts = () =>
      fetchPuzzleAttemptsForPuzzle(puzzleKeyForRequest, {
        limit: OTHER_PUZZLE_ATTEMPTS_LIMIT,
      });
    void fetchAttempts()
      .catch(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        return fetchAttempts();
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

  const handleSelectOtherPuzzleAttemptsTab = () => {
    if (!canViewPostAttemptDetails) return;

    if (otherPuzzleAttemptsOpen) {
      if (otherPuzzleAttemptsStatus === "error") {
        loadOtherPuzzleAttempts();
        return;
      }
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
    loadOtherPuzzleAttempts();
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
        message: getErrorMessage(error, "Unable to update puzzle explanation."),
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
      const currentSession = puzzleSessionRef.current;
      const previousBoardSnapshot = previousBoardSnapshotRef.current;
      const boardPositionChanged =
        previousBoardSnapshot.fen !== nextBoardState.fen ||
        previousBoardSnapshot.lineIndex !== nextBoardState.lineIndex ||
        previousBoardSnapshot.solutionLineIndex !== nextBoardState.solutionLineIndex ||
        previousBoardSnapshot.viewingSolution !== nextBoardState.viewingSolution;
      const nextCompletionFeedback = buildCompletionFeedback(
        nextBoardState,
        currentSession.attempt === "wrong",
      );
      const shouldShowTransientFeedback =
        nextCompletionFeedback !== null && !nextBoardState.viewingSolution;

      setBoardState(nextBoardState);
      if (nextCompletionFeedback) {
        dispatchPuzzleSession({ type: "board-feedback", feedback: nextCompletionFeedback });
      } else {
        dispatchPuzzleSession({ type: "board-idle", positionChanged: boardPositionChanged });
      }

      if (isMobileLayout) {
        if (shouldShowTransientFeedback) {
          showMobileFeedback(nextCompletionFeedback);
        } else if (currentSession.mode === "play" && boardPositionChanged) {
          setMobileFeedback(null);
        }
      }

      if (shouldShowTransientFeedback) {
        setFeedbackBadgeId((current) => current + 1);
      }

      if (
        currentSession.mode === "analysis" &&
        currentSession.solutionRevealed &&
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
    [isMobileLayout, showMobileFeedback],
  );

  const handlePlaybackCommand = useCallback((command: PlaybackCommand): void => {
    setSolutionNavigation({ type: "command", command });
  }, []);

  const baseLineState = getBoardLineState(boardState);
  const currentAnalysisMoves = baseLineState.currentMoves;

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
  const isOnSolutionPath =
    matchingSolutionLineIndexes.length > 0 &&
    activeSolutionLine.length >= currentAnalysisMoves.length;
  const variationLineState = getBoardLineState(boardState, {
    ...(boardState.viewingSolution ? { activeSolutionLineIndex } : {}),
  });
  const allVariationLines = variationLineState.lines;
  const activeVariationLineIndex = variationLineState.activeLineIndex;

  const handleVariationMoveClick = useCallback(
    (lineIndex: number, moveIndex: number): void => {
      const target = variationLineState.lineTargets[lineIndex];
      if (!target) return;
      if (target.source === "solution") setPinnedSolutionLineIndex(target.index);
      setSolutionNavigation(boardLineNavigation(target, moveIndex + 1));
    },
    [variationLineState.lineTargets],
  );

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

  const handleUpdatePuzzleRating = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!canManagePuzzleRating || !activePuzzleId || ratingSaveStatus.state === "saving") return;
    setRatingSaveStatus({ state: "saving" });

    try {
      const savedRating = await updatePuzzleRating(activePuzzleId, ratingDraftLevel);
      setPuzzles((current) =>
        current.map((puzzle) =>
          puzzle.puzzleId === activePuzzleId
            ? {
                ...puzzle,
                rating_state: {
                  ...(Array.isArray(puzzle.rating_state)
                    ? (puzzle.rating_state[0] ?? {})
                    : (puzzle.rating_state ?? {})),
                  rating: savedRating.rating,
                  rating_deviation: savedRating.ratingDeviation,
                  attempts: savedRating.attempts,
                  successes: savedRating.successes,
                  computed_level: savedRating.level,
                  human_level: savedRating.level,
                  human_rated_by: normalizeUsername(user?.username),
                  human_rated_at: savedRating.updatedAt,
                  updated_at: savedRating.updatedAt,
                },
              }
            : puzzle,
        ),
      );
      setRatingEditorOpen(false);
      setRatingSaveStatus({ state: "saved" });
    } catch (error) {
      setRatingSaveStatus({
        state: "error",
        message: getErrorMessage(error, "Unable to update puzzle rating."),
      });
    }
  };

  const currentLineLength =
    boardShowsSolution && canRevealSolution
      ? activeSolutionLine.length
      : (boardState.lineMoves?.length ?? 0);
  const currentPly = boardState.lineIndex ?? 0;
  const canNavigateIntro = Boolean(
    activePuzzle?.intro && !introPending && !blindPosition && !dailyLimitReached,
  );
  const canPlaybackPrevious = !boardState.viewingIntro && (currentPly > 0 || canNavigateIntro);
  const canPlaybackNext = Boolean(boardState.viewingIntro) || currentPly < currentLineLength;

  useBoardWheelNavigation({
    boardPanelRef,
    canStepBack: boardShowsSolution && canRevealSolution && canPlaybackPrevious,
    canStepForward: boardShowsSolution && canRevealSolution && canPlaybackNext,
    onNavigate: handlePlaybackCommand,
  });

  const puzzleAnalysisPanel = (
    <PuzzleAnalysisPanel
      key={activePuzzleId ?? "empty"}
      fen={currentFen}
      analysisActive={isAnalysisMode}
      previousMove={introPending ? undefined : activePuzzle?.intro}
      beforePreviousMove={boardState.viewingIntro}
      terminalOutcome={
        boardState.winner ?? (boardState.status.toLowerCase() === "draw" ? "draw" : null)
      }
      lines={isAnalysisMode ? allVariationLines : []}
      moves={boardState.lineMoves ?? []}
      currentPly={currentAnalysisMoves.length}
      activeLineIndex={activeVariationLineIndex}
      onNavigate={(ply) => {
        if (canViewPostAttemptDetails) {
          dispatchPuzzleSession({ type: "enter-analysis", revealSolution: true });
        }
        setSolutionNavigation({ type: "history", ply });
      }}
      onSelectVariation={(lineIndex, moveIndex) => {
        dispatchPuzzleSession({ type: "enter-analysis", revealSolution: true });
        handleVariationMoveClick(lineIndex, moveIndex);
      }}
      onCycleOptions={(command) => setSolutionNavigation({ type: "command", command })}
      onPlayLine={(ucis) => setSolutionNavigation({ type: "line", ucis })}
      onHoverMove={setAnalysisPreviewMove}
      onEngineMovesChange={setAnalysisEngineMoves}
      canGiveUp={puzzleSession.attempt === "wrong" && !isAnalysisMode && !introPending}
      onGiveUp={handleGiveUp}
      canStepBack={canPlaybackPrevious}
      canStepForward={canPlaybackNext}
      onNavigateMoves={handlePlaybackCommand}
    />
  );

  const renderPuzzleInfoSection = (mobile = false) => (
    <PuzzleInfoSection
      mobile={mobile}
      {...(testMode ? { lockedDetailsHint: "Solve the puzzle or give up first." } : {})}
      activeTab={activePuzzleInfoTab}
      solution={{
        canReveal: canRevealSolution,
        canGiveUp: puzzleSession.attempt === "wrong" && !isAnalysisMode,
        buttonTitle: solutionButtonTitle,
        mobileAnalysis: mobile ? puzzleAnalysisPanel : undefined,
        onToggle: handleSelectSolutionTab,
      }}
      explanation={{
        available: hasExplanation || isPuzzleExplanationEditor,
        canView: canViewExplanation,
        canManage: canManagePuzzleExplanation,
        hasContent: hasExplanation,
        content: explanation,
        editorOpen: canManagePuzzleExplanation && explanationEditorOpen,
        draft: explanationDraft,
        puzzleId: activePuzzleId,
        saveStatus: explanationSaveStatus,
        onToggle: handleSelectExplanationTab,
        onOpenEditor: handleOpenExplanationEditor,
        onCancelEditor: handleCancelExplanationEdit,
        onDraftChange: setExplanationDraft,
        onSave: (event) => void handleSaveExplanation(event),
      }}
      attempts={{
        canView: canViewPostAttemptDetails,
        puzzleKey: activePuzzleKey,
        status: otherPuzzleAttemptsStatus,
        rows: otherPuzzleAttempts,
        onToggle: handleSelectOtherPuzzleAttemptsTab,
      }}
      comments={
        testMode
          ? null
          : {
              canView: hasAttemptedActivePuzzle,
              puzzleId: activePuzzleId,
              onSelect: handleSelectCommentsTab,
            }
      }
    />
  );

  const closeReportIssueDialog = () => {
    setReportIssueOpen(false);
    setReportIssueStatus({ state: "idle" });
  };

  const submitPuzzleIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      testMode ||
      !activePuzzleId ||
      !user?.username ||
      reportIssueStatus.state === "submitting"
    ) {
      return;
    }
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
        message: getErrorMessage(reportError, "Unable to report issue."),
      });
    }
  };

  const renderPlayerRows = (mobile = false) => (
    <PuzzlePositionRows
      fen={blindPosition?.beforeFen ?? currentFen}
      white={{ name: whitePlayer, label: whitePlayerLabel }}
      black={{ name: blackPlayer, label: blackPlayerLabel }}
      mobile={mobile}
    />
  );

  const renderPuzzleRating = (mobile = false) => {
    const levelLabel = puzzleLevelLabel(activePuzzleRating.level);
    const ratingChange = visibleRatingFeedback?.puzzleRatingChange;
    const changeDirection =
      ratingChange === undefined ? "" : ratingChange >= 0 ? "positive" : "negative";
    const changeDescription =
      ratingChange === undefined
        ? ""
        : `, ${ratingChange >= 0 ? "increased" : "decreased"} by ${Math.abs(ratingChange)}`;
    const details = `${levelLabel}, ${activePuzzleRating.rating} Elo${changeDescription}, rating deviation ${activePuzzleRating.ratingDeviation}, ${activePuzzleRating.attempts} attempts`;

    if (canManagePuzzleRating && ratingEditorOpen) {
      return (
        <form
          className={`puzzleRatingEditor ${mobile ? "mobile" : ""}`.trim()}
          onSubmit={(event) => void handleUpdatePuzzleRating(event)}
          aria-label="Edit puzzle level"
        >
          <label>
            <span className="srOnly">Puzzle level</span>
            <select
              value={ratingDraftLevel}
              onChange={(event) =>
                setRatingDraftLevel(normalizePuzzleLevel(Number(event.target.value)))
              }
              disabled={ratingSaveStatus.state === "saving"}
            >
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>
                  V{level}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={ratingSaveStatus.state === "saving"}>
            {ratingSaveStatus.state === "saving" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setRatingDraftLevel(activePuzzleRating.level);
              setRatingEditorOpen(false);
              setRatingSaveStatus({ state: "idle" });
            }}
            disabled={ratingSaveStatus.state === "saving"}
          >
            Cancel
          </button>
        </form>
      );
    }

    const content = (
      <>
        <strong>{levelLabel}</strong>
        <span>{activePuzzleRating.rating}</span>
        {ratingChange !== undefined ? <small>{formatSignedDecimal(ratingChange)}</small> : null}
      </>
    );

    return canManagePuzzleRating ? (
      <button
        type="button"
        className={`puzzleRatingBadge editable ${changeDirection} ${mobile ? "mobile" : ""}`.trim()}
        data-level={activePuzzleRating.level}
        title={`${details}. Edit level.`}
        aria-label={`${details}. Edit level.`}
        onClick={() => {
          setRatingDraftLevel(activePuzzleRating.level);
          setRatingEditorOpen(true);
          setRatingSaveStatus({ state: "idle" });
        }}
      >
        {content}
      </button>
    ) : (
      <span
        className={`puzzleRatingBadge ${changeDirection} ${mobile ? "mobile" : ""}`.trim()}
        data-level={activePuzzleRating.level}
        title={details}
        aria-label={details}
      >
        {content}
      </span>
    );
  };

  const renderUserPuzzleRating = (mobile = false) => {
    if (!normalizedUsername) return null;

    const ratingChange = visibleRatingFeedback?.userRatingChange;
    const changeDirection =
      ratingChange === undefined ? "" : ratingChange >= 0 ? "positive" : "negative";
    const changeDescription =
      displayedUserPuzzleRating === null
        ? userPuzzleRatingQuery.isError
          ? "Your puzzle rating is unavailable"
          : "Loading your puzzle rating"
        : ratingChange === undefined
          ? `Your puzzle rating is ${displayedUserPuzzleRating}`
          : `Your puzzle rating is ${displayedUserPuzzleRating}, ${
              ratingChange >= 0 ? "increased" : "decreased"
            } by ${Math.abs(ratingChange)}`;

    return (
      <div
        className={`userPuzzleRating ${changeDirection} ${mobile ? "mobile" : ""}`.trim()}
        aria-label={changeDescription}
        aria-live="polite"
        aria-atomic="true"
      >
        <span>Your rating</span>
        <strong>{displayedUserPuzzleRating ?? "—"}</strong>
        {ratingChange !== undefined ? <small>{formatSignedDecimal(ratingChange)}</small> : null}
      </div>
    );
  };

  const puzzleTagVoting =
    !testMode && hasAttemptedActivePuzzle && activePuzzleId ? (
      <PuzzleTagVotingPanel
        key={`${activePuzzleId}:${normalizedUsername}`}
        puzzleId={activePuzzleId}
        tags={activePuzzleTags}
        canVote={Boolean(normalizedUsername)}
      />
    ) : null;

  const puzzleTitle = testMode
    ? activePuzzleId
      ? `Test puzzle ${activePuzzleId}`
      : "Puzzle test"
    : activePuzzleId
      ? `Puzzle ${activePuzzleId}`
      : "Puzzle";
  const displayError =
    loadingError ||
    (testPuzzleUnavailable
      ? "That puzzle is unavailable."
      : !blindPosition
        ? boardState.error
        : "");

  return (
    <div className="page puzzlePage">
      <Seo
        title={
          testMode ? "Puzzle test" : activePuzzleId ? `Puzzle #${activePuzzleId}` : "Solve a Puzzle"
        }
        {...(testMode ? { robots: "noindex,nofollow" } : {})}
        description={
          activePuzzleId
            ? `Solve atomic chess puzzle ${activePuzzleId} and play through the full forcing line.`
            : "Solve atomic chess puzzles drawn from real games and community analysis."
        }
        path={
          testMode
            ? "/admin/puzzle-test"
            : activePuzzleId
              ? isDashboardSetSolveMode
                ? `/solve/dashboard/${encodeURIComponent(routeDashboardSetId)}/${activePuzzleId}`
                : isCustomSetSolveMode
                  ? `/solve/custom/${encodeURIComponent(routeCustomSetId)}/${activePuzzleId}`
                  : isSetSolveMode
                    ? `/solve/set/${encodeURIComponent(routeSetKey)}/${activePuzzleId}`
                    : `/solve/${activePuzzleId}`
              : "/solve"
        }
      />
      <PuzzleIssueDialog
        dialogRef={reportIssueDialogRef}
        signedIn={Boolean(user?.username)}
        category={reportIssueCategory}
        details={reportIssueDetails}
        status={reportIssueStatus}
        onCategoryChange={setReportIssueCategory}
        onDetailsChange={setReportIssueDetails}
        onClose={closeReportIssueDialog}
        onSubmit={(event) => void submitPuzzleIssue(event)}
        onLogin={() => void login(`${window.location.pathname}${window.location.search}`)}
      />
      <div className="panel puzzlePanel">
        <header className="puzzleHeader">
          <div className="puzzleHeaderTopline">
            <div className="puzzleTitleRow">
              <h1>{puzzleTitle}</h1>
              {!isMobileLayout ? (
                <nav className="puzzleHeaderNavigation" aria-label="Puzzle navigation">
                  <button
                    type="button"
                    aria-label="Previous"
                    title={`Previous puzzle${previousHint ? ` (${previousHint})` : ""}`}
                    aria-keyshortcuts={previousAria}
                    onClick={handlePreviousPuzzle}
                    disabled={!canGoToPreviousPuzzle}
                  >
                    <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next"
                    title={`Next puzzle${nextHint ? ` (${nextHint})` : ""}`}
                    aria-keyshortcuts={nextAria}
                    onClick={handleNextPuzzle}
                    disabled={!canGoToNextPuzzle}
                  >
                    <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
                  </button>
                </nav>
              ) : null}
            </div>
            <div className="puzzleHeaderStatus">
              <div className="puzzleHeaderRatings">{renderUserPuzzleRating()}</div>
              {!isMobileLayout && shouldShowPuzzleTimer ? (
                <PuzzleElapsedTimer
                  elapsedTimeMs={elapsedTimeMs}
                  running={elapsedTimerRunning}
                  readElapsedTimeMs={readElapsedTimeMs}
                />
              ) : null}
            </div>
            <div className="puzzleHeaderMetadata">
              <div className="puzzleHeaderMeta" title={author}>
                <span>By</span>
                {authorDashboardUsername ? (
                  <PlayerLink
                    className="puzzleHeaderAuthorLink"
                    username={authorDashboardUsername}
                    variant="puzzles"
                    title={author}
                  >
                    {authorLabel}
                  </PlayerLink>
                ) : (
                  <strong>{authorLabel}</strong>
                )}
              </div>
              {event && !showPuzzleSetMetadata ? (
                <div className="puzzleHeaderEvent" title={event}>
                  {event}
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
            </div>
            {hasAttemptedActivePuzzle || unratedReason || opaStyle ? (
              <div className="puzzleHeaderBadges">
                {hasAttemptedActivePuzzle ? renderPuzzleRating() : null}
                {unratedReason ? (
                  <span
                    className="puzzleUnratedBadge"
                    tabIndex={0}
                    title={unratedLabel}
                    aria-label={unratedLabel}
                    data-tooltip={unratedLabel}
                  >
                    Unrated
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
              </div>
            ) : null}
          </div>

          {showPuzzleSetMetadata && activePuzzleSetMetadata ? (
            <section className="puzzleHeaderSetMetadata" aria-label="Puzzle set details">
              <strong>
                {canLinkSourceMatch ? (
                  <Link
                    className="puzzleHeaderEventLink"
                    to="/match/$matchId"
                    params={{ matchId: sourceMatchId }}
                  >
                    {activePuzzleSetMetadata.eventName}
                  </Link>
                ) : (
                  activePuzzleSetMetadata.eventName
                )}
              </strong>
              {puzzleSetDate || puzzleSetParticipantsLabel ? (
                <span className="puzzleHeaderSetDetails">
                  {puzzleSetDate ? (
                    <time dateTime={activePuzzleSetMetadata.eventDate}>{puzzleSetDate}</time>
                  ) : null}
                  {puzzleSetDate && puzzleSetParticipantsLabel ? (
                    <span aria-hidden="true">·</span>
                  ) : null}
                  {puzzleSetParticipantsLabel ? <span>{puzzleSetParticipantsLabel}</span> : null}
                </span>
              ) : null}
            </section>
          ) : null}

          {renderPlayerRows()}
          {ratingSaveStatus.state === "error" ? (
            <p className="puzzleRatingError" role="alert">
              {ratingSaveStatus.message}
            </p>
          ) : null}
        </header>

        {!isMobileLayout ? puzzleTagVoting : null}

        {!testMode && !isMobileLayout && hasAttemptedActivePuzzle ? (
          <div id="desktop-puzzle-vote-slot" className="puzzleVoteSlot" />
        ) : null}

        {displayError && !dailyLimitReached ? (
          <div className="errorText" role="alert">
            {displayError}
          </div>
        ) : null}
        {hasCompletedPuzzleSet ? (
          <section className="puzzleSetComplete" role="status" aria-live="polite">
            <div className="puzzleSetCompleteCopy">
              <span>Set complete</span>
              <h2>Puzzle set complete</h2>
              <p>
                You finished all {puzzleCount} puzzles
                {isDashboardSetSolveMode
                  ? ` in ${dashboardPuzzleSet?.label ?? "this dashboard set"}`
                  : isCustomSetSolveMode
                    ? ` in ${customPuzzleSet?.label ?? "this dashboard set"}`
                    : event
                      ? ` in ${event}`
                      : ""}
                .
              </p>
            </div>
            <div className="puzzleSetCompleteActions">
              {isCustomSetSolveMode ? (
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
                className={`puzzleSetCompleteLink ${isCustomSetSolveMode ? "" : "primary"}`.trim()}
                to="/solve"
              >
                Continue with regular puzzles
              </Link>
              <Link
                className="puzzleSetCompleteLink"
                to={
                  isDashboardSetSolveMode
                    ? dashboardPuzzleSet?.sourceUsername
                      ? "/@/$username/puzzles"
                      : "/dashboard"
                    : isCustomSetSolveMode
                      ? "/solve/custom-sets"
                      : "/solve/sets"
                }
                params={
                  isDashboardSetSolveMode && dashboardPuzzleSet?.sourceUsername
                    ? { username: dashboardPuzzleSet.sourceUsername }
                    : undefined
                }
              >
                {isDashboardSetSolveMode
                  ? "Back to puzzle dashboard"
                  : isCustomSetSolveMode
                    ? "Back to custom sets"
                    : "Back to puzzle sets"}
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

        {!isMobileLayout ? <div className="puzzleDetails">{renderPuzzleInfoSection()}</div> : null}
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
            {dailyLimitReached ? (
              <div className="dailyPuzzleLimitNotice" role="status" aria-live="polite">
                <strong>No more puzzles today</strong>
                <span>
                  {fen ? DAILY_PUZZLE_ATTEMPT_LIMIT_MESSAGE : DAILY_PUZZLE_LOAD_BLOCKED_MESSAGE}
                </span>
              </div>
            ) : null}
            {fen &&
            (!autoplayIntro || attemptedPuzzleIdsReady) &&
            (!blindPlies || blindEntryReady) ? (
              <Chessboard
                key={`${activePuzzleId}:${blindMode}`}
                intro={activePuzzle?.intro}
                autoplayIntro={autoplayIntro}
                blindFen={blindPosition?.beforeFen}
                onIntroEnd={handleIntroEnd}
                puzzleId={activePuzzleId}
                fen={fen}
                orientation={orientation}
                coordinates
                solution={activePuzzle?.solution ?? ""}
                showSolution={boardShowsSolution}
                analysisMode={isAnalysisMode}
                disabled={dailyLimitReached}
                captureNavigationShortcuts
                previewMove={analysisPreviewMove}
                engineMoves={
                  isAnalysisMode ? (solutionNavigation ? null : analysisEngineMoves) : undefined
                }
                solutionNavigation={solutionNavigation}
                onNavigateHandled={() => setSolutionNavigation(null)}
                onAttemptResolved={handleAttemptResolved}
                onStateChange={handleBoardStateChange}
              />
            ) : dailyLimitReached ? null : (
              <div className="emptyBoard">
                {testMode && displayError ? "No puzzle loaded." : "Waiting for puzzle data..."}
              </div>
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

      {blindPosition ? (
        <BlindPuzzlePanel
          key={activePuzzleId}
          leadIn={blindPosition}
          played={currentAnalysisMoves}
          error={boardState.error}
          canGiveUp={!isMobileLayout && puzzleSession.attempt === "wrong" && !isRetryFeedbackActive}
          onGiveUp={handleGiveUp}
        />
      ) : !isMobileLayout ? (
        puzzleAnalysisPanel
      ) : null}

      {isMobileLayout ? (
        <>
          <section className="mobilePuzzleMeta" aria-label="Puzzle details">
            <div className="mobilePuzzleStatus">
              {testMode ? (
                <span className="mobilePuzzleNumber">{puzzleTitle}</span>
              ) : activePuzzleId ? (
                <span className="mobilePuzzleNumber" aria-label={`Puzzle ${activePuzzleId}`}>
                  #{activePuzzleId}
                </span>
              ) : null}
              <div className="puzzleHeaderRatings mobile">
                {renderUserPuzzleRating(true)}
                {hasAttemptedActivePuzzle ? renderPuzzleRating(true) : null}
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
              {unratedReason ? (
                <span
                  className="puzzleUnratedBadge"
                  tabIndex={0}
                  title={unratedLabel}
                  aria-label={unratedLabel}
                  data-tooltip={unratedLabel}
                >
                  Unrated
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
              {authorDashboardUsername ? (
                <PlayerLink
                  className="mobilePuzzleAuthor"
                  username={authorDashboardUsername}
                  variant="puzzles"
                  title={author}
                >
                  {authorLabel}
                </PlayerLink>
              ) : (
                <span className="mobilePuzzleAuthor" title={author}>
                  {authorLabel}
                </span>
              )}
              {shouldShowPuzzleTimer ? (
                <PuzzleElapsedTimer
                  elapsedTimeMs={elapsedTimeMs}
                  running={elapsedTimerRunning}
                  readElapsedTimeMs={readElapsedTimeMs}
                />
              ) : null}
            </div>
            {renderPlayerRows(true)}
            {puzzleTagVoting}
          </section>
          {!testMode && hasAttemptedActivePuzzle ? (
            <div id="mobile-puzzle-vote-slot" className="mobilePuzzleVoteSlot" />
          ) : null}
        </>
      ) : null}

      {isMobileLayout && hasAttemptedActivePuzzle ? (
        <div className="mobileWorkflowPanel">
          <div className="mobileActionCard">{renderPuzzleInfoSection(true)}</div>
        </div>
      ) : null}

      {isMobileLayout ? (
        <div className="mobileBottomNav" aria-label="Puzzle navigation">
          <button
            type="button"
            onClick={handlePreviousPuzzle}
            disabled={!canGoToPreviousPuzzle}
            title={`Previous puzzle${previousHint ? ` (${previousHint})` : ""}`}
            aria-keyshortcuts={previousAria}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={handleNextPuzzle}
            disabled={!canGoToNextPuzzle}
            title={`Next puzzle${nextHint ? ` (${nextHint})` : ""}`}
            aria-keyshortcuts={nextAria}
          >
            Next
          </button>
        </div>
      ) : null}

      {!testMode && hasAttemptedActivePuzzle ? (
        <p className="puzzleIssuePrompt">
          <button type="button" onClick={() => setReportIssueOpen(true)}>
            Report issue
          </button>
        </p>
      ) : null}

      {!testMode && hasAttemptedActivePuzzle ? (
        <PuzzleCommunity
          puzzleId={activePuzzleId}
          voteTargetId={isMobileLayout ? "mobile-puzzle-vote-slot" : "desktop-puzzle-vote-slot"}
        />
      ) : null}
    </div>
  );
};
