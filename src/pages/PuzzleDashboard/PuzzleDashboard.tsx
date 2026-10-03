import "./PuzzleDashboard.css";

import {
  faArrowRotateRight,
  faArrowUpRightFromSquare,
  faClockRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { puzzleLevelLabel } from "../../../shared/domain/puzzles/puzzleRating";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { usePersistedState } from "../../hooks/usePersistedState";
import {
  fetchCustomPuzzleSetAttempts,
  listCustomPuzzleSets,
} from "../../lib/puzzles/customPuzzleSets";
import { createDashboardPuzzleSet } from "../../lib/puzzles/dashboardPuzzleSets";
import {
  puzzleCatalogQueryOptions,
  puzzleProgressForUserQueryOptions,
  puzzleQueryKeys,
  puzzleRatingEventsQueryOptions,
  puzzleUserRatingQueryOptions,
} from "../../lib/puzzles/puzzleQueries";
import { puzzleRatingFromRow, refreshPuzzleRatings } from "../../lib/puzzles/puzzleRating";
import { getPuzzleSetDisplayName } from "../../lib/puzzles/puzzleSets";
import { clearPuzzleRatingCaches } from "../../lib/supabase/puzzles";
import type { PuzzleRatingEvent } from "../../lib/supabase/puzzleUserRatings";
import { siteUserRegistrationQueryOptions } from "../../lib/users/userQueries";
import { normalizeUsername } from "../../utils/playerNames";
import { MonthlyAttemptsCalendar } from "./MonthlyAttemptsCalendar";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const DEFAULT_CREATED_PAGE_SIZE = 40;
const CREATED_PAGE_SIZE_OPTIONS = [40, 100, 500] as const;
const PAGE_SIZE_STORAGE_KEY = "atomic-puzzles.puzzle-dashboard-page-size";
const CREATED_PAGE_SIZE_STORAGE_KEY = "atomic-puzzles.puzzle-dashboard-created-page-size";
const FILTERS_STORAGE_KEY = "atomic-puzzles.puzzle-dashboard-filters.v1";
const UNKNOWN_EVENT_LABEL = "Unknown event";
const emptyPuzzleProgressRows: import("../../lib/supabase/puzzleProgress").PuzzleProgressRow[] = [];
type DashboardResultFilter = "all" | "correct" | "incorrect";
type DashboardTab = "attempts" | "created";
type RatingRefreshStatus =
  | { state: "idle" }
  | { state: "refreshing" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

const dashboardFiltersSchema = z.object({
  sinceDate: z.string(),
  untilDate: z.string(),
  resultFilter: z.enum(["all", "correct", "incorrect"]),
  eventFilter: z.string(),
  authorFilter: z.string(),
  searchFilter: z.string(),
  attemptSource: z.union([z.literal("first"), z.string().uuid()]),
  filtersOpen: z.boolean(),
});
type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = {
  sinceDate: "",
  untilDate: "",
  resultFilter: "all",
  eventFilter: "",
  authorFilter: "",
  searchFilter: "",
  attemptSource: "first",
  filtersOpen: false,
};

type PuzzleDashboardPageSize = (typeof PAGE_SIZE_OPTIONS)[number];
type CreatedPuzzlePageSize = (typeof CREATED_PAGE_SIZE_OPTIONS)[number];
const pageSizeSchema = z.union([z.literal(20), z.literal(50), z.literal(100)]);
const createdPageSizeSchema = z.union([z.literal(40), z.literal(100), z.literal(500)]);
const isPuzzleDashboardPageSize = (value: number): value is PuzzleDashboardPageSize =>
  PAGE_SIZE_OPTIONS.includes(value as PuzzleDashboardPageSize);
const isCreatedPuzzlePageSize = (value: number): value is CreatedPuzzlePageSize =>
  CREATED_PAGE_SIZE_OPTIONS.includes(value as CreatedPuzzlePageSize);

const formatDateTime = (value: string | number | Date | null | undefined): string => {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const buildDashboardEntries = (
  progressRows: import("../../lib/supabase/puzzleProgress").PuzzleProgressRow[],
  puzzlesById: Map<string, import("../../lib/puzzles/puzzleLibrary").Puzzle>,
  ratingEventsByPuzzleId: Map<string, PuzzleRatingEvent>,
): Array<{
  puzzleId: string;
  linkedPuzzleId: string | number;
  author: string;
  event: string;
  puzzleCorrect: boolean;
  firstAttemptAt: string;
  level: string;
  rating: number;
  userRatingAfter: number | null;
  userRatingChange: number | null;
  userRatingBefore: number | null;
}> =>
  progressRows.map((row) => {
    const puzzle = puzzlesById.get(String(row?.puzzle_id ?? "").trim()) || null;
    const author = String(puzzle?.["author"] ?? "").trim() || "Unknown";
    const event = puzzle ? getPuzzleSetDisplayName(puzzle) : UNKNOWN_EVENT_LABEL;
    const linkedPuzzleId = puzzle?.puzzleId ?? row?.puzzle_id;
    const puzzleRating = puzzleRatingFromRow(puzzle);
    const ratingEvent = ratingEventsByPuzzleId.get(String(row?.puzzle_id ?? "").trim()) ?? null;

    return {
      puzzleId: String(row?.puzzle_id ?? "").trim(),
      linkedPuzzleId,
      author,
      event,
      puzzleCorrect: Boolean(row?.puzzle_correct),
      firstAttemptAt: row?.first_attempt_at || "",
      level: puzzleLevelLabel(puzzleRating.level),
      rating: puzzleRating.rating,
      userRatingAfter: ratingEvent?.userRatingAfter ?? null,
      userRatingChange: ratingEvent?.userRatingChange ?? null,
      userRatingBefore: ratingEvent?.userRatingBefore ?? null,
    };
  });

const formatSignedRating = (value: number): string => `${value > 0 ? "+" : ""}${value}`;

const isKnownEvent = (event: string): boolean => event.trim() !== UNKNOWN_EVENT_LABEL;

export const PuzzleDashboardPage = ({ username = "" }: { username?: string | undefined }) => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user } = useAuth();
  const queryClient = useQueryClient();
  const routeUsername = useMemo(() => normalizeUsername(username), [username]);
  const viewingOwnDashboard = !routeUsername;
  const targetUsername = viewingOwnDashboard ? normalizeUsername(user?.username) : routeUsername;
  const [activeTab, setActiveTab] = useState<DashboardTab>("attempts");
  const [ratingRefreshStatus, setRatingRefreshStatus] = useState<RatingRefreshStatus>({
    state: "idle",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePersistedState<PuzzleDashboardPageSize>(
    PAGE_SIZE_STORAGE_KEY,
    pageSizeSchema,
    DEFAULT_PAGE_SIZE,
  );
  const [createdPageSize, setCreatedPageSize] = usePersistedState<CreatedPuzzlePageSize>(
    CREATED_PAGE_SIZE_STORAGE_KEY,
    createdPageSizeSchema,
    DEFAULT_CREATED_PAGE_SIZE,
  );
  const [dashboardFilters, setDashboardFilters] = usePersistedState<DashboardFilters>(
    FILTERS_STORAGE_KEY,
    dashboardFiltersSchema,
    DEFAULT_DASHBOARD_FILTERS,
  );
  const [calendarOpen, setCalendarOpen] = useState(true);
  const {
    sinceDate,
    untilDate,
    resultFilter,
    eventFilter,
    authorFilter,
    searchFilter,
    attemptSource,
    filtersOpen,
  } = dashboardFilters;
  const updateDashboardFilter = <Key extends keyof DashboardFilters>(
    key: Key,
    value: DashboardFilters[Key],
  ): void => {
    setDashboardFilters((current) => ({ ...current, [key]: value }));
  };
  const accessQuery = useQuery({
    ...siteUserRegistrationQueryOptions(targetUsername),
    enabled: Boolean(targetUsername),
  });
  const canViewDashboard = accessQuery.data ?? false;
  const puzzleCatalogQuery = useQuery(puzzleCatalogQueryOptions());
  const progressQuery = useQuery({
    ...puzzleProgressForUserQueryOptions(targetUsername),
    enabled: Boolean(targetUsername) && canViewDashboard,
  });
  const userRatingQuery = useQuery({
    ...puzzleUserRatingQueryOptions(targetUsername),
    enabled: Boolean(targetUsername) && canViewDashboard,
  });
  const ratingEventsQuery = useQuery({
    ...puzzleRatingEventsQueryOptions(targetUsername),
    enabled: Boolean(targetUsername) && canViewDashboard,
  });
  const customSetsQuery = useQuery({
    queryKey: ["custom-puzzle-sets"],
    queryFn: listCustomPuzzleSets,
    enabled: viewingOwnDashboard && isAuthenticated && canViewDashboard,
  });
  const activeAttemptSource = viewingOwnDashboard ? attemptSource : "first";
  const selectedCustomSetId = activeAttemptSource === "first" ? "" : activeAttemptSource;
  const selectedCustomSetIsAvailable = Boolean(
    selectedCustomSetId &&
    (customSetsQuery.data ?? []).some((set) => set.id === selectedCustomSetId),
  );
  const customSetAttemptsQuery = useQuery({
    queryKey: ["custom-puzzle-sets", selectedCustomSetId, "attempts"],
    queryFn: () => fetchCustomPuzzleSetAttempts(selectedCustomSetId),
    enabled: Boolean(
      viewingOwnDashboard && isAuthenticated && canViewDashboard && selectedCustomSetIsAvailable,
    ),
  });
  const progressRows = selectedCustomSetId
    ? (customSetAttemptsQuery.data ?? []).map((attempt) => ({
        puzzle_id: attempt.puzzleId,
        first_attempt_at: attempt.attemptedAt,
        puzzle_correct: attempt.puzzleCorrect,
        incorrect_move: null,
        correct_move: null,
      }))
    : (progressQuery.data ?? emptyPuzzleProgressRows);
  const puzzlesById = useMemo(
    () =>
      new Map(
        (puzzleCatalogQuery.data ?? []).map((puzzle) => [
          String(puzzle?.puzzleId ?? "").trim(),
          puzzle,
        ]),
      ),
    [puzzleCatalogQuery.data],
  );
  const isDashboardLoading = selectedCustomSetId
    ? customSetsQuery.isFetching || customSetAttemptsQuery.isFetching
    : progressQuery.isFetching || userRatingQuery.isFetching || ratingEventsQuery.isFetching;
  const arePuzzlesLoading = puzzleCatalogQuery.isFetching;
  const isAccessCheckLoading = Boolean(targetUsername) && accessQuery.isPending;
  const queryError =
    accessQuery.error ??
    puzzleCatalogQuery.error ??
    progressQuery.error ??
    userRatingQuery.error ??
    ratingEventsQuery.error ??
    customSetsQuery.error ??
    customSetAttemptsQuery.error;
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : "Failed to load the puzzle dashboard."
    : "";

  useEffect(() => {
    setCurrentPage(1);
  }, [
    activeTab,
    authorFilter,
    activeAttemptSource,
    createdPageSize,
    eventFilter,
    pageSize,
    resultFilter,
    searchFilter,
    sinceDate,
    targetUsername,
    untilDate,
  ]);

  useEffect(() => {
    if (
      !viewingOwnDashboard ||
      attemptSource === "first" ||
      !customSetsQuery.isSuccess ||
      (customSetsQuery.data ?? []).some((set) => set.id === attemptSource)
    ) {
      return;
    }
    setDashboardFilters((current) => ({ ...current, attemptSource: "first" }));
  }, [
    attemptSource,
    customSetsQuery.data,
    customSetsQuery.isSuccess,
    setDashboardFilters,
    viewingOwnDashboard,
  ]);

  const allDashboardEntries = useMemo(() => {
    const ratingEventsByPuzzleId = new Map(
      (activeAttemptSource === "first" ? (ratingEventsQuery.data ?? []) : []).map((event) => [
        event.puzzleId,
        event,
      ]),
    );
    return buildDashboardEntries(progressRows, puzzlesById, ratingEventsByPuzzleId);
  }, [activeAttemptSource, progressRows, puzzlesById, ratingEventsQuery.data]);
  const eventOptions = useMemo(
    () =>
      [...new Set(allDashboardEntries.map((entry) => entry.event).filter(isKnownEvent))].sort(
        (left, right) => left.localeCompare(right, undefined, { numeric: true }),
      ),
    [allDashboardEntries],
  );
  const authorOptions = useMemo(
    () =>
      [...new Set(allDashboardEntries.map((entry) => entry.author))].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      ),
    [allDashboardEntries],
  );
  const filteredDashboardEntries = useMemo(() => {
    const normalizedSearch = searchFilter.trim().toLocaleLowerCase();
    const sinceTimestamp = sinceDate ? new Date(`${sinceDate}T00:00:00`).getTime() : null;
    const untilTimestamp = untilDate ? new Date(`${untilDate}T23:59:59.999`).getTime() : null;

    return allDashboardEntries.filter((entry) => {
      if (resultFilter === "correct" && !entry.puzzleCorrect) return false;
      if (resultFilter === "incorrect" && entry.puzzleCorrect) return false;
      if (eventFilter && entry.event !== eventFilter) return false;
      if (authorFilter && entry.author !== authorFilter) return false;
      const attemptTimestamp = new Date(entry.firstAttemptAt).getTime();
      if (sinceTimestamp !== null && attemptTimestamp < sinceTimestamp) return false;
      if (untilTimestamp !== null && attemptTimestamp > untilTimestamp) return false;

      if (normalizedSearch) {
        const searchableText =
          `${entry.puzzleId} ${entry.author} ${entry.event}`.toLocaleLowerCase();
        if (!searchableText.includes(normalizedSearch)) return false;
      }

      return true;
    });
  }, [
    allDashboardEntries,
    authorFilter,
    eventFilter,
    resultFilter,
    searchFilter,
    sinceDate,
    untilDate,
  ]);
  const dashboardSummary = useMemo(() => {
    const correct = filteredDashboardEntries.filter((entry) => entry.puzzleCorrect).length;
    return {
      total: filteredDashboardEntries.length,
      correct,
      incorrect: filteredDashboardEntries.length - correct,
    };
  }, [filteredDashboardEntries]);
  const totalProgressRows = filteredDashboardEntries.length;
  const attemptTotalPages = Math.max(1, Math.ceil(totalProgressRows / pageSize));
  const dashboardEntries = useMemo(
    () => filteredDashboardEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredDashboardEntries, pageSize],
  );
  const accuracy =
    dashboardSummary.total > 0
      ? Math.round((dashboardSummary.correct / dashboardSummary.total) * 100)
      : 0;
  const createdPuzzles = useMemo(
    () =>
      [...puzzlesById.values()]
        .filter((puzzle) => normalizeUsername(puzzle?.["author"]) === targetUsername)
        .sort((left, right) => right.puzzleId - left.puzzleId),
    [puzzlesById, targetUsername],
  );
  const attemptedPuzzleIds = useMemo(
    () =>
      new Set((progressQuery.data ?? emptyPuzzleProgressRows).map((row) => String(row.puzzle_id))),
    [progressQuery.data],
  );
  const puzzlesCreated = createdPuzzles.length;
  const createdTotalPages = Math.max(1, Math.ceil(puzzlesCreated / createdPageSize));
  const createdPuzzleEntries = useMemo(
    () => createdPuzzles.slice((currentPage - 1) * createdPageSize, currentPage * createdPageSize),
    [createdPageSize, createdPuzzles, currentPage],
  );
  const isPageLoading = isDashboardLoading || arePuzzlesLoading;
  const areStatsLoading = isDashboardLoading || arePuzzlesLoading;
  const firstRowNumber = totalProgressRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const seoTitle = viewingOwnDashboard
    ? "Puzzle Dashboard"
    : `${targetUsername} : Puzzle Dashboard`;
  const seoDescription = viewingOwnDashboard
    ? "Review your first recorded puzzle attempts, stats, and links back into every puzzle."
    : `Review ${targetUsername}'s recorded puzzle attempts, stats, and links back into every puzzle.`;
  const seoPath = viewingOwnDashboard
    ? "/dashboard"
    : `/@/${encodeURIComponent(targetUsername)}/puzzles`;
  const emptyText = viewingOwnDashboard
    ? "No puzzle dashboard entries yet."
    : `No recorded puzzle dashboard entries for ${targetUsername} yet.`;
  const emptyLinkLabel = viewingOwnDashboard ? "Solve your first puzzle" : "Open player profile";
  const backLinkTo = viewingOwnDashboard ? "/solve" : "/@/$username";
  const backLinkParams = viewingOwnDashboard ? undefined : { username: targetUsername };
  const backLinkLabel = viewingOwnDashboard ? "Back to puzzle solver" : "Back to profile";
  const needsLoginForOwnDashboard = viewingOwnDashboard && !isLoading && !isAuthenticated;
  const isCheckingAccess = isLoading || isAccessCheckLoading;
  const isRegisteredViewer = Boolean(targetUsername) && canViewDashboard;
  const shouldHideDashboard =
    !needsLoginForOwnDashboard && !error && !isCheckingAccess && !isRegisteredViewer;
  const unavailableMessage = viewingOwnDashboard
    ? "The puzzle dashboard is only available for registered site users."
    : `${targetUsername} does not have a registered site account yet, so the puzzle dashboard is hidden.`;
  const heroTitle = viewingOwnDashboard
    ? "My Puzzle Dashboard"
    : `${targetUsername}'s Puzzle Dashboard`;
  const canRefreshRatings =
    viewingOwnDashboard && normalizeUsername(user?.username) === "seaside_tiramisu";
  const handleRefreshRatings = async (): Promise<void> => {
    if (!canRefreshRatings || ratingRefreshStatus.state === "refreshing") return;

    setRatingRefreshStatus({ state: "refreshing" });
    try {
      await refreshPuzzleRatings();
      clearPuzzleRatingCaches();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: puzzleQueryKeys.catalog }),
        queryClient.invalidateQueries({ queryKey: puzzleQueryKeys.userRating }),
        queryClient.invalidateQueries({ queryKey: puzzleQueryKeys.ratingEvents }),
      ]);
      setRatingRefreshStatus({ state: "success", message: "Ratings refreshed." });
    } catch (refreshError) {
      setRatingRefreshStatus({
        state: "error",
        message:
          refreshError instanceof Error ? refreshError.message : "Unable to refresh ratings.",
      });
    }
  };
  const hasActiveFilters = Boolean(
    activeAttemptSource !== "first" ||
    sinceDate ||
    untilDate ||
    resultFilter !== "all" ||
    eventFilter ||
    authorFilter ||
    searchFilter.trim(),
  );
  const clearFilters = (): void => {
    setDashboardFilters((current) => ({
      ...DEFAULT_DASHBOARD_FILTERS,
      filtersOpen: current.filtersOpen,
    }));
  };
  const handleSolveAsSet = (): void => {
    const set = createDashboardPuzzleSet(
      filteredDashboardEntries.map((entry) => entry.linkedPuzzleId),
      targetUsername,
    );
    const firstPuzzleId = set?.puzzleIds[0];
    if (!set || firstPuzzleId === undefined) return;

    void navigate({
      to: "/solve/dashboard/$dashboardSetId/$puzzleId",
      params: { dashboardSetId: set.id, puzzleId: String(firstPuzzleId) },
    });
  };
  if (isCheckingAccess || (isRegisteredViewer && isPageLoading && dashboardEntries.length === 0)) {
    return <RouteLoadingFallback />;
  }

  return (
    <div className="puzzleDashboardPage">
      <Seo title={seoTitle} description={seoDescription} path={seoPath} />
      <div className="puzzleDashboardShell">
        <header className="dashboardHero">
          <div className="dashboardHeroTop">
            <div className="dashboardHeroCopy">
              <h1>{heroTitle}</h1>
            </div>
            <div className="dashboardHeroLinks" aria-label="Puzzle dashboard links">
              <Link className="puzzleDashboardActionLink primary" to="/solve">
                <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
                <span>Solve puzzles</span>
              </Link>
              <Link className="puzzleDashboardActionLink" to="/solve/custom-sets">
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
                <span>Custom sets</span>
              </Link>
              {!viewingOwnDashboard ? (
                <Link className="puzzleDashboardActionLink" to={backLinkTo} params={backLinkParams}>
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
                  <span>{backLinkLabel}</span>
                </Link>
              ) : null}
              {canRefreshRatings ? (
                <button
                  type="button"
                  className="puzzleDashboardActionLink puzzleDashboardActionButton"
                  onClick={() => void handleRefreshRatings()}
                  disabled={ratingRefreshStatus.state === "refreshing"}
                >
                  <FontAwesomeIcon icon={faArrowRotateRight} aria-hidden="true" />
                  <span>
                    {ratingRefreshStatus.state === "refreshing"
                      ? "Refreshing ratings…"
                      : "Refresh ratings"}
                  </span>
                </button>
              ) : null}
            </div>
            {canRefreshRatings &&
            (ratingRefreshStatus.state === "success" || ratingRefreshStatus.state === "error") ? (
              <p
                className={`dashboardRatingRefreshStatus ${ratingRefreshStatus.state}`}
                role={ratingRefreshStatus.state === "error" ? "alert" : "status"}
              >
                {ratingRefreshStatus.message}
              </p>
            ) : null}
          </div>
        </header>

        {needsLoginForOwnDashboard ? (
          <div className="dashboardStateCard">
            <p>Log in with Lichess to view your puzzle dashboard.</p>
            <Link className="puzzleDashboardActionLink primary" to="/solve">
              <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
              Go to puzzles
            </Link>
          </div>
        ) : null}
        {!needsLoginForOwnDashboard && error ? (
          <div className="dashboardStateCard dashboardErrorText">{error}</div>
        ) : null}
        {shouldHideDashboard ? (
          <div className="dashboardStateCard">
            <p>{unavailableMessage}</p>
            <Link className="puzzleDashboardActionLink" to={backLinkTo} params={backLinkParams}>
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
              {backLinkLabel}
            </Link>
          </div>
        ) : null}

        {!needsLoginForOwnDashboard && !error && !isCheckingAccess && isRegisteredViewer ? (
          <>
            <section className="dashboardOverview" aria-label="Puzzle dashboard summary">
              <article
                className="dashboardRatingSummary"
                title={
                  userRatingQuery.data
                    ? `Rating deviation ${userRatingQuery.data.ratingDeviation} · ${userRatingQuery.data.attempts} rated attempts`
                    : "No rated attempts yet"
                }
              >
                <span className="dashboardOverviewLabel">Rating</span>
                <div className="dashboardRatingReading">
                  <strong>{areStatsLoading ? "…" : (userRatingQuery.data?.rating ?? 2000)}</strong>
                  <span>
                    {areStatsLoading
                      ? "Calculating"
                      : `RD ${userRatingQuery.data?.ratingDeviation ?? 350}`}
                  </span>
                </div>
              </article>

              <article className="dashboardPerformanceSummary">
                <div className="dashboardPerformanceHeading">
                  <span className="dashboardOverviewLabel">Accuracy</span>
                  <strong>{areStatsLoading ? "…" : `${accuracy}%`}</strong>
                </div>
                <div
                  className="dashboardAccuracyTrack"
                  role="progressbar"
                  aria-label="Puzzle accuracy"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={areStatsLoading ? undefined : accuracy}
                >
                  <span style={{ width: areStatsLoading ? "0%" : `${accuracy}%` }} />
                </div>
                <dl className="dashboardPerformanceBreakdown">
                  <div>
                    <dt>Attempts</dt>
                    <dd>{areStatsLoading ? "…" : dashboardSummary.total}</dd>
                  </div>
                  <div className="correct">
                    <dt>Correct</dt>
                    <dd>{areStatsLoading ? "…" : dashboardSummary.correct}</dd>
                  </div>
                  <div className="incorrect">
                    <dt>Missed</dt>
                    <dd>{areStatsLoading ? "…" : dashboardSummary.incorrect}</dd>
                  </div>
                </dl>
              </article>

              <article className="dashboardCreatedSummary">
                <span className="dashboardOverviewLabel">Created</span>
                <strong>{areStatsLoading ? "…" : puzzlesCreated}</strong>
              </article>
            </section>

            <div className="dashboardTabs" role="tablist" aria-label="Puzzle dashboard views">
              <button
                id="dashboard-attempts-tab"
                type="button"
                role="tab"
                aria-selected={activeTab === "attempts"}
                aria-controls="dashboard-attempts-panel"
                className={activeTab === "attempts" ? "active" : ""}
                onClick={() => setActiveTab("attempts")}
              >
                <span>History</span>
                <small>{areStatsLoading ? "…" : dashboardSummary.total}</small>
              </button>
              <button
                id="dashboard-created-tab"
                type="button"
                role="tab"
                aria-selected={activeTab === "created"}
                aria-controls="dashboard-created-panel"
                className={activeTab === "created" ? "active" : ""}
                onClick={() => setActiveTab("created")}
              >
                <span>Created</span>
                <small>{areStatsLoading ? "…" : puzzlesCreated}</small>
              </button>
            </div>

            <section
              id="dashboard-attempts-panel"
              className="dashboardAttempts"
              role="tabpanel"
              aria-labelledby="dashboard-attempts-tab"
              hidden={activeTab !== "attempts"}
            >
              <div className="dashboardAttemptsHeader">
                <div className="dashboardAttemptsTitleRow">
                  <h2>Attempt history</h2>
                  <div className="dashboardAttemptsActions">
                    <button
                      type="button"
                      className="dashboardCalendarToggle"
                      onClick={() => setCalendarOpen((current) => !current)}
                      aria-expanded={calendarOpen}
                      aria-controls="dashboard-attempt-calendar"
                    >
                      {calendarOpen ? "Hide calendar" : "Show calendar"}
                    </button>
                    <button
                      type="button"
                      className="dashboardFilterToggle"
                      onClick={() => updateDashboardFilter("filtersOpen", !filtersOpen)}
                      aria-expanded={filtersOpen}
                      aria-controls="dashboard-attempt-filters"
                    >
                      {filtersOpen ? "Hide filters" : "Show filters"}
                    </button>
                  </div>
                </div>
                {filtersOpen ? (
                  <div
                    id="dashboard-attempt-filters"
                    className="dashboardFilters"
                    aria-label="Filter puzzle attempts"
                  >
                    {viewingOwnDashboard ? (
                      <label className="dashboardFilterField dashboardFilterSearch">
                        <span>Attempts from</span>
                        <select
                          value={attemptSource}
                          onChange={(event) =>
                            updateDashboardFilter("attemptSource", event.target.value)
                          }
                          disabled={isPageLoading || customSetsQuery.isFetching}
                        >
                          <option value="first">First attempts</option>
                          {(customSetsQuery.data ?? []).map((set) => (
                            <option key={set.id} value={set.id}>
                              {set.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="dashboardFilterField dashboardFilterSearch">
                      <span>Search</span>
                      <input
                        type="search"
                        placeholder="Puzzle, author, or event"
                        value={searchFilter}
                        onChange={(event) =>
                          updateDashboardFilter("searchFilter", event.target.value)
                        }
                        disabled={isPageLoading}
                      />
                    </label>
                    <label className="dashboardFilterField">
                      <span>Result</span>
                      <select
                        value={resultFilter}
                        onChange={(event) =>
                          updateDashboardFilter(
                            "resultFilter",
                            event.target.value as DashboardResultFilter,
                          )
                        }
                        disabled={isPageLoading}
                      >
                        <option value="all">Correct + incorrect</option>
                        <option value="correct">Correct only</option>
                        <option value="incorrect">Incorrect only</option>
                      </select>
                    </label>
                    <label className="dashboardFilterField">
                      <span>Event</span>
                      <select
                        value={eventFilter}
                        onChange={(event) =>
                          updateDashboardFilter("eventFilter", event.target.value)
                        }
                        disabled={isPageLoading}
                      >
                        <option value="">All events</option>
                        {eventOptions.map((eventName) => (
                          <option key={eventName} value={eventName}>
                            {eventName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="dashboardFilterField">
                      <span>Author</span>
                      <select
                        value={authorFilter}
                        onChange={(event) =>
                          updateDashboardFilter("authorFilter", event.target.value)
                        }
                        disabled={isPageLoading}
                      >
                        <option value="">All authors</option>
                        {authorOptions.map((authorName) => (
                          <option key={authorName} value={authorName}>
                            {authorName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="dashboardFilterField">
                      <span>From</span>
                      <input
                        type="date"
                        value={sinceDate}
                        max={untilDate || undefined}
                        onChange={(event) => updateDashboardFilter("sinceDate", event.target.value)}
                        disabled={isPageLoading}
                      />
                    </label>
                    <label className="dashboardFilterField">
                      <span>To</span>
                      <input
                        type="date"
                        value={untilDate}
                        min={sinceDate || undefined}
                        onChange={(event) => updateDashboardFilter("untilDate", event.target.value)}
                        disabled={isPageLoading}
                      />
                    </label>
                    <button
                      type="button"
                      className="dashboardClearFilters"
                      onClick={clearFilters}
                      disabled={!hasActiveFilters || isPageLoading}
                    >
                      Clear filters
                    </button>
                  </div>
                ) : null}
                {calendarOpen ? (
                  <div id="dashboard-attempt-calendar">
                    <MonthlyAttemptsCalendar attempts={filteredDashboardEntries} />
                  </div>
                ) : null}
                <div className="dashboardAttemptsPager">
                  <label className="dashboardFilterLabel">
                    <span>Rows</span>
                    <select
                      value={pageSize}
                      onChange={(event) => {
                        const nextPageSize = Number.parseInt(event.target.value, 10);
                        if (isPuzzleDashboardPageSize(nextPageSize)) {
                          setPageSize(nextPageSize);
                        }
                      }}
                      disabled={isPageLoading}
                    >
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="puzzleDashboardActionLink primary dashboardStartSetButton"
                    onClick={handleSolveAsSet}
                    disabled={isPageLoading || filteredDashboardEntries.length === 0}
                  >
                    <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
                    Solve as set
                  </button>
                  <PaginationRow
                    currentPage={currentPage}
                    totalPages={attemptTotalPages}
                    onPageChange={setCurrentPage}
                    formatLabel={(current, total) => `Page ${current} / ${total}`}
                    disabled={isPageLoading}
                  />
                </div>
              </div>

              {dashboardEntries.length > 0 ? (
                <div className="dashboardAttemptTable">
                  <div className="dashboardAttemptHeader" aria-hidden="true">
                    <span>#</span>
                    <span>Puzzle</span>
                    <span>Puzzle rating</span>
                    <span>Rating</span>
                    <span>Attempted</span>
                  </div>
                  <div className="dashboardAttemptRows" role="list" aria-label="Puzzle dashboard">
                    {dashboardEntries.map((entry, index) => (
                      <article
                        key={`${entry.puzzleId}-${entry.firstAttemptAt}`}
                        className={`dashboardAttemptRow ${
                          entry.puzzleCorrect ? "correct" : "incorrect"
                        }`}
                        role="listitem"
                      >
                        <span className="dashboardRowNumber" aria-hidden="true">
                          {firstRowNumber + index}
                        </span>
                        <Link
                          className="dashboardPuzzleLink"
                          to="/solve/$puzzleId"
                          params={{ puzzleId: String(entry.linkedPuzzleId) }}
                        >
                          Puzzle {entry.linkedPuzzleId}
                        </Link>
                        <div className="dashboardPuzzleSubline">
                          <span className="dashboardPuzzleRating">{entry.rating}</span>
                          <span className="dashboardPuzzleLevel">{entry.level}</span>
                        </div>
                        <span
                          className={`dashboardRatingChange ${
                            entry.userRatingChange === null
                              ? "unrated"
                              : entry.userRatingChange >= 0
                                ? "positive"
                                : "negative"
                          }`}
                          title={
                            entry.userRatingBefore === null || entry.userRatingAfter === null
                              ? undefined
                              : `${entry.userRatingBefore} → ${entry.userRatingAfter}`
                          }
                        >
                          {entry.userRatingAfter === null || entry.userRatingChange === null ? (
                            "—"
                          ) : (
                            <>
                              <strong>{entry.userRatingAfter}</strong>
                              <small>{formatSignedRating(entry.userRatingChange)}</small>
                            </>
                          )}
                        </span>
                        <time className="dashboardMetaValue" dateTime={entry.firstAttemptAt}>
                          {formatDateTime(entry.firstAttemptAt)}
                        </time>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="dashboardStateCard">
                  <p>{hasActiveFilters ? "No puzzle attempts match these filters." : emptyText}</p>
                  {hasActiveFilters ? (
                    <button type="button" className="dashboardClearFilters" onClick={clearFilters}>
                      Clear filters
                    </button>
                  ) : (
                    <Link
                      className="puzzleDashboardActionLink primary"
                      to={backLinkTo}
                      params={backLinkParams}
                    >
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
                      {emptyLinkLabel}
                    </Link>
                  )}
                </div>
              )}

              {dashboardEntries.length > 0 ? (
                <div className="dashboardAttemptsFooter">
                  <PaginationRow
                    currentPage={currentPage}
                    totalPages={attemptTotalPages}
                    onPageChange={setCurrentPage}
                    formatLabel={(current, total) => `Page ${current} / ${total}`}
                    disabled={isPageLoading}
                  />
                </div>
              ) : null}
            </section>

            <section
              id="dashboard-created-panel"
              className="dashboardAttempts"
              role="tabpanel"
              aria-labelledby="dashboard-created-tab"
              hidden={activeTab !== "created"}
            >
              <div className="dashboardAttemptsHeader">
                <div className="dashboardAttemptsTitleRow">
                  <div>
                    <h2>Created puzzles</h2>
                  </div>
                </div>
                {createdPuzzleEntries.length > 0 ? (
                  <div className="dashboardAttemptsPager">
                    <label className="dashboardFilterLabel">
                      <span>Per page</span>
                      <select
                        aria-label="Puzzles per page"
                        value={createdPageSize}
                        onChange={(event) => {
                          const nextPageSize = Number.parseInt(event.target.value, 10);
                          if (isCreatedPuzzlePageSize(nextPageSize)) {
                            setCreatedPageSize(nextPageSize);
                          }
                        }}
                        disabled={isPageLoading}
                      >
                        {CREATED_PAGE_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <PaginationRow
                      currentPage={currentPage}
                      totalPages={createdTotalPages}
                      onPageChange={setCurrentPage}
                      formatLabel={(current, total) => `Page ${current} / ${total}`}
                      disabled={isPageLoading}
                    />
                  </div>
                ) : null}
              </div>

              {createdPuzzleEntries.length > 0 ? (
                <ol className="dashboardCreatedGrid" aria-label="Puzzles created">
                  {createdPuzzleEntries.map((puzzle) => (
                    <li key={puzzle.puzzleId}>
                      <Link
                        className="dashboardCreatedPuzzleLink"
                        to="/solve/$puzzleId"
                        params={{ puzzleId: String(puzzle.puzzleId) }}
                      >
                        <span>Puzzle {puzzle.puzzleId}</span>
                        {attemptedPuzzleIds.has(String(puzzle.puzzleId)) ? (
                          <small>
                            {puzzleLevelLabel(puzzleRatingFromRow(puzzle).level)} ·
                            {puzzleRatingFromRow(puzzle).rating}
                          </small>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="dashboardStateCard">
                  <p>No puzzles created yet.</p>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
};
