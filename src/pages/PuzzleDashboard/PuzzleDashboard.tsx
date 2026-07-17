import "./PuzzleDashboard.css";

import {
  faArrowUpRightFromSquare,
  faClockRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { loadPuzzleLibrary } from "../../lib/puzzles/puzzleLibrary";
import { normalizePuzzleEventName } from "../../lib/puzzles/puzzleSets";
import {
  fetchPuzzleProgressPage,
  fetchPuzzleProgressSummary,
} from "../../lib/supabase/supabasePuzzleProgress";
import { isRegisteredSiteUser } from "../../lib/supabase/supabaseUsers";
import { normalizeUsername } from "../../utils/playerNames";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const PAGE_SIZE_STORAGE_KEY = "atomic-puzzles.puzzle-dashboard-page-size";
const UNKNOWN_EVENT_LABEL = "Unknown event";

type PuzzleDashboardPageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const isPuzzleDashboardPageSize = (value: number): value is PuzzleDashboardPageSize =>
  PAGE_SIZE_OPTIONS.includes(value as PuzzleDashboardPageSize);

const readStoredPageSize = (): PuzzleDashboardPageSize => {
  if (typeof window === "undefined") return DEFAULT_PAGE_SIZE;

  try {
    const storedValue = Number.parseInt(
      window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY) ?? "",
      10,
    );
    return isPuzzleDashboardPageSize(storedValue) ? storedValue : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
};

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
      puzzleCorrect: Boolean(row?.puzzle_correct),
      firstAttemptAt: row?.first_attempt_at || "",
    };
  });

const resultLabel = (isCorrect: boolean): string => (isCorrect ? "Correct" : "Incorrect");

const isKnownEvent = (event: string): boolean => event.trim() !== UNKNOWN_EVENT_LABEL;

