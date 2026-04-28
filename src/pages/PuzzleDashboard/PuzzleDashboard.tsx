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
import "./PuzzleDashboard.css";

const PAGE_SIZE = 20;

const formatDateTime = (value: string | number | Date | null | undefined): string => {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const buildDashboardEntries = (progressRows: import("../../lib/supabase/supabasePuzzleProgress").PuzzleProgressRow[], puzzlesById: Map<string, import("../../lib/puzzles/puzzleLibrary").Puzzle>): Array<{ puzzleId: string; linkedPuzzleId: string | number; author: string; event: string; puzzleCorrect: boolean; firstAttemptAt: string }> =>
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

export const PuzzleDashboardPage = ({ username = "" }: { username?: string | undefined }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const routeUsername = useMemo(() => normalizeUsername(username), [username]);
  const viewingOwnDashboard = !routeUsername;
  const targetUsername = viewingOwnDashboard ? normalizeUsername(user?.username) : routeUsername;
  const [currentPage, setCurrentPage] = useState(1);
  const [progressRows, setProgressRows] = useState<import("../../lib/supabase/supabasePuzzleProgress").PuzzleProgressRow[]>([]);
  const [totalProgressRows, setTotalProgressRows] = useState(0);
  const [dashboardSummary, setDashboardSummary] = useState({
    total: 0,
    correct: 0,
    incorrect: 0,
  });
  const [puzzlesById, setPuzzlesById] = useState<Map<string, import("../../lib/puzzles/puzzleLibrary").Puzzle>>(new Map());
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [arePuzzlesLoading, setArePuzzlesLoading] = useState(false);
  const [isAccessCheckLoading, setIsAccessCheckLoading] = useState(false);
  const [canViewDashboard, setCanViewDashboard] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCurrentPage(1);
  }, [targetUsername]);

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

    loadPuzzles();

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
          pageSize: PAGE_SIZE,
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

    loadDashboardEntries();

    return () => {
      isCurrent = false;
    };
  }, [canViewDashboard, currentPage, targetUsername]);

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
        const summary = await fetchPuzzleProgressSummary(targetUsername);
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

    loadDashboardSummary();

    return () => {
      isCurrent = false;
    };
  }, [canViewDashboard, targetUsername]);

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

    verifyDashboardAccess();

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
    Math.ceil(Math.max(totalProgressRows, dashboardSummary.total) / PAGE_SIZE),
  );
  const isPageLoading = isDashboardLoading || arePuzzlesLoading;
  const areStatsLoading = isSummaryLoading || isDashboardLoading;
  const firstRowNumber = totalProgressRows === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const seoTitle = viewingOwnDashboard ? "Puzzle Dashboard" : `${targetUsername} Puzzle Dashboard`;
  const seoDescription = viewingOwnDashboard
    ? "Review your first recorded puzzle attempts, stats, and links back into every puzzle."
    : `Review ${targetUsername}'s recorded puzzle attempts, stats, and links back into every puzzle.`;
  const seoPath = viewingOwnDashboard
    ? "/dashboard"
    : `/@/${encodeURIComponent(targetUsername)}/puzzles`;
  const introText = viewingOwnDashboard
    ? "Track your recorded puzzle attempts, review results, and jump back into any puzzle from one place."
    : `Browse ${targetUsername}'s recorded puzzle attempts, review results, and jump back into any puzzle from one place.`;
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

  return (
    <div className="puzzleDashboardPage">
      <Seo title={seoTitle} description={seoDescription} path={seoPath} />
      <div className="puzzleDashboardShell">
        <header className="dashboardHero">
          <div className="dashboardHeroCopy">
            <p className="puzzleDashboardEyebrow">Atomic tactics</p>
            <h1>Puzzle dashboard</h1>
            <p className="puzzleDashboardIntro">{introText}</p>
          </div>
          <div className="dashboardHeroActions">
            <div className="dashboardHeroActionStack">
              {targetUsername ? (
                <div className="dashboardIdentityCard">
                  <span className="dashboardIdentityLabel">Player</span>
                  <strong>{targetUsername}</strong>
                </div>
              ) : null}
              <div className="dashboardHeroLinks">
                <Link className="puzzleDashboardBackLink" to="/solve/sets">
                  Puzzle sets
                </Link>
                <Link className="puzzleDashboardBackLink" to={backLinkTo} params={backLinkParams}>
                  {backLinkLabel}
                </Link>
              </div>
            </div>
          </div>
        </header>

        {isCheckingAccess ? <div className="dashboardStateCard">{loadingMessage}</div> : null}
        {needsLoginForOwnDashboard ? (
          <div className="dashboardStateCard">
            <p>Log in with Lichess to view your puzzle dashboard.</p>
            <Link className="puzzleDashboardBackLink" to="/solve">
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
            <Link className="puzzleDashboardBackLink" to={backLinkTo} params={backLinkParams}>
              {backLinkLabel}
            </Link>
          </div>
        ) : null}

        {!needsLoginForOwnDashboard && !error && !isCheckingAccess && isRegisteredViewer ? (
          <>
            <section className="dashboardStatsStrip" aria-label="Puzzle dashboard summary">
              <div className="dashboardStatCard dashboardStatCardPrimary">
                <span className="dashboardStatLabel">Puzzles attempted</span>
                <strong>{areStatsLoading ? "…" : dashboardSummary.total}</strong>
                <span className="dashboardStatNote">Total recorded attempts</span>
              </div>
              <div className="dashboardStatCard dashboardStatCardCorrect">
                <span className="dashboardStatLabel">Puzzles correct</span>
                <strong>{areStatsLoading ? "…" : dashboardSummary.correct}</strong>
                <span className="dashboardStatNote">Correct results across all attempts</span>
              </div>
              <div className="dashboardStatCard dashboardStatCardIncorrect">
                <span className="dashboardStatLabel">Puzzles incorrect</span>
                <strong>{areStatsLoading ? "…" : dashboardSummary.incorrect}</strong>
                <span className="dashboardStatNote">Incorrect results across all attempts</span>
              </div>
            </section>

            <section className="dashboardAttempts">
              <div className="dashboardAttemptsHeader">
                <div>
                  <p className="dashboardSectionEyebrow">Attempt history</p>
                  <h2>Recorded puzzle attempts</h2>
                </div>
                <PaginationRow
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  formatLabel={(current, total) => `Page ${current} / ${total}`}
                  disabled={isPageLoading}
                />
              </div>

              {isPageLoading && dashboardEntries.length === 0 ? (
                <div className="dashboardStateCard">Loading your puzzle dashboard…</div>
              ) : dashboardEntries.length > 0 ? (
                <div className="dashboardAttemptRows" role="list" aria-label="Puzzle dashboard">
                  {dashboardEntries.map((entry, index) => (
                    <article
                      key={`${entry.puzzleId}-${entry.firstAttemptAt}`}
                      className="dashboardAttemptRow"
                    >
                      <div className="dashboardAttemptPrimary">
                        <div className="dashboardRowNumber" aria-hidden="true">
                          {firstRowNumber + index}
                        </div>
                        <div className="dashboardPuzzleBlock">
                          <span className="dashboardMiniLabel">Puzzle</span>
                          <Link
                            className="dashboardPuzzleLink"
                            to="/solve/$puzzleId"
                            params={{ puzzleId: String(entry.linkedPuzzleId) }}
                          >
                            Puzzle {entry.linkedPuzzleId}
                          </Link>
                          <div className="dashboardPuzzleSubline">
                            <span>#{entry.puzzleId}</span>
                            <span>{entry.author}</span>
                            <span>{entry.event}</span>
                          </div>
                        </div>
                      </div>

                      <div className="dashboardAttemptMeta">
                        <div className="dashboardMetaCard">
                          <span className="dashboardMiniLabel">Result</span>
                          <span
                            className={`dashboardStatus ${entry.puzzleCorrect ? "correct" : "incorrect"}`}
                          >
                            {resultLabel(entry.puzzleCorrect)}
                          </span>
                        </div>
                        <div className="dashboardMetaCard">
                          <span className="dashboardMiniLabel">Attempt date</span>
                          <span className="dashboardMetaValue">
                            {formatDateTime(entry.firstAttemptAt)}
                          </span>
                        </div>
                        <div className="dashboardMetaCard dashboardActionCard">
                          <span className="dashboardMiniLabel">Replay</span>
                          <Link
                            className="dashboardReplayLink"
                            to="/solve/$puzzleId"
                            params={{ puzzleId: String(entry.linkedPuzzleId) }}
                          >
                            Play again
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="dashboardStateCard">
                  <p>{emptyText}</p>
                  <Link className="puzzleDashboardBackLink" to={backLinkTo} params={backLinkParams}>
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
