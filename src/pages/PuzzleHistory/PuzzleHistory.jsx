import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { loadPuzzleLibrary } from "../../lib/puzzleLibrary";
import { fetchPuzzleProgressPage } from "../../lib/supabasePuzzleProgress";
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

export const PuzzleHistoryPage = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [currentPage, setCurrentPage] = useState(1);
  const [historyRows, setHistoryRows] = useState([]);
  const [totalHistoryRows, setTotalHistoryRows] = useState(0);
  const [puzzlesById, setPuzzlesById] = useState(new Map());
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingPuzzles, setLoadingPuzzles] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCurrentPage(1);
  }, [user?.username]);

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
    if (!isAuthenticated || !user?.username) {
      setHistoryRows([]);
      setTotalHistoryRows(0);
      return;
    }

    let isCurrent = true;

    const loadHistory = async () => {
      setLoadingHistory(true);
      setError("");

      try {
        const { rows, total } = await fetchPuzzleProgressPage(user.username, {
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
  }, [currentPage, isAuthenticated, user?.username]);

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

  return (
    <div className="puzzleHistoryPage">
      <Seo
        title="Puzzle History"
        description="Review your first recorded puzzle attempts and jump back into any puzzle."
        path="/solve/history"
      />
      <div className="puzzleHistoryShell">
        <header className="historyBanner">
          <div className="historyBannerCopy">
            <p className="puzzleHistoryEyebrow">Atomic tactics</p>
            <h1>Puzzle history</h1>
            <p className="puzzleHistoryIntro">
              Review first attempts, spot misses quickly, and jump back into any position without
              digging through the solver.
            </p>
          </div>
          <div className="historyBannerActions">
            {user?.username ? (
              <div className="historyIdentityCard">
                <span className="historyIdentityLabel">Player</span>
                <strong>{user.username}</strong>
              </div>
            ) : null}
            <Link className="puzzleHistoryBackLink" to="/solve">
              Back to puzzles
            </Link>
          </div>
        </header>

        {isLoading ? <div className="historyStateCard">Checking your login…</div> : null}
        {!isLoading && !isAuthenticated ? (
          <div className="historyStateCard">
            <p>Log in with Lichess to view your puzzle history.</p>
            <Link className="puzzleHistoryBackLink" to="/solve">
              Go to puzzles
            </Link>
          </div>
        ) : null}
        {!isLoading && isAuthenticated && error ? <div className="historyStateCard errorText">{error}</div> : null}

        {!isLoading && isAuthenticated && !error ? (
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
                  <p className="historySectionIntro">
                    Every row is clickable and linked back to the original puzzle.
                  </p>
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
                  <p>No puzzle history yet.</p>
                  <Link className="puzzleHistoryBackLink" to="/solve">
                    Solve your first puzzle
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