export const PuzzleDashboardPage = ({ username = "" }: { username?: string | undefined }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const routeUsername = useMemo(() => normalizeUsername(username), [username]);
  const viewingOwnDashboard = !routeUsername;
  const targetUsername = viewingOwnDashboard ? normalizeUsername(user?.username) : routeUsername;
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PuzzleDashboardPageSize>(readStoredPageSize);
  const [sinceDate, setSinceDate] = useState("");
  const [progressRows, setProgressRows] = useState<
    import("../../lib/supabase/supabasePuzzleProgress").PuzzleProgressRow[]
  >([]);
  const [totalProgressRows, setTotalProgressRows] = useState(0);
  const [dashboardSummary, setDashboardSummary] = useState({
    total: 0,
    correct: 0,
    incorrect: 0,
  });
  const [puzzlesById, setPuzzlesById] = useState<
    Map<string, import("../../lib/puzzles/puzzleLibrary").Puzzle>
  >(new Map());
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [arePuzzlesLoading, setArePuzzlesLoading] = useState(false);
  const [isAccessCheckLoading, setIsAccessCheckLoading] = useState(false);
  const [canViewDashboard, setCanViewDashboard] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, sinceDate, targetUsername]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize));
    } catch {
      // Keep the dashboard usable if browser storage is unavailable.
    }
  }, [pageSize]);

  useEffect(() => {
    let isCurrent = true;

    const loadPuzzles = async () => {
      setArePuzzlesLoading(true);

      try {
        const puzzles = await loadPuzzleLibrary();
        if (!isCurrent) return;

        setPuzzlesById(
          new Map(puzzles.map((puzzle) => [String(puzzle?.puzzleId ?? "").trim(), puzzle])),
        );
      } catch (loadError) {
        if (!isCurrent) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load puzzles.");
      } finally {
        if (isCurrent) setArePuzzlesLoading(false);
      }
    };

    void loadPuzzles();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!targetUsername || !canViewDashboard) {
      setProgressRows([]);
      setTotalProgressRows(0);
      setDashboardSummary({
        total: 0,
        correct: 0,
        incorrect: 0,
      });
      return;
    }

    let isCurrent = true;

    const loadDashboardEntries = async () => {
      setIsDashboardLoading(true);
      setError("");

      try {
        const { rows, total } = await fetchPuzzleProgressPage(targetUsername, {
          page: currentPage,
          pageSize,
          sinceDate,
        });
        if (!isCurrent) return;

        setProgressRows(Array.isArray(rows) ? rows : []);
        setTotalProgressRows(total);
      } catch (loadError) {
        if (!isCurrent) return;
        setProgressRows([]);
        setTotalProgressRows(0);
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load the puzzle dashboard.",
        );
      } finally {
        if (isCurrent) setIsDashboardLoading(false);
      }
    };

    void loadDashboardEntries();

    return () => {
      isCurrent = false;
    };
  }, [canViewDashboard, currentPage, pageSize, sinceDate, targetUsername]);

  useEffect(() => {
    if (!targetUsername || !canViewDashboard) {
      setDashboardSummary({
        total: 0,
        correct: 0,
        incorrect: 0,
      });
      return;
    }

    let isCurrent = true;

    const loadDashboardSummary = async () => {
      setIsSummaryLoading(true);

      try {
        const summary = await fetchPuzzleProgressSummary(targetUsername, { sinceDate });
        if (!isCurrent) return;

        setDashboardSummary({
          total: Number(summary?.total) || 0,
          correct: Number(summary?.correct) || 0,
          incorrect: Number(summary?.incorrect) || 0,
        });
      } catch (loadError) {
        if (!isCurrent) return;
        setDashboardSummary({
          total: 0,
          correct: 0,
          incorrect: 0,
        });
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load puzzle dashboard totals.",
        );
      } finally {
        if (isCurrent) setIsSummaryLoading(false);
      }
    };

    void loadDashboardSummary();

    return () => {
      isCurrent = false;
    };
  }, [canViewDashboard, sinceDate, targetUsername]);

  useEffect(() => {
    if (!targetUsername) {
      setCanViewDashboard(false);
      return;
    }

    let isCurrent = true;

    const verifyDashboardAccess = async () => {
      setCanViewDashboard(false);
      setIsAccessCheckLoading(true);

      try {
        const isRegistered = await isRegisteredSiteUser(targetUsername);
        if (!isCurrent) return;
        setCanViewDashboard(isRegistered);
      } catch (loadError) {
        if (!isCurrent) return;
        setCanViewDashboard(false);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to verify puzzle dashboard access.",
        );
      } finally {
        if (isCurrent) setIsAccessCheckLoading(false);
      }
    };

    void verifyDashboardAccess();

    return () => {
      isCurrent = false;
    };
  }, [targetUsername]);

  const dashboardEntries = useMemo(
    () => buildDashboardEntries(progressRows, puzzlesById),
    [progressRows, puzzlesById],
  );
  const totalPages = Math.max(
    1,
    Math.ceil(Math.max(totalProgressRows, dashboardSummary.total) / pageSize),
  );
  const accuracy =
    dashboardSummary.total > 0
      ? Math.round((dashboardSummary.correct / dashboardSummary.total) * 100)
      : 0;
  const isPageLoading = isDashboardLoading || arePuzzlesLoading;
  const areStatsLoading = isSummaryLoading || isDashboardLoading;
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
  const loadingMessage = viewingOwnDashboard
    ? "Checking your puzzle dashboard access…"
    : "Checking puzzle dashboard access…";
  const heroTitle = viewingOwnDashboard
    ? "My Puzzle Dashboard"
    : `${targetUsername}'s Puzzle Dashboard`;

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
              <Link
                className="puzzleDashboardActionLink"
                to={backLinkTo}
                params={backLinkParams}
              >
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
                <span>{backLinkLabel}</span>
              </Link>
            </div>
          </div>
        </header>

        {isCheckingAccess ? <div className="dashboardStateCard">{loadingMessage}</div> : null}
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
            </section>

            <section className="dashboardAttempts">
              <div className="dashboardAttemptsHeader">
                <div className="dashboardAttemptsTitleRow">
                  <h2>Puzzle attempts</h2>
                  <label className="dashboardFilterLabel">
                    <span>Since</span>
                    <input
                      type="date"
                      value={sinceDate}
                      onChange={(event) => setSinceDate(event.target.value)}
                      onInput={(event) => setSinceDate(event.currentTarget.value)}
                      disabled={isPageLoading}
                    />
                  </label>
                </div>
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

              {isPageLoading && dashboardEntries.length === 0 ? (
                <div className="dashboardStateCard">Loading your puzzle dashboard…</div>
              ) : dashboardEntries.length > 0 ? (
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
                        <Link
                          className="dashboardReplayLink"
                          to="/solve/$puzzleId"
                          params={{ puzzleId: String(entry.linkedPuzzleId) }}
                        >
                          <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
                          <span>Replay</span>
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="dashboardStateCard">
                  <p>{emptyText}</p>
                  <Link
                    className="puzzleDashboardActionLink primary"
                    to={backLinkTo}
                    params={backLinkParams}
                  >
                    <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
                    {emptyLinkLabel}
                  </Link>
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
