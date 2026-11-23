import "./PuzzleSolver.css";

import {
  faChevronLeft,
  faChevronRight,
  faClockRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "@tanstack/react-router";
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
  utcDayBounds,
} from "../../../shared/domain/puzzles/dailyAttemptLimit";
import { rewindPuzzleLeadIn } from "../../../shared/domain/puzzles/gameHistory";
import { PUZZLE_ADMIN_USERNAME } from "../../../shared/domain/puzzles/puzzleAdmin";
import { puzzleGradingLabel } from "../../../shared/domain/puzzles/puzzleGrading";
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
import {
  PuzzleComposerButton,
  PuzzleCreationConfirmation,
} from "../../features/analysisWorkspace/PuzzleComposer";
import { useBoardItemShortcuts } from "../../hooks/useBoardItemShortcuts";
import { useBoardMoveEditing } from "../../hooks/useBoardMoveEditing";
import { useBoardWheelNavigation } from "../../hooks/useBoardWheelNavigation";
import {
  boardLineNavigation,
  getBoardLineState,
  snapshotBoardAnalysis,
} from "../../lib/analysis/boardState";
import { movePrefix, startingPlyFromFen } from "../../lib/chess/pgn";
import { previewCoinChange } from "../../lib/coins/coinEvents";
import {
  fetchCustomPuzzleSet,
  getOrderedPuzzleIndexesForCustomSet,
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
  fetchPuzzleGradingState,
  setOwnPuzzlePermanentlyUnrated,
} from "../../lib/supabase/puzzleProgress";
import type { PuzzleRatingEvent } from "../../lib/supabase/puzzleUserRatings";
import { profileAliasQueryOptions } from "../../lib/users/aliasQueries";
import type { AsyncActionStatus } from "../../types/async";
import {
  type AttemptResolved,
  type ChessboardState,
  type PlaybackCommand,
  type SolutionNavigation,
} from "../../types/chessboard";
import { orientationFromFen } from "../../utils/chessNotation";
import { getErrorMessage } from "../../utils/errors";
import { formatElapsedDuration, formatSignedDecimal } from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";
import { BlindPuzzlePanel } from "./BlindPuzzlePanel";
import { PuzzleAnalysisPanel } from "./PuzzleAnalysisPanel";
import { PuzzleBoardPlaceholder } from "./PuzzleBoardPlaceholder";
import { PuzzleInfoSection, type PuzzleInfoTab } from "./PuzzleInfoSection";
import { PuzzleIssueDialog, type PuzzleIssueStatus } from "./PuzzleIssueDialog";
import { PuzzlePositionRows } from "./PuzzlePositionRows";
import {
  buildCompletionFeedback,
  type CompletionFeedback,
  createInitialPuzzleSession,
  getPuzzleSessionAccess,
  isPuzzleSessionInAnalysis,
  puzzleSessionReducer,
} from "./puzzleSession";
import {
  addValueToSet,
  createInitialBoardSnapshot,
  createInitialBoardState,
  excludePuzzleIntroTime,
  getPuzzleAttemptStartedAt,
  puzzleIndexFromParam,
  removeValueFromSet,
  toPuzzleKey,
} from "./puzzleSolverState";
import { previewPuzzleRatingChanges, testPuzzleCoinDelta } from "./puzzleTestFeedback";
import { usePuzzleCatalog } from "./usePuzzleCatalog";
import { SERVER_CUSTOM_SET_ID_PATTERN, usePuzzleProgress } from "./usePuzzleProgress";
import { PUZZLE_PREFETCH_COUNT, usePuzzleSelection } from "./usePuzzleSelection";

const ATTEMPTED_PUZZLE_BADGE_LABEL = "You've already attempted this puzzle before";
const SOLVED_BEFORE_BADGE_LABEL = "You've solved this puzzle before";
const PUZZLE_GRADING_EXPLANATION =
  "Graded attempts can earn or lose coins. Past graded mistakes still count toward your Other Attempts color. Only your first graded attempt affects puzzle rating. Your first graded solve starts a fixed two-month cooldown; your second ends grading permanently. Practice does not change your color or extend that cooldown.";
const OPA_STYLE_BADGE_LABEL =
  "Only the best moves are accepted. Weaker alternatives are rejected even if they also lead to mate.";
const OTHER_PUZZLE_ATTEMPTS_LIMIT = 30;
const MAX_PUZZLE_ATTEMPT_DURATION_MS = 60 * 60 * 1000;
const PUZZLE_EXPLANATION_LEGACY_AUTHOR = "admin";
const PUZZLE_EXPLANATION_LEGACY_EDITOR = "seaside_tiramisu";

// Keep in sync with the stacked layout in PuzzleSolver.css.
const PUZZLE_STACKED_LAYOUT_QUERY =
  "(max-width: 460px), (max-width: 600px) and (min-height: calc(min(100vw - 16px, 548px) + 184px))";

const SOLUTION_UNLOCK_HINT = "Make at least one attempt before viewing the solution.";

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

const loadTestPuzzlesById: typeof loadPuzzlesById = (puzzleIds, options) =>
  loadPuzzlesById(puzzleIds, { ...options, testMode: true });

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
  return <PuzzleSolver testMode />;
};

export const PuzzleSolverPage = () => <PuzzleSolver testMode={false} />;

