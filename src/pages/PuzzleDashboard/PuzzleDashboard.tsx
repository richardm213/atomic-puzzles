import "./PuzzleDashboard.css";

import { faArrowUpRightFromSquare, faClockRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { usePersistedState } from "../../hooks/usePersistedState";
import { createCustomPuzzleSet } from "../../lib/puzzles/customPuzzleSets";
import {
  puzzleCatalogQueryOptions,
  puzzleProgressForUserQueryOptions,
} from "../../lib/puzzles/puzzleQueries";
import { normalizePuzzleEventName } from "../../lib/puzzles/puzzleSets";
import { isRegisteredSiteUser } from "../../lib/supabase/supabaseUsers";
import { normalizeUsername } from "../../utils/playerNames";
import { DashboardTagFilter, getPuzzleTagName } from "./DashboardTagFilter";
import { entryMatchesSelectedTags } from "./puzzleDashboardTags";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const PAGE_SIZE_STORAGE_KEY = "atomic-puzzles.puzzle-dashboard-page-size";
const UNKNOWN_EVENT_LABEL = "Unknown event";
const emptyPuzzleProgressRows: import("../../lib/supabase/supabasePuzzleProgress").PuzzleProgressRow[] =
  [];
type DashboardResultFilter = "all" | "correct" | "incorrect";

type PuzzleDashboardPageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const pageSizeSchema = z.union([z.literal(20), z.literal(50), z.literal(100)]);
const isPuzzleDashboardPageSize = (value: number): value is PuzzleDashboardPageSize =>
  PAGE_SIZE_OPTIONS.includes(value as PuzzleDashboardPageSize);

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
  progressRows: import("../../lib/supabase/supabasePuzzleProgress").PuzzleProgressRow[],
  puzzlesById: Map<string, import("../../lib/puzzles/puzzleLibrary").Puzzle>,
): Array<{
  puzzleId: string;
  linkedPuzzleId: string | number;
  author: string;
  event: string;
  tags: string[];
  puzzleCorrect: boolean;
  firstAttemptAt: string;
}> =>
  progressRows.map((row) => {
    const puzzle = puzzlesById.get(String(row?.puzzle_id ?? "").trim()) || null;
    const author = String(puzzle?.["author"] ?? "").trim() || "Unknown";
    const event = normalizePuzzleEventName(puzzle?.["event"]);
    const linkedPuzzleId = puzzle?.puzzleId ?? row?.puzzle_id;

    return {
      puzzleId: String(row?.puzzle_id ?? "").trim(),
      linkedPuzzleId,
      author,
      event,
      tags: puzzle?.tags ?? [],
      puzzleCorrect: Boolean(row?.puzzle_correct),
      firstAttemptAt: row?.first_attempt_at || "",
    };
  });

const resultLabel = (isCorrect: boolean): string => (isCorrect ? "Correct" : "Incorrect");

const isKnownEvent = (event: string): boolean => event.trim() !== UNKNOWN_EVENT_LABEL;

