import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { loadPuzzleLibrary } from "../../lib/puzzleLibrary";
import { fetchPuzzleProgressPage } from "../../lib/supabasePuzzleProgress";
import { isRegisteredSiteUser } from "../../lib/supabaseUsers";
import { normalizeUsername } from "../../utils/playerNames";
import "./PuzzleHistory.css";

const PAGE_SIZE = 20;

const formatDateTime = (value) => {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const buildHistoryEntries = (historyRows, puzzlesById) =>
  historyRows.map((row) => {
    const puzzle = puzzlesById.get(String(row?.puzzle_id ?? "").trim()) || null;
    const author = puzzle?.author?.trim() || "Unknown";
    const event = puzzle?.event?.trim() || "";
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

const resultLabel = (isCorrect) => (isCorrect ? "Correct" : "Incorrect");

export const PuzzleHistoryPage = ({ username = "" }) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const routeUsername = useMemo(() => normalizeUsername(username), [username]);
  const viewingOwnHistory = !routeUsername;
  const targetUsername = viewingOwnHistory ? normalizeUsername(user?.username) : routeUsername;
  const [currentPage, setCurrentPage] = useState(1);
  const [historyRows, setHistoryRows] = useState([]);
  const [totalHistoryRows, setTotalHistoryRows] = useState(0);
  const [puzzlesById, setPuzzlesById] = useState(new Map());
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingPuzzles, setLoadingPuzzles] = useState(false);
  const [isRegistrationCheckLoading, setIsRegistrationCheckLoading] = useState(false);
  const [canViewHistory, setCanViewHistory] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCurrentPage(1);
  }, [targetUsername]);

  useEffect(() => {
    let isCurrent = true;

    const loadPuzzles = async () => {
      setLoadingPuzzles(true);

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
        if (isCurrent) setLoadingPuzzles(false);
      }
    };

    loadPuzzles();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!targetUsername || !canViewHistory) {
      setHistoryRows([]);
      setTotalHistoryRows(0);
      return;
    }

    let isCurrent = true;

    const loadHistory = async () => {
      setLoadingHistory(true);
      setError("");

      try {
        const { rows, total } = await fetchPuzzleProgressPage(targetUsername, {
          page: currentPage,
          pageSize: PAGE_SIZE,
        });
        if (!isCurrent) return;

        setHistoryRows(Array.isArray(rows) ? rows : []);
        setTotalHistoryRows(total);
      } catch (loadError) {
        if (!isCurrent) return;
        setHistoryRows([]);
        setTotalHistoryRows(0);
        setError(loadError instanceof Error ? loadError.message : "Failed to load puzzle history.");
      } finally {
        if (isCurrent) setLoadingHistory(false);
      }
    };

    loadHistory();

    return () => {
      isCurrent = false;
    };
  }, [canViewHistory, currentPage, targetUsername]);

  useEffect(() => {
    if (!targetUsername) {
      setCanViewHistory(false);
      return;
    }

    let isCurrent = true;

    const verifyHistoryAccess = async () => {
      setCanViewHistory(false);
      setIsRegistrationCheckLoading(true);

      try {
        const isRegistered = await isRegisteredSiteUser(targetUsername);
        if (!isCurrent) return;
        setCanViewHistory(isRegistered);
      } catch (loadError) {
        if (!isCurrent) return;
        setCanViewHistory(false);
        setError(
          loadError instanceof Error ? loadError.message : "Failed to verify puzzle history access.",
        );
      } finally {
        if (isCurrent) setIsRegistrationCheckLoading(false);
      }
    };

    verifyHistoryAccess();

    return () => {
      isCurrent = false;
    };
  }, [targetUsername]);

  const historyEntries = useMemo(
    () => buildHistoryEntries(historyRows, puzzlesById),
    [historyRows, puzzlesById],
  );
  const totalPages = Math.max(1, Math.ceil(totalHistoryRows / PAGE_SIZE));
  const isLoadingPage = loadingHistory || loadingPuzzles;
  const solvedCount = useMemo(
    () => historyRows.filter((row) => Boolean(row?.puzzle_correct)).length,
    [historyRows],
  );
  const incorrectCount = historyRows.length - solvedCount;
  const pageStart = totalHistoryRows === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(totalHistoryRows, currentPage * PAGE_SIZE);
  const seoTitle = viewingOwnHistory
    ? "Puzzle History"
    : `${targetUsername} Puzzle History`;
  const seoDescription = viewingOwnHistory
    ? "Review your first recorded puzzle attempts and jump back into any puzzle."
    : `Review ${targetUsername}'s recorded puzzle attempts and jump back into any puzzle.`;
  const seoPath = viewingOwnHistory
    ? "/solve/history"
    : `/@/${encodeURIComponent(targetUsername)}/puzzles`;
  const introText = viewingOwnHistory
    ? "Review first attempts, spot misses quickly, and jump back into any position without digging through the solver."
    : `Browse ${targetUsername}'s first recorded puzzle attempts, spot misses quickly, and jump back into any position without digging through the solver.`;
  const ledgerIntro = viewingOwnHistory
    ? "Every row is clickable and linked back to the original puzzle."
    : `Every row is clickable and linked back to the original puzzle for ${targetUsername}.`;
  const emptyText = viewingOwnHistory
    ? "No puzzle history yet."
    : `No recorded puzzle history for ${targetUsername} yet.`;
  const emptyLinkLabel = viewingOwnHistory ? "Solve your first puzzle" : "Open player profile";
  const backLinkTo = viewingOwnHistory ? "/solve" : "/@/$username";
  const backLinkParams = viewingOwnHistory ? undefined : { username: targetUsername };
  const backLinkLabel = viewingOwnHistory ? "Back to puzzles" : "Back to profile";
  const needsLoginForOwnHistory = viewingOwnHistory && !isLoading && !isAuthenticated;
  const isCheckingAccess = isLoading || isRegistrationCheckLoading;
  const isRegisteredViewer = Boolean(targetUsername) && canViewHistory;
  const shouldHideHistory = !needsLoginForOwnHistory && !error && !isCheckingAccess && !isRegisteredViewer;
  const unavailableMessage = viewingOwnHistory
    ? "Puzzle history is only available for registered site users."
    : `${targetUsername} does not have a registered site account yet, so puzzle history is hidden.`;
  const loadingMessage = viewingOwnHistory ? "Checking your history access…" : "Checking history access…";

  return (
    <div className="puzzleHistoryPage">
      <Seo title={seoTitle} description={seoDescription} path={seoPath} />
      <div className="puzzleHistoryShell">
        <header className="historyBanner">
          <div className="historyBannerCopy">
            <p className="puzzleHistoryEyebrow">Atomic tactics</p>
            <h1>Puzzle history</h1>
            <p className="puzzleHistoryIntro">{introText}</p>
          </div>
          <div className="historyBannerActions">
            {targetUsername ? (
              <div className="historyIdentityCard">
                <span className="historyIdentityLabel">Player</span>
                <strong>{targetUsername}</strong>
              </div>
            ) : null}
            <Link className="puzzleHistoryBackLink" to={backLinkTo} params={backLinkParams}>
              {backLinkLabel}
            </Link>
          </div>
        </header>

        {isCheckingAccess ? <div className="historyStateCard">{loadingMessage}</div> : null}
        {needsLoginForOwnHistory ? (
          <div className="historyStateCard">
            <p>Log in with Lichess to view your puzzle history.</p>
            <Link className="puzzleHistoryBackLink" to="/solve">
              Go to puzzles
            </Link>
          </div>
        ) : null}
        {!needsLoginForOwnHistory && error ? <div className="historyStateCard errorText">{error}</div> : null}
        {shouldHideHistory ? (
          <div className="historyStateCard">
            <p>{unavailableMessage}</p>
            <Link className="puzzleHistoryBackLink" to={backLinkTo} params={backLinkParams}>
              {backLinkLabel}
            </Link>
          </div>
        ) : null}

        {!needsLoginForOwnHistory && !error && !isCheckingAccess && isRegisteredViewer ? (
          <>
            <section className="historyStatsStrip" aria-label="Puzzle history summary">
              <div className="historyStatCard">
                <span className="historyStatLabel">Recorded puzzles</span>
                <strong>{totalHistoryRows}</strong>
              </div>
              <div className="historyStatCard">
                <span className="historyStatLabel">Correct on page</span>
                <strong>{solvedCount}</strong>
              </div>
              <div className="historyStatCard">
                <span className="historyStatLabel">Incorrect on page</span>
                <strong>{incorrectCount}</strong>
              </div>
              <div className="historyStatCard">
                <span className="historyStatLabel">Showing</span>
                <strong>{pageStart}-{pageEnd}</strong>
              </div>
            </section>

            <section className="historyLedger">
              <div className="historyLedgerHeader">
                <div>
                  <p className="historySectionEyebrow">Attempt ledger</p>
                  <h2>First attempts only</h2>
                  <p className="historySectionIntro">{ledgerIntro}</p>
                </div>
                <PaginationRow
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  formatLabel={(current, total) => `Page ${current} / ${total}`}
                  disabled={isLoadingPage}
                />
              </div>

              {isLoadingPage && historyEntries.length === 0 ? (
                <div className="historyStateCard">Loading your puzzle history…</div>
              ) : historyEntries.length > 0 ? (
                <div className="historyLedgerRows" role="list" aria-label="Puzzle history">
                  {historyEntries.map((entry, index) => (
                    <article key={`${entry.puzzleId}-${entry.firstAttemptAt}`} className="historyLedgerRow">
                      <div className="historyLedgerPrimary">
                        <div className="historyRowNumber" aria-hidden="true">
                          {pageStart + index}
                        </div>
                        <div className="historyPuzzleBlock">
                          <span className="historyMiniLabel">Puzzle</span>
                          <Link
                            className="historyPuzzleLink"
                            to="/solve/$puzzleId"
                            params={{ puzzleId: String(entry.linkedPuzzleId) }}
                          >
                            Puzzle {entry.linkedPuzzleId}
                          </Link>
                          <div className="historyPuzzleSubline">
                            <span>#{entry.puzzleId}</span>
                            <span>{entry.author}</span>
                            <span>{entry.event || "Unknown event"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="historyLedgerMeta">
                        <div className="historyLedgerCell">
                          <span className="historyMiniLabel">Result</span>
                          <span
                            className={`historyStatus ${entry.puzzleCorrect ? "correct" : "incorrect"}`}
                          >
                            {resultLabel(entry.puzzleCorrect)}
                          </span>
                        </div>
                        <div className="historyLedgerCell">
                          <span className="historyMiniLabel">First attempt</span>
                          <span className="historyLedgerValue">
                            {formatDateTime(entry.firstAttemptAt)}
                          </span>
                        </div>
                        <div className="historyLedgerCell historyLedgerActionCell">
                          <span className="historyMiniLabel">Open</span>
                          <Link
                            className="historyOpenLink"
                            to="/solve/$puzzleId"
                            params={{ puzzleId: String(entry.linkedPuzzleId) }}
                          >
                            Solve again
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="historyStateCard">
                  <p>{emptyText}</p>
                  <Link className="puzzleHistoryBackLink" to={backLinkTo} params={backLinkParams}>
                    {emptyLinkLabel}
                  </Link>
                </div>
              )}

              {historyEntries.length > 0 ? (
                <div className="historyLedgerFooter">
                  <PaginationRow
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    formatLabel={(current, total) => `Page ${current} / ${total}`}
                    disabled={isLoadingPage}
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