const PuzzleSolver = ({ testMode }: { testMode: boolean }) => {
  const navigate = useNavigate();
  const location = useLocation();
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
  const { showPuzzleTimer, blindPuzzles, excludeOwnPuzzles, newPuzzlesOnly } = useAppSettings();
  const skipOwnPuzzles = !testMode && excludeOwnPuzzles && Boolean(normalizedUsername);
  const skipAttemptedPuzzles = !testMode && newPuzzlesOnly && Boolean(normalizedUsername);
  const authorIdentityQuery = useQuery({
    ...profileAliasQueryOptions(normalizedUsername),
    enabled: skipOwnPuzzles,
    retry: false,
  });
  const authorIdentity = authorIdentityQuery.data;
  const waitingForAuthorAliases = skipOwnPuzzles && authorIdentityQuery.isPending;
  const ownAuthorNames = useMemo(
    () =>
      new Set(
        [
          normalizedUsername,
          authorIdentity?.username,
          ...(authorIdentity?.accounts
            .filter((account) => account.source === "lichess")
            .map((account) => account.alias) ?? []),
        ]
          .map(normalizeUsername)
          .filter(Boolean),
      ),
    [authorIdentity, normalizedUsername],
  );
  const shouldSkipAuthor = useCallback(
    (author: unknown) => skipOwnPuzzles && ownAuthorNames.has(normalizeUsername(author)),
    [ownAuthorNames, skipOwnPuzzles],
  );
  const loadDetails = testMode ? loadTestPuzzlesById : loadPuzzlesById;
  const {
    puzzles,
    setPuzzles,
    loadingError,
    catalogLoading,
    setLoadingError,
    loadPuzzleDetails,
    unavailablePuzzleIds,
  } = usePuzzleCatalog(routePuzzleId, routeSetKey || routeDashboardSetId, loadDetails);
  const [detailError, setDetailError] = useState<{ puzzleId: number; message: string } | null>(
    null,
  );
  const [gradingAtEntry, setGradingAtEntry] = useState<{ key: string; attempted: boolean } | null>(
    null,
  );
  const [resignArmed, setResignArmed] = useState(false);
  const [unratedMarkStatus, setUnratedMarkStatus] = useState<AsyncActionStatus>({ state: "idle" });
  const [blindEntry, setBlindEntry] = useState<{
    key: string;
    eligible: boolean;
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
  const [analysisDocument, setAnalysisDocument] = useState<{ visit: string; pgn: string } | null>(
    null,
  );
  const [analysisPreviewMove, setAnalysisPreviewMove] = useState<string | null>(null);
  const [analysisEngineMoves, setAnalysisEngineMoves] = useState<readonly string[] | null>(null);
  const [puzzleSession, dispatchPuzzleSession] = useReducer(
    puzzleSessionReducer,
    undefined,
    createInitialPuzzleSession,
  );
  const puzzleSessionRef = useRef(puzzleSession);
  puzzleSessionRef.current = puzzleSession;
  const [attemptRatingFeedback, setAttemptRatingFeedback] = useState<Pick<
    PuzzleRatingEvent,
    "puzzleId" | "userRatingAfter" | "userRatingChange" | "puzzleRatingChange"
  > | null>(null);
  const [feedbackBadgeId, setFeedbackBadgeId] = useState(0);
  const [explanationEditorOpen, setExplanationEditorOpen] = useState(false);
  const [explanationDraft, setExplanationDraft] = useState("");
  const [explanationSaveStatus, setExplanationSaveStatus] = useState<AsyncActionStatus>({
    state: "idle",
  });
  const [pinnedSolutionLineIndex, setPinnedSolutionLineIndex] = useState<number | null>(null);
  const [correctAttemptsOnly, setCorrectAttemptsOnly] = useState(false);
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
  const [visitedPuzzleIds, setVisitedPuzzleIds] = useState<Set<string>>(() => new Set());
  const isMountedRef = useRef(true);
  const activePuzzleKeyRef = useRef("");
  const elapsedTimeMsRef = useRef(0);
  const elapsedTimerStartedAtRef = useRef<number | null>(null);
  const elapsedTimerExpiredRef = useRef(false);
  const testMissesRef = useRef(0);
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
  const handleRatingEvent = useCallback((puzzleId: string, ratingEvent: PuzzleRatingEvent) => {
    if (activePuzzleKeyRef.current !== puzzleId) return;
    setAttemptRatingFeedback(ratingEvent);
    setFeedbackBadgeId((current) => current + 1);
    setMobileFeedback((current) => {
      if (!current) return current;
      mobileFeedbackIdRef.current += 1;
      return { ...current, id: mobileFeedbackIdRef.current, fading: false };
    });
  }, []);
  const {
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
  } = usePuzzleProgress({
    username: user?.username,
    normalizedUsername,
    routeCustomSetId,
    testMode,
    isAuthLoading,
    setLoadingError,
    onRatingEvent: handleRatingEvent,
  });
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

  const activePuzzleIndex = routePuzzleId ? routePuzzleIndex : historyPuzzleIndex;
  const { isSelectablePuzzle, hasRecordedAttempt, canReceivePuzzle, upcomingPuzzleIndexes } =
    usePuzzleSelection({
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
    });
  const nextRandomPuzzleIndex = upcomingPuzzleIndexes[0];

  useEffect(() => {
    if (
      historyIndex >= 0 ||
      routePuzzleId ||
      routePuzzleIndex >= 0 ||
      testPuzzleUnavailable ||
      nextRandomPuzzleIndex === undefined
    ) {
      return;
    }

    const puzzleId = puzzles[nextRandomPuzzleIndex]?.puzzleId;
    if (puzzleId === undefined) return;

    setPuzzleHistory({ history: [nextRandomPuzzleIndex], historyIndex: 0 });
    replaceUrlWithPuzzle(puzzleId);
  }, [
    historyIndex,
    nextRandomPuzzleIndex,
    puzzles,
    replaceUrlWithPuzzle,
    routePuzzleIndex,
    routePuzzleId,
    testPuzzleUnavailable,
  ]);

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
  const completionInfoTab = hasExplanation ? "explanation" : "solution";
  const orientation = orientationFromFen(fen);
  const currentFen = boardState.fen || fen;
  const selectableSetPuzzleIndexes = useMemo(
    () =>
      orderedSetPuzzleIndexes.filter(
        (index) => index === activePuzzleIndex || isSelectablePuzzle(index),
      ),
    [activePuzzleIndex, orderedSetPuzzleIndexes, isSelectablePuzzle],
  );
  const activeSetPuzzlePosition = isSetSolveMode
    ? selectableSetPuzzleIndexes.indexOf(activePuzzleIndex)
    : -1;
  const puzzleCount = isSetSolveMode ? selectableSetPuzzleIndexes.length : puzzles.length;
  const dailyLimitReached = dailyAttemptCount >= DAILY_PUZZLE_ATTEMPT_LIMIT;
  const previousPuzzleIndex = isSetSolveMode
    ? selectableSetPuzzleIndexes[activeSetPuzzlePosition - 1]
    : history.slice(0, Math.max(0, historyIndex)).reverse().find(isSelectablePuzzle);
  const previousPuzzle =
    previousPuzzleIndex === undefined ? undefined : puzzles[previousPuzzleIndex];
  const canGoToPreviousPuzzle = !waitingForAuthorAliases && previousPuzzle !== undefined;
  const nextPuzzleIndex = isSetSolveMode
    ? activeSetPuzzlePosition >= 0
      ? selectableSetPuzzleIndexes[activeSetPuzzlePosition + 1]
      : undefined
    : ((historyIndex >= 0 ? history.slice(historyIndex + 1).find(canReceivePuzzle) : undefined) ??
      (dailyLimitReached ? undefined : nextRandomPuzzleIndex));
  const nextCandidate = nextPuzzleIndex === undefined ? undefined : puzzles[nextPuzzleIndex];
  const nextPuzzle =
    nextCandidate &&
    !waitingForAuthorAliases &&
    (!dailyLimitReached || hasRecordedAttempt(String(nextCandidate.puzzleId)))
      ? nextCandidate
      : undefined;
  const canGoToNextPuzzle = nextPuzzle !== undefined;
  const hasCompletedPuzzleSet =
    isSetSolveMode && !waitingForAuthorAliases && !canGoToNextPuzzle && boardState.solved;

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
  }, [countedTodayPuzzleIdsRef, dailyLimitReached, setDailyAttemptCount]);
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
  const hasPersistedAttempt = activePuzzleKey ? attemptedPuzzleIds.has(activePuzzleKey) : false;
  const hasUnratedAttempt = activePuzzleKey ? unratedPuzzleIds.has(activePuzzleKey) : false;
  const unratedReason = testMode
    ? null
    : getPuzzleUnratedReason({
        username: normalizedUsername,
        author,
        createdAt: activePuzzle?.created_at,
        hasUnratedAttempt,
        excludedUntil: ratingExclusions.get(activePuzzleKey),
        permanentlyUnrated: permanentUnratedIds.has(activePuzzleKey),
      });
  const gradingQuery = useQuery({
    queryKey: ["puzzle-grading", normalizedUsername, activePuzzleKey],
    queryFn: () => fetchPuzzleGradingState(activePuzzleKey),
    enabled: !testMode && !isAuthLoading && Boolean(normalizedUsername && activePuzzleKey),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const gradingState = testMode ? undefined : gradingQuery.data;
  const gradingReady = testMode || Boolean(gradingState);
  useEffect(() => {
    if (!gradingState) return;
    gradingStatesRef.current.set(activePuzzleKey, gradingState);
    const key = normalizedUsername + ":" + activePuzzleKey;
    setGradingAtEntry((current) =>
      current?.key === key ? current : { key, attempted: gradingState.hasAttempted },
    );
  }, [activePuzzleKey, normalizedUsername, gradingState, gradingStatesRef]);
  const hasSolvedPuzzle = Boolean(
    gradingState?.hasSolved || (activePuzzleKey && solvedPuzzleIds.has(activePuzzleKey)),
  );
  const { resumePuzzleAnalysis, puzzleDraftSubmission, puzzleAnalysisReturn } = location.state;
  const resumeAnalysis =
    Boolean(activePuzzleKey) &&
    resumePuzzleAnalysis === activePuzzleKey &&
    (testMode ||
      hasSolvedPuzzle ||
      gradingState?.hasAttempted === true ||
      gradingState?.graded === false);
  const puzzleVisitKey = JSON.stringify([
    attemptedPuzzleIdsUsername,
    routeSetKey,
    routeCustomSetId,
    routeDashboardSetId,
    activePuzzleKey,
  ]);
  const blindEntryReady = attemptedPuzzleIdsReady && blindEntry?.key === puzzleVisitKey;
  const blindPlies = blindPuzzles?.enabled ? blindPuzzles.plies : 0;
  useLayoutEffect(() => {
    if (!blindPlies) {
      setBlindEntry(null);
      return;
    }
    if (!activePuzzleKey || !attemptedPuzzleIdsReady) return;
    // Decide once the puzzle details are loaded; a first attempt must not rewind mid-visit.
    setBlindEntry((entry) => {
      if (entry?.key === puzzleVisitKey) return entry;
      if (!fen) return null;
      return {
        key: puzzleVisitKey,
        eligible:
          testMode ||
          unratedReason !== null ||
          hasPersistedAttempt ||
          hasSolvedPuzzle ||
          countedTodayPuzzleIdsRef.current.has(activePuzzleKey),
      };
    });
  }, [
    activePuzzleKey,
    attemptedPuzzleIdsReady,
    puzzleVisitKey,
    countedTodayPuzzleIdsRef,
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
  const autoplayIntro = Boolean(
    activePuzzle?.intro && !blindMode && !dailyLimitReached && !resumeAnalysis,
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
  const showGradingEligibility =
    !testMode &&
    gradingState &&
    (!gradingState.graded ||
      (gradingAtEntry?.key === normalizedUsername + ":" + activePuzzleKey &&
        gradingAtEntry.attempted));
  const gradingLabel = gradingState ? puzzleGradingLabel(gradingState) : "";
  const hasSubmittedAttempt = activePuzzleKey ? submittedPuzzleIds.has(activePuzzleKey) : false;
  // Replay history never reveals answers or ends a fresh run.
  // Any open run has a submitted move; practice never stores a miss count.
  const resumedMisses = gradingState?.runId ? Math.max(1, gradingState.misses) : 0;
  const isRetryFeedbackActive = Boolean(
    boardState.feedback === "retry" &&
    boardState.view.line.source !== "solution" &&
    !boardState.solved,
  );
  const sessionAccess = getPuzzleSessionAccess(
    puzzleSession,
    resumedMisses,
    isRetryFeedbackActive,
    hasSolvedPuzzle,
  );
  const isAnalysisMode = sessionAccess.analysis;
  const blindPosition = isAnalysisMode ? null : blindLeadIn;
  const hasAttemptedActivePuzzle = sessionAccess.hasAttempted;
  const boardShowsSolution = puzzleSession.solutionRevealed;
  const sourceMatchId = activePuzzle
    ? getPuzzleSetSourceId(activePuzzle, Number.parseInt(routeSetKey, 10))
    : "";
  const canLinkSourceMatch = Boolean(
    isAnalysisMode && !routeSetKey && !routeCustomSetId && sourceMatchId,
  );
  const attemptedPuzzleBadgeLabel =
    hasSolvedPuzzle || isCustomSetRoute || isDashboardSetSolveMode
      ? SOLVED_BEFORE_BADGE_LABEL
      : ATTEMPTED_PUZZLE_BADGE_LABEL;
  const canManagePuzzleExplanation =
    isPuzzleExplanationEditor && (isAnalysisMode || gradingState?.graded === false);
  const canViewExplanation =
    (hasExplanation || isPuzzleExplanationEditor) && (isAnalysisMode || canManagePuzzleExplanation);
  const showSolution = activePuzzleInfoTab === "solution";
  const showExplanation = activePuzzleInfoTab === "explanation";
  const otherPuzzleAttemptsOpen = activePuzzleInfoTab === "attempts";
  const otherAttemptsQuery = useQuery({
    queryKey: ["puzzle-attempts", activePuzzleKey, correctAttemptsOnly],
    queryFn: () =>
      fetchPuzzleAttemptsForPuzzle(activePuzzleKey, {
        limit: OTHER_PUZZLE_ATTEMPTS_LIMIT,
        correctOnly: correctAttemptsOnly,
      }),
    enabled: isAnalysisMode && otherPuzzleAttemptsOpen,
    retry: 1,
    retryDelay: 350,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const otherPuzzleAttemptsStatus = !otherPuzzleAttemptsOpen
    ? "idle"
    : otherAttemptsQuery.isPending
      ? "loading"
      : otherAttemptsQuery.isError
        ? "error"
        : "loaded";
  const singleLineFirstMove =
    boardState.solutionLines?.length === 1 ? boardState.solutionLines[0]?.[0] : null;

  useEffect(() => {
    const dialog = reportIssueDialogRef.current;
    if (reportIssueOpen && dialog && !dialog.open) dialog.showModal();
    if (!reportIssueOpen && dialog?.open) dialog.close();
  }, [reportIssueOpen]);

  useLayoutEffect(() => {
    activePuzzleKeyRef.current = activePuzzleKey;
    setVisitedPuzzleIds((current) =>
      !activePuzzleKey || current.has(activePuzzleKey)
        ? current
        : addValueToSet(current, activePuzzleKey),
    );
  }, [activePuzzleKey]);

  useEffect(() => {
    if (!activePuzzleId || fen) return;
    let active = true;
    void loadPuzzleDetails([activePuzzleId], activePuzzleId)
      .then((loaded) => {
        if (active && !loaded.length)
          setDetailError({
            puzzleId: activePuzzleId,
            message: `Puzzle #${activePuzzleId} is unavailable or has no playable solution.`,
          });
      })
      .catch((error: unknown) => {
        if (active)
          setDetailError({
            puzzleId: activePuzzleId,
            message: getErrorMessage(error, "Failed to load puzzle data"),
          });
      });
    return () => {
      active = false;
    };
  }, [activePuzzleId, fen, loadPuzzleDetails]);

  useEffect(() => {
    // Finish the current board first; future details are cached without mounting another board.
    if (!fen) return;
    const candidates = isSetSolveMode
      ? selectableSetPuzzleIndexes.slice(
          activeSetPuzzlePosition + 1,
          activeSetPuzzlePosition + 1 + PUZZLE_PREFETCH_COUNT,
        )
      : upcomingPuzzleIndexes;
    const missingIds = candidates.flatMap((index) => {
      const puzzle = puzzles[index];
      return puzzle &&
        !puzzle.fen &&
        (!dailyLimitReached || hasRecordedAttempt(String(puzzle.puzzleId)))
        ? [puzzle.puzzleId]
        : [];
    });
    if (missingIds.length)
      void loadPuzzleDetails(missingIds).catch((error: unknown) =>
        globalThis.console?.error(error),
      );
  }, [
    fen,
    isSetSolveMode,
    selectableSetPuzzleIndexes,
    activeSetPuzzlePosition,
    upcomingPuzzleIndexes,
    puzzles,
    dailyLimitReached,
    hasRecordedAttempt,
    loadPuzzleDetails,
  ]);

  const handleAttemptResolved = useCallback(
    ({
      puzzleId,
      puzzleCorrect,
      incorrectMove,
      correctMove,
      attemptPgn,
    }: AttemptResolved): void => {
      const normalizedPuzzleId = toPuzzleKey(puzzleId);
      if (
        normalizedPuzzleId !== activePuzzleKey ||
        isPuzzleSessionInAnalysis(puzzleSessionRef.current)
      )
        return;

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
      if (puzzleCorrect || attemptDurationMs === null) {
        elapsedTimerStartedAtRef.current = null;
        setElapsedTimerRunning(false);
      }
      setElapsedTimeMs(elapsedTimeMsRef.current);
      dispatchPuzzleSession({
        type: "attempt-resolved",
        correct: puzzleCorrect,
      });
      if (puzzleCorrect) {
        setActivePuzzleInfoTab(completionInfoTab);
        setSolutionNavigation(null);
        setPinnedSolutionLineIndex(null);
      }
      if (testMode) {
        const misses = testMissesRef.current;
        if (!puzzleCorrect) testMissesRef.current += 1;
        previewCoinChange(
          testPuzzleCoinDelta(activePuzzleRating.level, puzzleCorrect, misses, attemptDurationMs),
          puzzleCorrect ? "Test puzzle solved" : "Test incorrect attempt",
        );
        if (misses === 0 && userPuzzleRatingQuery.isSuccess) {
          setAttemptRatingFeedback({
            puzzleId: activePuzzleKey,
            ...previewPuzzleRatingChanges(
              userPuzzleRatingQuery.data ?? { rating: 2000, ratingDeviation: 350 },
              activePuzzleRating,
              puzzleCorrect,
            ),
          });
        }
        return;
      }

      enqueuePuzzleProgressWrite({
        puzzleId: normalizedPuzzleId,
        puzzleCorrect,
        attemptDurationMs,
        incorrectMove,
        correctMove,
        ...(attemptPgn ? { attemptPgn } : {}),
      });
    },
    [
      activePuzzleKey,
      activePuzzleRating,
      completionInfoTab,
      enqueuePuzzleProgressWrite,
      testMode,
      userPuzzleRatingQuery.data,
      userPuzzleRatingQuery.isSuccess,
    ],
  );

  const uiVisitKey = JSON.stringify([puzzleVisitKey, blindMode, fen]);
  const [previousUiVisitKey, setPreviousUiVisitKey] = useState(uiVisitKey);
  if (previousUiVisitKey !== uiVisitKey) {
    // Reset the entire visit before its board renders, including while details are pending.
    setPreviousUiVisitKey(uiVisitKey);
    setDetailError(null);
    setUnratedMarkStatus({ state: "idle" });
    setRatingEditorOpen(false);
    setRatingSaveStatus({ state: "idle" });
    setExplanationEditorOpen(false);
    setExplanationDraft("");
    setExplanationSaveStatus({ state: "idle" });
    setReportIssueOpen(false);
    setReportIssueCategory("missing_alternate_solution");
    setReportIssueDetails("");
    setReportIssueStatus({ state: "idle" });
    setResignArmed(false);
    if (!retryProgressWriteRef.current) setProgressSaveError("");
    setActivePuzzleInfoTab(null);
    setSolutionNavigation(null);
    setAnalysisPreviewMove(null);
    setAnalysisEngineMoves(null);
    setAnalysisDocument(null);
    dispatchPuzzleSession({ type: "reset" });
    setAttemptRatingFeedback(null);
    setFeedbackBadgeId(0);
    setPinnedSolutionLineIndex(null);
    setCustomSetRefreshState({ status: "idle" });
    testMissesRef.current = 0;
    setFinishedIntroKey("");
    setBoardState(createInitialBoardState());
    setMobileFeedback(null);
    setCorrectAttemptsOnly(false);
    previousBoardSnapshotRef.current = createInitialBoardSnapshot();
  }

  useLayoutEffect(() => {
    if (!resumeAnalysis || !fen) return;
    dispatchPuzzleSession({ type: "reveal-solution" });
    setActivePuzzleInfoTab("solution");
    if (puzzleAnalysisReturn?.snapshot.fen !== fen) return;
    if (puzzleAnalysisReturn.editedSolution !== undefined) {
      setAnalysisDocument({ visit: puzzleVisitKey, pgn: puzzleAnalysisReturn.editedSolution });
    }
    setSolutionNavigation({ type: "restoreAnalysis", snapshot: puzzleAnalysisReturn.snapshot });
  }, [fen, puzzleAnalysisReturn, puzzleVisitKey, resumeAnalysis, uiVisitKey]);

  useLayoutEffect(() => {
    const shouldStartTimer = Boolean(
      activePuzzleKey &&
      fen &&
      attemptedPuzzleIdsReady &&
      gradingReady &&
      !hasSolvedPuzzle &&
      !resumeAnalysis &&
      !introPending,
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
  }, [
    activePuzzleKey,
    attemptedPuzzleIdsReady,
    gradingReady,
    fen,
    hasSolvedPuzzle,
    introPending,
    puzzleVisitKey,
    resumeAnalysis,
    testMode,
  ]);

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

  const controlsReady =
    Boolean(fen) && !introPending && gradingReady && !progressSaving && !progressSaveError;
  const canGiveUp = controlsReady && sessionAccess.canGiveUp;
  const canRevealSolution = controlsReady && sessionAccess.canViewSolution;
  const solutionButtonTitle = isRetryFeedbackActive
    ? "Find the better move before viewing the solution."
    : hasAttemptedActivePuzzle
      ? "View the solution"
      : SOLUTION_UNLOCK_HINT;
  const feedback = puzzleSession.feedback;
  const currentRatingFeedback =
    attemptRatingFeedback?.puzzleId === activePuzzleKey ? attemptRatingFeedback : null;
  const displayedUserPuzzleRating = currentRatingFeedback
    ? currentRatingFeedback.userRatingAfter
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
    if (nextPuzzle) replaceUrlWithPuzzle(nextPuzzle.puzzleId);
  };

  const handlePreviousPuzzle = () => {
    if (canGoToPreviousPuzzle && previousPuzzle) replaceUrlWithPuzzle(previousPuzzle.puzzleId);
  };

  const { previousHint, nextHint, previousAria, nextAria } = useBoardItemShortcuts({
    onPrevious: canGoToPreviousPuzzle ? handlePreviousPuzzle : undefined,
    onNext: canGoToNextPuzzle ? handleNextPuzzle : undefined,
  });

  const revealSolution = (tab: "solution" | "explanation" = "solution") => {
    dispatchPuzzleSession({ type: "reveal-solution" });
    setActivePuzzleInfoTab(tab);
    setSolutionNavigation(null);
    if (isMobileLayout) {
      window.requestAnimationFrame(() => {
        boardPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  const handleSelectSolutionTab = () => {
    if (!canRevealSolution) return;
    if (showSolution) {
      setActivePuzzleInfoTab(null);
      setSolutionNavigation(null);
    } else if (canGiveUp) {
      handleGiveUp();
    } else {
      revealSolution();
    }
  };

  useEffect(() => {
    if (!resignArmed) return;
    const timer = window.setTimeout(() => setResignArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [resignArmed]);

  const handleGiveUp = () => {
    if (!canGiveUp) return;
    if (!resignArmed) {
      setResignArmed(true);
      return;
    }
    setResignArmed(false);

    const elapsedAtGiveUp =
      elapsedTimerStartedAtRef.current === null
        ? elapsedTimeMsRef.current
        : Math.max(0, window.performance.now() - elapsedTimerStartedAtRef.current);
    elapsedTimeMsRef.current = Math.min(elapsedAtGiveUp, MAX_PUZZLE_ATTEMPT_DURATION_MS);
    elapsedTimerStartedAtRef.current = null;
    setElapsedTimeMs(elapsedTimeMsRef.current);
    setElapsedTimerRunning(false);
    setPinnedSolutionLineIndex(0);
    if (!testMode) {
      enqueuePuzzleProgressWrite({
        puzzleId: activePuzzleKey,
        puzzleCorrect: false,
        attemptDurationMs: elapsedTimerExpiredRef.current ? null : Math.round(elapsedAtGiveUp),
        incorrectMove: null,
        correctMove: null,
        attemptPgn: boardState.attemptPgn || '[Result "*"]\n\n*',
        resigned: true,
      });
    }
    revealSolution(completionInfoTab);
  };

  const handleSelectOtherPuzzleAttemptsTab = () => {
    if (!isAnalysisMode) return;

    if (otherPuzzleAttemptsOpen) {
      if (otherPuzzleAttemptsStatus === "error") {
        void otherAttemptsQuery.refetch();
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
    if (!isAnalysisMode) return;

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
      const nextLine = nextBoardState.view.line;
      const previousLine = previousBoardSnapshot.view.line;
      const boardPositionChanged =
        previousBoardSnapshot.fen !== nextBoardState.fen ||
        previousBoardSnapshot.view.position !== nextBoardState.view.position ||
        previousLine.source !== nextLine.source ||
        (previousLine.source !== "history" &&
          nextLine.source === previousLine.source &&
          previousLine.index !== nextLine.index);
      const nextCompletionFeedback = buildCompletionFeedback(
        nextBoardState,
        currentSession.attempt === "wrong" || resumedMisses > 0,
      );
      const shouldShowTransientFeedback =
        nextCompletionFeedback !== null && nextLine.source !== "solution";

      setBoardState(nextBoardState);
      const inAnalysis = isPuzzleSessionInAnalysis(currentSession);
      if (shouldShowTransientFeedback || (!inAnalysis && boardPositionChanged)) {
        dispatchPuzzleSession({
          type: "board-feedback",
          feedback: shouldShowTransientFeedback ? nextCompletionFeedback : null,
        });
      }

      if (isMobileLayout) {
        if (shouldShowTransientFeedback) {
          showMobileFeedback(nextCompletionFeedback);
        } else if (!inAnalysis && boardPositionChanged) {
          setMobileFeedback(null);
        }
      }

      if (shouldShowTransientFeedback) {
        setFeedbackBadgeId((current) => current + 1);
      }

      if (
        currentSession.solutionRevealed &&
        previousLine.source === "solution" &&
        nextLine.source === "solution" &&
        previousLine.index !== nextLine.index
      ) {
        setPinnedSolutionLineIndex(nextLine.index);
      }

      previousBoardSnapshotRef.current = {
        fen: nextBoardState.fen,
        view: nextBoardState.view,
      };

      if (nextBoardState.feedback === "correct") {
        setSolutionNavigation(null);
      }
    },
    [resumedMisses, isMobileLayout, showMobileFeedback],
  );

  const handlePlaybackCommand = useCallback((command: PlaybackCommand): void => {
    setSolutionNavigation({ type: "command", command });
  }, []);

  const baseLineState = getBoardLineState(boardState);
  const currentAnalysisMoves = baseLineState.currentMoves;
  const viewedSolutionIndex =
    boardState.view.line.source === "solution" ? boardState.view.line.index : undefined;

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
        viewedSolutionIndex,
      ),
    [viewedSolutionIndex, pinnedSolutionLineIndex, sortedMatchingSolutionLineIndexes],
  );
  const activeSolutionLine = boardState.solutionLines?.[activeSolutionLineIndex] ?? [];
  const isOnSolutionPath =
    matchingSolutionLineIndexes.length > 0 &&
    activeSolutionLine.length >= currentAnalysisMoves.length;
  const variationLineState = getBoardLineState(boardState, {
    ...(boardState.view.line.source === "solution" ? { activeSolutionLineIndex } : {}),
  });
  const allVariationLines = variationLineState.lines;
  const activeVariationLineIndex = variationLineState.activeLineIndex;
  const analysisMoveEditing = useBoardMoveEditing({
    fen,
    lines: allVariationLines,
    lineTargets: variationLineState.lineTargets,
    disabled: !isAnalysisMode || progressSaving,
    onNavigate: (next) => {
      if (next.type === "loadPgn" || next.type === "reset")
        setAnalysisDocument({
          visit: puzzleVisitKey,
          pgn: next.type === "loadPgn" ? next.pgn : "",
        });
      setSolutionNavigation(next);
    },
  });

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
    if (baseLineState.activeLine.source === "custom" || baseLineState.beforeIntro) return;
    if (solutionNavigation) return;
    if (viewedSolutionIndex === activeSolutionLineIndex) return;

    setSolutionNavigation({
      type: "solution",
      line: activeSolutionLineIndex,
      ply: currentAnalysisMoves.length,
    });
  }, [
    activeSolutionLineIndex,
    baseLineState.activeLine.source,
    baseLineState.beforeIntro,
    viewedSolutionIndex,
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

  const playback =
    introPending ||
    blindPosition ||
    dailyLimitReached ||
    unratedMarkStatus.state === "saving" ||
    solutionNavigation?.type === "line"
      ? undefined
      : boardState.playback;

  useBoardWheelNavigation({
    boardPanelRef,
    canStepBack: boardShowsSolution && canRevealSolution && Boolean(playback?.previous),
    canStepForward: boardShowsSolution && canRevealSolution && Boolean(playback?.next),
    onNavigate: handlePlaybackCommand,
  });

  const terminalOutcome =
    boardState.winner ?? (boardState.status.toLowerCase() === "draw" ? "draw" : null);
  const startPuzzleDraft = () => {
    const leadIn = activePuzzle?.leadIn;
    const beforeIntro = baseLineState.beforeIntro;
    const positionMoves = beforeIntro
      ? (leadIn?.moves.slice(0, -1) ?? [])
      : [...(leadIn?.moves ?? []), ...currentAnalysisMoves];
    void navigate({
      to: "/analysis/$",
      params: { _splat: currentFen.replaceAll(" ", "_") },
      state: {
        puzzleDraft: {
          positionHistory: {
            positionInitialFen: leadIn?.beforeFen ?? (beforeIntro ? currentFen : fen),
            positionMoves,
          },
          returnTo: location.href,
          sourcePuzzleId: activePuzzleKey,
          analysis: {
            snapshot: snapshotBoardAnalysis(fen, boardState),
            ...(analysisDocument?.visit === puzzleVisitKey
              ? { editedSolution: analysisDocument.pgn }
              : {}),
          },
        },
      },
    });
  };

  const puzzleAnalysisPanel = (
    <PuzzleAnalysisPanel
      key={activePuzzleId ?? "empty"}
      initialFen={fen}
      currentFen={currentFen}
      analysisActive={isAnalysisMode}
      analysisActions={
        user?.username ? (
          <PuzzleComposerButton
            disabled={
              !currentFen || introPending || Boolean(terminalOutcome) || Boolean(solutionNavigation)
            }
            onClick={startPuzzleDraft}
          />
        ) : null
      }
      moveEditing={analysisMoveEditing}
      previousMove={introPending ? undefined : activePuzzle?.intro}
      beforePreviousMove={baseLineState.beforeIntro}
      terminalOutcome={terminalOutcome}
      lines={isAnalysisMode ? allVariationLines : []}
      moves={boardState.lineMoves ?? []}
      currentPly={baseLineState.currentPly}
      activeLineIndex={activeVariationLineIndex}
      onNavigate={(ply) => setSolutionNavigation({ type: "history", ply })}
      onSelectVariation={(lineIndex, moveIndex) => {
        dispatchPuzzleSession({ type: "reveal-solution" });
        handleVariationMoveClick(lineIndex, moveIndex);
      }}
      onCycleOptions={(command) => setSolutionNavigation({ type: "command", command })}
      onPlayLine={(ucis) => setSolutionNavigation({ type: "line", ucis })}
      onHoverMove={setAnalysisPreviewMove}
      onEngineMovesChange={setAnalysisEngineMoves}
      canGiveUp={canGiveUp}
      resignArmed={resignArmed}
      onGiveUp={handleGiveUp}
      playback={playback}
      onNavigateMoves={handlePlaybackCommand}
    />
  );

  const renderPuzzleInfoSection = (mobile = false) => (
    <PuzzleInfoSection
      mobile={mobile}
      lockedDetailsHint="Solve the puzzle or confirm resignation to view details."
      activeTab={activePuzzleInfoTab}
      solution={{
        canReveal: canGiveUp || canRevealSolution,
        canGiveUp,
        resignArmed,
        buttonTitle: canGiveUp
          ? resignArmed
            ? "Confirm resignation"
            : "Resign and reveal the solution"
          : solutionButtonTitle,
        mobileAnalysis: mobile ? puzzleAnalysisPanel : undefined,
        onToggle: canGiveUp ? handleGiveUp : handleSelectSolutionTab,
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
        canView: isAnalysisMode,
        puzzleKey: activePuzzleKey,
        status: otherPuzzleAttemptsStatus,
        rows: otherAttemptsQuery.data ?? [],
        correctOnly: correctAttemptsOnly,
        onCorrectOnlyChange: setCorrectAttemptsOnly,
        singleLineMove: singleLineFirstMove
          ? `${movePrefix(startingPlyFromFen(fen), true)}${singleLineFirstMove}`
          : null,
        onToggle: handleSelectOtherPuzzleAttemptsTab,
      }}
      comments={{
        canView: isAnalysisMode,
        puzzleId: activePuzzleId,
        onSelect: handleSelectCommentsTab,
      }}
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
    const ratingChange = currentRatingFeedback?.puzzleRatingChange;
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

    const ratingChange = currentRatingFeedback?.userRatingChange;
    const isRatingPreview = testMode && ratingChange !== undefined;
    const ratingLabel = isRatingPreview ? "Test rating" : "Your puzzle rating";
    const changeDirection =
      ratingChange === undefined ? "" : ratingChange >= 0 ? "positive" : "negative";
    const changeDescription =
      displayedUserPuzzleRating === null
        ? userPuzzleRatingQuery.isError
          ? "Your puzzle rating is unavailable"
          : "Loading your puzzle rating"
        : ratingChange === undefined
          ? `${ratingLabel} is ${displayedUserPuzzleRating}`
          : `${ratingLabel} is ${displayedUserPuzzleRating}, ${
              ratingChange >= 0 ? "increased" : "decreased"
            } by ${Math.abs(ratingChange)}`;

    return (
      <div
        className={`userPuzzleRating ${changeDirection} ${mobile ? "mobile" : ""}`.trim()}
        aria-label={changeDescription}
        aria-live="polite"
        aria-atomic="true"
      >
        <span>{isRatingPreview ? "Test rating" : "Your rating"}</span>
        <strong>{displayedUserPuzzleRating ?? "—"}</strong>
        {ratingChange !== undefined ? <small>{formatSignedDecimal(ratingChange)}</small> : null}
      </div>
    );
  };

  const puzzleTagVoting =
    activePuzzleId && (testMode ? normalizedUsername === PUZZLE_ADMIN_USERNAME : isAnalysisMode) ? (
      <PuzzleTagVotingPanel
        key={`${activePuzzleId}:${normalizedUsername}`}
        puzzleId={activePuzzleId}
        tags={activePuzzleTags}
        canVote={Boolean(normalizedUsername)}
      />
    ) : null;

  const markPuzzleUnrated = async (permanentlyUnrated: boolean) => {
    const puzzleId = activePuzzleKey;
    setUnratedMarkStatus({ state: "saving" });
    try {
      await setOwnPuzzlePermanentlyUnrated(puzzleId, permanentlyUnrated);
      setPermanentUnratedIds((current) =>
        permanentlyUnrated
          ? addValueToSet(current, puzzleId)
          : removeValueFromSet(current, puzzleId),
      );
      if (activePuzzleKeyRef.current === puzzleId) setUnratedMarkStatus({ state: "idle" });
    } catch (error) {
      if (activePuzzleKeyRef.current === puzzleId)
        setUnratedMarkStatus({
          state: "error",
          message: getErrorMessage(error, "Unable to mark puzzle unrated."),
        });
    }
  };

  const blindPuzzlePanel = blindPosition ? (
    <BlindPuzzlePanel
      key={activePuzzleId}
      leadIn={blindPosition}
      played={currentAnalysisMoves}
      error={boardState.error}
      canGiveUp={!isMobileLayout && canGiveUp}
      resignArmed={resignArmed}
      onGiveUp={handleGiveUp}
    />
  ) : null;

  const permanentUnratedControl =
    !testMode &&
    attemptedPuzzleIdsReady &&
    normalizedUsername === normalizedAuthor &&
    !hasPersistedAttempt &&
    (!hasSubmittedAttempt || permanentUnratedIds.has(activePuzzleKey)) ? (
      <label
        className="puzzleUnratedOption"
        title="Mark unrated if you remember this puzzle and don’t want it to affect your rating. You can change this before your first graded attempt. Practice attempts are not recorded."
      >
        <input
          type="checkbox"
          checked={permanentUnratedIds.has(activePuzzleKey)}
          disabled={
            hasSubmittedAttempt || hasUnratedAttempt || unratedMarkStatus.state === "saving"
          }
          onChange={(event) => void markPuzzleUnrated(event.target.checked)}
        />
        <span>Permanently unrated</span>
      </label>
    ) : null;

  const puzzleTitle = testMode
    ? activePuzzleId
      ? `Test puzzle ${activePuzzleId}`
      : "Puzzle test"
    : activePuzzleId
      ? `Puzzle ${activePuzzleId}`
      : "Puzzle";
  const boardReady = Boolean(
    fen && attemptedPuzzleIdsReady && gradingReady && (!blindPlies || blindEntryReady),
  );
  const puzzleLoading =
    !boardReady &&
    !dailyLimitReached &&
    !gradingQuery.isError &&
    Boolean(
      activePuzzleId || catalogLoading || !attemptedPuzzleIdsReady || waitingForAuthorAliases,
    );
  const displayError =
    loadingError ||
    (detailError && detailError.puzzleId === activePuzzleId ? detailError.message : "") ||
    (testPuzzleUnavailable
      ? "That puzzle is unavailable."
      : !blindPosition
        ? boardState.error
        : "");

  const issuePrompt =
    !testMode && hasAttemptedActivePuzzle ? (
      <p className="puzzleIssuePrompt">
        <button type="button" onClick={() => setReportIssueOpen(true)}>
          Report issue
        </button>
      </p>
    ) : null;
  const puzzleDiscussion = isAnalysisMode ? (
    <PuzzleCommunity
      puzzleId={activePuzzleId}
      voteTargetId={isMobileLayout ? "mobile-puzzle-vote-slot" : "desktop-puzzle-vote-slot"}
    />
  ) : null;

  return (
    <div className="page puzzlePage" data-board-resize="puzzle">
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
            {isAnalysisMode || showGradingEligibility || opaStyle ? (
              <div className="puzzleHeaderBadges">
                {isAnalysisMode ? renderPuzzleRating() : null}
                {showGradingEligibility ? (
                  <span
                    className="puzzleUnratedBadge"
                    tabIndex={0}
                    aria-label={gradingLabel}
                    aria-description={PUZZLE_GRADING_EXPLANATION}
                    data-tooltip={PUZZLE_GRADING_EXPLANATION}
                  >
                    {gradingLabel}
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
        {skipAttemptedPuzzles &&
        !isSetSolveMode &&
        !catalogLoading &&
        attemptedPuzzleIdsReady &&
        !waitingForAuthorAliases &&
        !dailyLimitReached &&
        !displayError &&
        !activePuzzleId ? (
          <p role="status">No new puzzles available.</p>
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

      <div className={`boardWrap${isMobileLayout ? "" : " puzzleBoardColumn"}`}>
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
            {boardReady ? (
              <Chessboard
                key={`${puzzleVisitKey}:${blindMode}`}
                intro={activePuzzle?.intro}
                autoplayIntro={autoplayIntro}
                blindFen={blindPosition?.beforeFen}
                onIntroEnd={handleIntroEnd}
                puzzleId={activePuzzleId}
                fen={fen}
                orientation={orientation}
                coordinates
                solution={
                  isAnalysisMode && analysisDocument?.visit === puzzleVisitKey
                    ? analysisDocument.pgn
                    : (activePuzzle?.solution ?? "")
                }
                solutionEditor={isAnalysisMode && analysisDocument?.visit === puzzleVisitKey}
                showSolution={boardShowsSolution}
                analysisMode={isAnalysisMode}
                disabled={
                  dailyLimitReached ||
                  unratedMarkStatus.state === "saving" ||
                  progressSaving ||
                  Boolean(progressSaveError)
                }
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
            ) : (
              <PuzzleBoardPlaceholder loading={puzzleLoading && !displayError} />
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
        {resumeAnalysis && puzzleDraftSubmission ? (
          <PuzzleCreationConfirmation result={puzzleDraftSubmission} />
        ) : null}
        {!isMobileLayout ? (
          <>
            {issuePrompt}
            {puzzleDiscussion}
          </>
        ) : null}
      </div>

      {!isMobileLayout ? (
        <div className="puzzleSolveRail">
          {blindPuzzlePanel ?? puzzleAnalysisPanel}
          {permanentUnratedControl}
          {progressSaveError || (!testMode && gradingQuery.error) ? (
            <p className="errorText" role="alert">
              {progressSaveError || "Unable to check grading eligibility. Please reload."}
              {progressSaveError && retryProgressWriteRef.current ? (
                <button
                  type="button"
                  disabled={progressSaving}
                  onClick={() => void retryProgressWriteRef.current?.()}
                >
                  Retry saving
                </button>
              ) : null}
            </p>
          ) : null}
          {unratedMarkStatus.state === "error" ? (
            <p className="errorText" role="alert">
              {unratedMarkStatus.message}
            </p>
          ) : null}
        </div>
      ) : (
        blindPuzzlePanel
      )}

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
                {isAnalysisMode ? renderPuzzleRating(true) : null}
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
              {showGradingEligibility ? (
                <span
                  className="puzzleUnratedBadge"
                  tabIndex={0}
                  aria-label={gradingLabel}
                  aria-description={PUZZLE_GRADING_EXPLANATION}
                  data-tooltip={PUZZLE_GRADING_EXPLANATION}
                >
                  {gradingLabel}
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
            {permanentUnratedControl}
            {progressSaveError || (!testMode && gradingQuery.error) ? (
              <p className="errorText" role="alert">
                {progressSaveError || "Unable to check grading eligibility. Please reload."}
                {progressSaveError && retryProgressWriteRef.current ? (
                  <button
                    type="button"
                    disabled={progressSaving}
                    onClick={() => void retryProgressWriteRef.current?.()}
                  >
                    Retry saving
                  </button>
                ) : null}
              </p>
            ) : null}
            {unratedMarkStatus.state === "error" ? (
              <p className="errorText" role="alert">
                {unratedMarkStatus.message}
              </p>
            ) : null}
            {puzzleTagVoting}
          </section>
          {!testMode && hasAttemptedActivePuzzle ? (
            <div id="mobile-puzzle-vote-slot" className="mobilePuzzleVoteSlot" />
          ) : null}
        </>
      ) : null}

      {isMobileLayout && (hasAttemptedActivePuzzle || canGiveUp || canManagePuzzleExplanation) ? (
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

      {isMobileLayout ? (
        <>
          {issuePrompt}
          {puzzleDiscussion}
        </>
      ) : null}
    </div>
  );
};