export const PuzzleDashboardPage = ({ username = "" }: { username?: string | undefined }) => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user } = useAuth();
  const routeUsername = useMemo(() => normalizeUsername(username), [username]);
  const viewingOwnDashboard = !routeUsername;
  const targetUsername = viewingOwnDashboard ? normalizeUsername(user?.username) : routeUsername;
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = usePersistedState<PuzzleDashboardPageSize>(
    PAGE_SIZE_STORAGE_KEY,
    pageSizeSchema,
    DEFAULT_PAGE_SIZE,
  );
  const [sinceDate, setSinceDate] = useState("");
  const [untilDate, setUntilDate] = useState("");
  const [resultFilter, setResultFilter] = useState<DashboardResultFilter>("all");
  const [eventFilter, setEventFilter] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const accessQuery = useQuery({
    queryKey: ["users", targetUsername, "registered"],
    queryFn: () => isRegisteredSiteUser(targetUsername),
    enabled: Boolean(targetUsername),
    staleTime: 5 * 60 * 1_000,
  });
  const canViewDashboard = accessQuery.data ?? false;
  const puzzleCatalogQuery = useQuery(puzzleCatalogQueryOptions());
  const progressQuery = useQuery({
    ...puzzleProgressForUserQueryOptions(targetUsername),
    enabled: Boolean(targetUsername) && canViewDashboard,
  });
  const progressRows = progressQuery.data ?? emptyPuzzleProgressRows;
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
  const isDashboardLoading = progressQuery.isFetching;
  const arePuzzlesLoading = puzzleCatalogQuery.isFetching;
  const isAccessCheckLoading = Boolean(targetUsername) && accessQuery.isPending;
  const queryError = accessQuery.error ?? puzzleCatalogQuery.error ?? progressQuery.error;
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : "Failed to load the puzzle dashboard."
    : "";

  useEffect(() => {
    setCurrentPage(1);
  }, [
    authorFilter,
    eventFilter,
    pageSize,
    resultFilter,
    searchFilter,
    sinceDate,
    tagFilters,
    targetUsername,
    untilDate,
  ]);

  const allDashboardEntries = useMemo(
    () => buildDashboardEntries(progressRows, puzzlesById),
    [progressRows, puzzlesById],
  );
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
      if (!entryMatchesSelectedTags(entry.tags, tagFilters)) return false;

      const attemptTimestamp = new Date(entry.firstAttemptAt).getTime();
      if (sinceTimestamp !== null && attemptTimestamp < sinceTimestamp) return false;
      if (untilTimestamp !== null && attemptTimestamp > untilTimestamp) return false;

      if (normalizedSearch) {
        const tagSearchText = entry.tags.map((tag) => `${tag} ${getPuzzleTagName(tag)}`).join(" ");
        const searchableText =
          `${entry.puzzleId} ${entry.author} ${entry.event} ${tagSearchText}`.toLocaleLowerCase();
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
    tagFilters,
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
  const totalPages = Math.max(1, Math.ceil(totalProgressRows / pageSize));
  const dashboardEntries = useMemo(
    () => filteredDashboardEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredDashboardEntries, pageSize],
  );
  const accuracy =
    dashboardSummary.total > 0
      ? Math.round((dashboardSummary.correct / dashboardSummary.total) * 100)
      : 0;
  const puzzlesCreated = useMemo(
    () =>
      [...puzzlesById.values()].filter(
        (puzzle) => normalizeUsername(puzzle?.["author"]) === targetUsername,
      ).length,
    [puzzlesById, targetUsername],
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
  const hasActiveFilters = Boolean(
    sinceDate ||
    untilDate ||
    resultFilter !== "all" ||
    eventFilter ||
    authorFilter ||
    searchFilter.trim() ||
    tagFilters.length > 0,
  );
  const clearFilters = (): void => {
    setSinceDate("");
    setUntilDate("");
    setResultFilter("all");
    setEventFilter("");
    setAuthorFilter("");
    setSearchFilter("");
    setTagFilters([]);
  };
  const handleStartFilteredSet = (): void => {
    const customSet = createCustomPuzzleSet(
      filteredDashboardEntries.map((entry) => entry.linkedPuzzleId),
      resultFilter === "incorrect" ? "Missed puzzle review" : "Dashboard attempt review",
    );
    const firstPuzzleId = customSet?.puzzleIds[0];
    if (!customSet || firstPuzzleId === undefined) return;

    void navigate({
      to: "/solve/custom/$setId/$puzzleId",
      params: { setId: customSet.id, puzzleId: String(firstPuzzleId) },
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
              <Link className="puzzleDashboardActionLink" to="/solve/sets">
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
                <span>Puzzle sets</span>
              </Link>
              <Link className="puzzleDashboardActionLink" to={backLinkTo} params={backLinkParams}>
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
                <span>{backLinkLabel}</span>
              </Link>
            </div>
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
            <section className="dashboardStatsStrip" aria-label="Puzzle dashboard summary">
              <div className="dashboardStatCard dashboardStatCardPrimary">
                <span className="dashboardStatLabel">Attempted</span>
                <strong>{areStatsLoading ? "…" : dashboardSummary.total}</strong>
              </div>
              <div className="dashboardStatCard dashboardStatCardCorrect">
                <span className="dashboardStatLabel">Correct</span>
                <strong>{areStatsLoading ? "…" : dashboardSummary.correct}</strong>
              </div>
              <div className="dashboardStatCard dashboardStatCardIncorrect">
                <span className="dashboardStatLabel">Missed</span>
                <strong>{areStatsLoading ? "…" : dashboardSummary.incorrect}</strong>
              </div>
              <div className="dashboardStatCard dashboardStatCardAccuracy">
                <span className="dashboardStatLabel">Accuracy</span>
                <strong>{areStatsLoading ? "…" : `${accuracy}%`}</strong>
              </div>
              <div className="dashboardStatCard dashboardStatCardCreated">
                <span className="dashboardStatLabel">Puzzles created</span>
                <strong>{areStatsLoading ? "…" : puzzlesCreated}</strong>
              </div>
            </section>

            <section className="dashboardAttempts">
              <div className="dashboardAttemptsHeader">
                <div className="dashboardAttemptsTitleRow">
                  <div>
                    <h2>Puzzle attempts</h2>
                    <p className="dashboardAttemptsCount" aria-live="polite">
                      {dashboardSummary.total} matching attempt
                      {dashboardSummary.total === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="dashboardAttemptsActions">
                    <button
                      type="button"
                      className="dashboardFilterToggle"
                      onClick={() => setFiltersOpen((isOpen) => !isOpen)}
                      aria-expanded={filtersOpen}
                      aria-controls="dashboard-attempt-filters"
                    >
                      {filtersOpen ? "Hide filters" : "Show filters"}
                    </button>
                    <button
                      type="button"
                      className="puzzleDashboardActionLink primary dashboardStartSetButton"
                      onClick={handleStartFilteredSet}
                      disabled={isPageLoading || filteredDashboardEntries.length === 0}
                    >
                      <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
                      Solve filtered set
                    </button>
                  </div>
                </div>
                {filtersOpen ? (
                  <div
                    id="dashboard-attempt-filters"
                    className="dashboardFilters"
                    aria-label="Filter puzzle attempts"
                  >
                    <label className="dashboardFilterField dashboardFilterSearch">
                      <span>Search</span>
                      <input
                        type="search"
                        placeholder="Puzzle, author, event, or tag"
                        value={searchFilter}
                        onChange={(event) => setSearchFilter(event.target.value)}
                        disabled={isPageLoading}
                      />
                    </label>
                    <DashboardTagFilter
                      disabled={isPageLoading}
                      selectedTags={tagFilters}
                      onChange={setTagFilters}
                    />
                    <label className="dashboardFilterField">
                      <span>Result</span>
                      <select
                        value={resultFilter}
                        onChange={(event) =>
                          setResultFilter(event.target.value as DashboardResultFilter)
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
                        onChange={(event) => setEventFilter(event.target.value)}
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
                        onChange={(event) => setAuthorFilter(event.target.value)}
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
                        onChange={(event) => setSinceDate(event.target.value)}
                        disabled={isPageLoading}
                      />
                    </label>
                    <label className="dashboardFilterField">
                      <span>To</span>
                      <input
                        type="date"
                        value={untilDate}
                        min={sinceDate || undefined}
                        onChange={(event) => setUntilDate(event.target.value)}
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
                  <PaginationRow
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    formatLabel={(current, total) => `Page ${current} / ${total}`}
                    disabled={isPageLoading}
                  />
                </div>
              </div>

              {dashboardEntries.length > 0 ? (
                <div className="dashboardAttemptRows" role="list" aria-label="Puzzle dashboard">
                  {dashboardEntries.map((entry, index) => (
                    <article
                      key={`${entry.puzzleId}-${entry.firstAttemptAt}`}
                      className={`dashboardAttemptRow ${
                        entry.puzzleCorrect ? "correct" : "incorrect"
                      }`}
                    >
                      <div className="dashboardAttemptPrimary">
                        <span className="dashboardRowNumber" aria-hidden="true">
                          {firstRowNumber + index}
                        </span>
                        <div className="dashboardPuzzleBlock">
                          <Link
                            className="dashboardPuzzleLink"
                            to="/solve/$puzzleId"
                            params={{ puzzleId: String(entry.linkedPuzzleId) }}
                          >
                            Puzzle {entry.linkedPuzzleId}
                          </Link>
                          <div className="dashboardPuzzleSubline">
                            <span className="dashboardPuzzleAuthor">{entry.author}</span>
                            {isKnownEvent(entry.event) ? (
                              <span className="dashboardPuzzleEvent">{entry.event}</span>
                            ) : null}
                            {entry.tags.length > 0 ? (
                              <span className="dashboardPuzzleTags" aria-label="Puzzle tags">
                                {entry.tags.map((tag) => (
                                  <span key={tag}>{getPuzzleTagName(tag)}</span>
                                ))}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="dashboardAttemptMeta">
                        <span
                          className={`dashboardStatus ${
                            entry.puzzleCorrect ? "correct" : "incorrect"
                          }`}
                        >
                          {resultLabel(entry.puzzleCorrect)}
                        </span>
                        <span className="dashboardMetaValue">
                          {formatDateTime(entry.firstAttemptAt)}
                        </span>
                      </div>
                    </article>
                  ))}
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
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    formatLabel={(current, total) => `Page ${current} / ${total}`}
                    disabled={isPageLoading}
                  />
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
};
