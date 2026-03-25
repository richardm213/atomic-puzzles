import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  formatLocalDateTime,
  formatOpponentWithRating,
  formatScore,
  formatSignedDecimal,
  loadRawMatchesByMode,
  modeOptions,
  normalizeMatches,
  pageSizeOptions,
} from "./Rankings";

const parseDateInputBoundary = (value, boundary) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (boundary === "end") parsed.setHours(23, 59, 59, 999);
  return parsed.getTime();
};

export const MatchHistoryPage = ({ username }) => {
  const [selectedMode, setSelectedMode] = useState("blitz");
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [opponentFilter, setOpponentFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const runSearch = async () => {
    const usernameValue = String(username || "").trim();
    if (!usernameValue) return;

    setError("");
    setIsLoading(true);
    try {
      const raw = await loadRawMatchesByMode(selectedMode, {
        username: usernameValue,
        startTs: parseDateInputBoundary(startDateFilter, "start") ?? undefined,
        endTs: parseDateInputBoundary(endDateFilter, "end") ?? undefined,
      });
      setMatches(normalizeMatches(raw, usernameValue));
      setPage(1);
    } catch (loadError) {
      setMatches([]);
      setError(String(loadError));
      setPage(1);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    runSearch();
  }, [username]);

  const filteredMatches = useMemo(() => {
    const opponentSearch = opponentFilter.trim().toLowerCase();
    if (!opponentSearch) return matches;
    return matches.filter((match) => String(match.opponent || "").toLowerCase().includes(opponentSearch));
  }, [matches, opponentFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredMatches.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredMatches.slice(start, start + pageSize);
  }, [filteredMatches, page, pageSize]);

  return (
    <div className="rankingsPage">
      <div className="panel rankingsPanel">
        <h1>{username} Match History</h1>
        <p>Atomic {selectedMode} matches for this player.</p>
        <div className="controls rankingsControls">
          <label htmlFor="history-mode">
            Mode
            <select id="history-mode" value={selectedMode} onChange={(event) => setSelectedMode(event.target.value)}>
              {modeOptions.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="history-opponent">
            Opponent
            <input
              id="history-opponent"
              type="text"
              value={opponentFilter}
              onChange={(event) => setOpponentFilter(event.target.value)}
              placeholder="Filter locally"
            />
          </label>
          <label htmlFor="history-start-date">
            From
            <input
              id="history-start-date"
              type="date"
              value={startDateFilter}
              onChange={(event) => setStartDateFilter(event.target.value)}
            />
          </label>
          <label htmlFor="history-end-date">
            To
            <input
              id="history-end-date"
              type="date"
              value={endDateFilter}
              min={startDateFilter || undefined}
              onChange={(event) => setEndDateFilter(event.target.value)}
            />
          </label>
          <label htmlFor="history-page-size">
            Page size
            <select id="history-page-size" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="linkButton" onClick={runSearch} disabled={isLoading}>
            {isLoading ? "Searching..." : "Search"}
          </button>
          <Link to="/@/$username" params={{ username }} className="linkButton">
            Back to profile
          </Link>
        </div>

        {error ? <div className="errorText">{error}</div> : null}

        <div className="rankingsMeta">
          <span>{filteredMatches.length} matches</span>
          <span>
            Page {page} / {totalPages}
          </span>
        </div>

        <div className="matchCards">
          {pageItems.map((match) => {
            const matchKey = `${match.startTs}-${match.firstGameId}-${match.opponent}`;
            return (
              <article key={matchKey} className="matchCard">
                <header className="matchCardHeader">
                  <strong>{formatOpponentWithRating(match.opponent, match.opponentAfterRating)}</strong>
                  <span>{formatLocalDateTime(match.startTs)}</span>
                </header>
                <div className="matchCardMeta">
                  <span>
                    Score <strong>{formatScore(match.playerScore)}-{formatScore(match.opponentScore)}</strong>
                  </span>
                  <span>
                    Rating Δ <strong>{formatSignedDecimal(match.ratingChange)}</strong>
                  </span>
                  <span>
                    RD Δ <strong>{formatSignedDecimal(match.rdChange)}</strong>
                  </span>
                  <span>
                    Time control <strong>{match.timeControl}</strong>
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
};
