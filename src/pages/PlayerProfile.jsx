import { Fragment, useEffect, useMemo, useState } from "react";
import {
  defaultMatchLengthMax,
  defaultMatchLengthMin,
  defaultRatingMax,
  defaultRatingMin,
  formatLocalDateTime,
  formatOpponentWithRating,
  formatScore,
  formatSignedDecimal,
  loadRawMatchesByMode,
  matchLengthBoundsByMode,
  modeOptions,
  normalizeMatches,
  opponentRatingSliderMax,
  opponentRatingSliderMin,
  pageSizeOptions,
  parseTimeControlParts,
} from "./Rankings";

const aliasFileUrlCandidates = ["/private/users.txt", "/data/users.txt"];

const parseAliasLookup = (rawText) => {
  const lookup = new Map();
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line) => {
    const members = line
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (members.length === 0) return;

    const uniqueMembers = [...new Set(members)];
    const [primary, ...aliases] = uniqueMembers;
    const entry = {
      primary,
      aliases,
      members: uniqueMembers,
    };

    uniqueMembers.forEach((member) => {
      lookup.set(member.toLowerCase(), entry);
    });
  });

  return lookup;
};

const loadAliasesLookup = async () => {
  let lastError = null;

  for (const url of aliasFileUrlCandidates) {
    try {
      const response = await fetch(url, { headers: { Accept: "text/plain" } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      return parseAliasLookup(text);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw new Error(`Could not load aliases from configured sources (${String(lastError)})`);
  }

  return new Map();
};

const parseMonthKeyDate = (monthKey) => {
  const parsed = new Date(`${monthKey} 01 UTC`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const findLatestRankByMode = (leaderboardData, username, mode) => {
  if (!leaderboardData || typeof leaderboardData !== "object") return null;

  const usernameLower = username.toLowerCase();
  const sortedMonthKeys = Object.keys(leaderboardData)
    .filter((monthKey) => parseMonthKeyDate(monthKey))
    .sort((left, right) => parseMonthKeyDate(right) - parseMonthKeyDate(left));

  for (const monthKey of sortedMonthKeys) {
    const rankings = leaderboardData?.[monthKey]?.[mode]?.rankings;
    if (!Array.isArray(rankings)) continue;

    const foundIndex = rankings.findIndex((entry) => {
      const entryUsername = entry?.username ?? entry?.user ?? entry?.player ?? entry?.name;
      return String(entryUsername || "").toLowerCase() === usernameLower;
    });
    if (foundIndex < 0) continue;

    const rawRank = Number(rankings[foundIndex]?.rank ?? rankings[foundIndex]?.position);
    return Number.isFinite(rawRank) ? rawRank : foundIndex + 1;
  }

  return null;
};

export const PlayerProfilePage = ({ username }) => {
  const [selectedMode, setSelectedMode] = useState("blitz");
  const [matchesByMode, setMatchesByMode] = useState({
    blitz: [],
    bullet: [],
  });
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const initialMatchBounds = matchLengthBoundsByMode.blitz;
  const [matchLengthMin, setMatchLengthMin] = useState(
    Math.max(defaultMatchLengthMin, initialMatchBounds.min),
  );
  const [matchLengthMax, setMatchLengthMax] = useState(
    Math.min(defaultMatchLengthMax, initialMatchBounds.max),
  );
  const [opponentRatingMin, setOpponentRatingMin] = useState(defaultRatingMin);
  const [opponentRatingMax, setOpponentRatingMax] = useState(defaultRatingMax);
  const [timeControlInitialFilter, setTimeControlInitialFilter] = useState("all");
  const [timeControlIncrementFilter, setTimeControlIncrementFilter] = useState("all");
  const [expandedMatchKeys, setExpandedMatchKeys] = useState([]);
  const [aliasesLookup, setAliasesLookup] = useState(() => new Map());
  const [ranksByMode, setRanksByMode] = useState({
    blitz: null,
    bullet: null,
  });
  const matchLengthBounds = matchLengthBoundsByMode[selectedMode] ?? matchLengthBoundsByMode.blitz;

  useEffect(() => {
    const loadAliases = async () => {
      try {
        const loadedLookup = await loadAliasesLookup();
        setAliasesLookup(loadedLookup);
      } catch {
        setAliasesLookup(new Map());
      }
    };

    loadAliases();
  }, []);

  useEffect(() => {
    const loadLatestRanks = async () => {
      try {
        const response = await fetch("/private/lb.json", {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const leaderboardData = await response.json();
        setRanksByMode({
          blitz: findLatestRankByMode(leaderboardData, username, "blitz"),
          bullet: findLatestRankByMode(leaderboardData, username, "bullet"),
        });
      } catch {
        setRanksByMode({
          blitz: null,
          bullet: null,
        });
      }
    };

    loadLatestRanks();
  }, [username]);

  useEffect(() => {
    const loadMatches = async () => {
      setError("");
      try {
        const [blitzLoaded, bulletLoaded] = await Promise.all([
          loadRawMatchesByMode("blitz"),
          loadRawMatchesByMode("bullet"),
        ]);
        setMatchesByMode({
          blitz: normalizeMatches(blitzLoaded, username),
          bullet: normalizeMatches(bulletLoaded, username),
        });
        setPage(1);
      } catch (loadError) {
        setMatchesByMode({
          blitz: [],
          bullet: [],
        });
        setError(String(loadError));
      }
    };

    loadMatches();
  }, [username]);

  const matches = matchesByMode[selectedMode] ?? [];

  useEffect(() => {
    const bounds = matchLengthBoundsByMode[selectedMode] ?? matchLengthBoundsByMode.blitz;
    setMatchLengthMin(Math.max(defaultMatchLengthMin, bounds.min));
    setMatchLengthMax(Math.min(defaultMatchLengthMax, bounds.max));
    setTimeControlInitialFilter("all");
    setTimeControlIncrementFilter("all");
  }, [selectedMode]);

  const { initialOptions, incrementOptions } = useMemo(() => {
    const initialSet = new Set();
    const incrementSet = new Set();
    matches.forEach((match) => {
      const parts = parseTimeControlParts(match.timeControl);
      if (parts.initial) initialSet.add(parts.initial);
      if (parts.increment) incrementSet.add(parts.increment);
    });

    const numericSort = (a, b) => Number(a) - Number(b);
    return {
      initialOptions: [...initialSet].sort(numericSort),
      incrementOptions: [...incrementSet].sort(numericSort),
    };
  }, [matches]);

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      if (match.gameCount < matchLengthMin || match.gameCount > matchLengthMax) {
        return false;
      }

      if (Number.isFinite(match.opponentAfterRating)) {
        const inRatingRange =
          match.opponentAfterRating >= opponentRatingMin &&
          match.opponentAfterRating <= opponentRatingMax;
        if (!inRatingRange) return false;
      }

      const { initial, increment } = parseTimeControlParts(match.timeControl);
      if (timeControlInitialFilter !== "all" && initial !== timeControlInitialFilter) {
        return false;
      }
      if (timeControlIncrementFilter !== "all" && increment !== timeControlIncrementFilter) {
        return false;
      }

      return true;
    });
  }, [
    matchLengthMax,
    matchLengthMin,
    matches,
    opponentRatingMax,
    opponentRatingMin,
    timeControlIncrementFilter,
    timeControlInitialFilter,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    matchLengthMax,
    matchLengthMin,
    opponentRatingMax,
    opponentRatingMin,
    timeControlIncrementFilter,
    timeControlInitialFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredMatches.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    setExpandedMatchKeys([]);
  }, [
    currentPage,
    matchLengthMax,
    matchLengthMin,
    opponentRatingMax,
    opponentRatingMin,
    selectedMode,
    timeControlIncrementFilter,
    timeControlInitialFilter,
    username,
  ]);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMatches.slice(start, start + pageSize);
  }, [currentPage, filteredMatches, pageSize]);

  const getModeRatingSummary = (modeMatches) => {
    const latestWithRating = modeMatches.find(
      (match) => Number.isFinite(match.afterRating) || Number.isFinite(match.afterRd),
    );
    const ratings = modeMatches.flatMap((match) => {
      const candidates = [];
      if (
        Number.isFinite(match.beforeRating) &&
        Number.isFinite(match.beforeRd) &&
        match.beforeRd <= 55
      ) {
        candidates.push(match.beforeRating);
      }
      if (
        Number.isFinite(match.afterRating) &&
        Number.isFinite(match.afterRd) &&
        match.afterRd <= 55
      ) {
        candidates.push(match.afterRating);
      }
      return candidates;
    });

    return {
      currentRating: latestWithRating?.afterRating ?? null,
      currentRd: latestWithRating?.afterRd ?? null,
      peakRating: ratings.length > 0 ? Math.max(...ratings) : null,
      gamesPlayed: modeMatches.reduce(
        (total, match) => total + (Number.isFinite(match.gameCount) ? match.gameCount : 0),
        0,
      ),
    };
  };

  const blitzSummary = useMemo(
    () => getModeRatingSummary(matchesByMode.blitz ?? []),
    [matchesByMode],
  );
  const bulletSummary = useMemo(
    () => getModeRatingSummary(matchesByMode.bullet ?? []),
    [matchesByMode],
  );

  const bestWins = useMemo(() => {
    return filteredMatches
      .filter((match) => match.playerScore > match.opponentScore)
      .sort((a, b) => {
        const ratingDiff =
          (b.opponentAfterRating ?? -Infinity) - (a.opponentAfterRating ?? -Infinity);
        if (ratingDiff !== 0) return ratingDiff;
        return b.startTs - a.startTs;
      })
      .slice(0, 5);
  }, [filteredMatches]);

  const aliasesForUser = useMemo(() => {
    const entry = aliasesLookup.get(username.toLowerCase());
    if (!entry) return [];
    return entry.members.filter((member) => member.toLowerCase() !== username.toLowerCase());
  }, [aliasesLookup, username]);

  return (
    <div className="rankingsPage">
      <div className="panel rankingsPanel">
        <h1>{username}</h1>

        <div className="profileTopBar">
          <div className="profileMetric">
            <span className="statusLabel">Blitz Rating</span>
            <strong>
              {Number.isFinite(blitzSummary.currentRating)
                ? blitzSummary.currentRating.toFixed(1)
                : "—"}
            </strong>
          </div>
          <div className="profileMetric">
            <span className="statusLabel">Blitz Rank</span>
            <strong>{Number.isFinite(ranksByMode.blitz) ? `#${ranksByMode.blitz}` : "—"}</strong>
          </div>
          <div className="profileMetric">
            <span className="statusLabel">Blitz RD</span>
            <strong>
              {Number.isFinite(blitzSummary.currentRd) ? blitzSummary.currentRd.toFixed(1) : "—"}
            </strong>
          </div>
          <div className="profileMetric">
            <span className="statusLabel">Blitz Peak Rating</span>
            <strong>
              {Number.isFinite(blitzSummary.peakRating) ? blitzSummary.peakRating.toFixed(1) : "—"}
            </strong>
          </div>
          <div className="profileMetric">
            <span className="statusLabel">Blitz Games Played</span>
            <strong>{blitzSummary.gamesPlayed.toLocaleString("en-US")}</strong>
          </div>
          <div className="profileMetric">
            <span className="statusLabel">Bullet Rating</span>
            <strong>
              {Number.isFinite(bulletSummary.currentRating)
                ? bulletSummary.currentRating.toFixed(1)
                : "—"}
            </strong>
          </div>
          <div className="profileMetric">
            <span className="statusLabel">Bullet Rank</span>
            <strong>{Number.isFinite(ranksByMode.bullet) ? `#${ranksByMode.bullet}` : "—"}</strong>
          </div>
          <div className="profileMetric">
            <span className="statusLabel">Bullet RD</span>
            <strong>
              {Number.isFinite(bulletSummary.currentRd) ? bulletSummary.currentRd.toFixed(1) : "—"}
            </strong>
          </div>
          <div className="profileMetric">
            <span className="statusLabel">Bullet Peak Rating</span>
            <strong>
              {Number.isFinite(bulletSummary.peakRating)
                ? bulletSummary.peakRating.toFixed(1)
                : "—"}
            </strong>
          </div>
          <div className="profileMetric">
            <span className="statusLabel">Bullet Games Played</span>
            <strong>{bulletSummary.gamesPlayed.toLocaleString("en-US")}</strong>
          </div>
        </div>

        <div className="profileHighlights">
          <div className="profileBestWins">
            <h2>Best 5 Wins</h2>
            {bestWins.length === 0 ? (
              <div className="emptyRankings">No wins available in {selectedMode}.</div>
            ) : (
              <ol>
                {bestWins.map((match) => (
                  <li key={`best-${match.startTs}-${match.firstGameId}`}>
                    <span className="profileBestWinOpponent">
                      <a className="rankingLink" href={`/@/${encodeURIComponent(match.opponent)}`}>
                        {formatOpponentWithRating(match.opponent, match.opponentAfterRating)}
                      </a>
                    </span>
                    <span className="profileBestWinDate">
                      {match.firstGameId === "—" ? (
                        formatLocalDateTime(match.startTs)
                      ) : (
                        <a
                          className="rankingLink"
                          href={`https://lichess.org/${encodeURIComponent(match.firstGameId)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {formatLocalDateTime(match.startTs)}
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="profileAliases">
            <h2>Aliases</h2>
            {aliasesForUser.length === 0 ? (
              <div className="emptyRankings">No aliases listed.</div>
            ) : (
              <div className="profileAliasesList">
                {aliasesForUser.map((alias) => (
                  <div key={`alias-${alias}`}>{alias}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="controls rankingsControls profileControls">
          <label htmlFor="profile-mode-select">
            Mode
            <select
              id="profile-mode-select"
              value={selectedMode}
              onChange={(event) => setSelectedMode(event.target.value)}
            >
              {modeOptions.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="profile-page-size-select">
            Page size
            <select
              id="profile-page-size-select"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {pageSizeOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="profile-time-initial-select">
            Initial (sec)
            <select
              id="profile-time-initial-select"
              value={timeControlInitialFilter}
              onChange={(event) => setTimeControlInitialFilter(event.target.value)}
            >
              <option value="all">All</option>
              {initialOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="profile-time-increment-select">
            Increment (sec)
            <select
              id="profile-time-increment-select"
              value={timeControlIncrementFilter}
              onChange={(event) => setTimeControlIncrementFilter(event.target.value)}
            >
              <option value="all">All</option>
              {incrementOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="opponentRatingFilter">
          <label htmlFor="match-length-min">
            Match length range: {matchLengthMin} - {matchLengthMax}
          </label>
          <div className="dualRangeSlider">
            <div className="dualRangeTrack" />
            <div
              className="dualRangeSelected"
              style={{
                left: `${((matchLengthMin - matchLengthBounds.min) / (matchLengthBounds.max - matchLengthBounds.min)) * 100}%`,
                right: `${100 - ((matchLengthMax - matchLengthBounds.min) / (matchLengthBounds.max - matchLengthBounds.min)) * 100}%`,
              }}
            />
            <input
              id="match-length-min"
              className="dualRangeInput"
              type="range"
              min={matchLengthBounds.min}
              max={matchLengthBounds.max}
              step={1}
              value={matchLengthMin}
              onChange={(event) => {
                const nextMin = Number(event.target.value);
                setMatchLengthMin(Math.min(nextMin, matchLengthMax));
              }}
            />
            <input
              className="dualRangeInput"
              type="range"
              min={matchLengthBounds.min}
              max={matchLengthBounds.max}
              step={1}
              value={matchLengthMax}
              onChange={(event) => {
                const nextMax = Number(event.target.value);
                setMatchLengthMax(Math.max(nextMax, matchLengthMin));
              }}
            />
          </div>
        </div>

        <div className="opponentRatingFilter">
          <label htmlFor="opponent-rating-min">
            Opponent rating range: {opponentRatingMin} - {opponentRatingMax}
          </label>
          <div className="dualRangeSlider">
            <div className="dualRangeTrack" />
            <div
              className="dualRangeSelected"
              style={{
                left: `${((opponentRatingMin - opponentRatingSliderMin) / (opponentRatingSliderMax - opponentRatingSliderMin)) * 100}%`,
                right: `${100 - ((opponentRatingMax - opponentRatingSliderMin) / (opponentRatingSliderMax - opponentRatingSliderMin)) * 100}%`,
              }}
            />
            <input
              id="opponent-rating-min"
              className="dualRangeInput"
              type="range"
              min={opponentRatingSliderMin}
              max={opponentRatingSliderMax}
              step={10}
              value={opponentRatingMin}
              onChange={(event) => {
                const nextMin = Number(event.target.value);
                setOpponentRatingMin(Math.min(nextMin, opponentRatingMax));
              }}
            />
            <input
              className="dualRangeInput"
              type="range"
              min={opponentRatingSliderMin}
              max={opponentRatingSliderMax}
              step={10}
              value={opponentRatingMax}
              onChange={(event) => {
                const nextMax = Number(event.target.value);
                setOpponentRatingMax(Math.max(nextMax, opponentRatingMin));
              }}
            />
          </div>
        </div>

        {error ? <div className="errorText">{error}</div> : null}

        <div className="rankingsMeta">
          <span>Match History ({selectedMode})</span>
          <span>
            {filteredMatches.length} filtered / {matches.length} total
          </span>
        </div>

        <div className="rankingsTableWrap">
          <table className="rankingsTable">
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Opponent</th>
                <th>TC</th>
                <th>Score</th>
                <th>Rating (Δ)</th>
                <th>RD (Δ)</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((match) => {
                const matchKey = `${match.startTs}-${match.firstGameId}`;
                const isExpanded = expandedMatchKeys.includes(matchKey);
                return (
                  <Fragment key={matchKey}>
                    <tr
                      className={`expandableMatchRow${isExpanded ? " expanded" : ""}`}
                      onClick={() =>
                        setExpandedMatchKeys((current) =>
                          current.includes(matchKey)
                            ? current.filter((key) => key !== matchKey)
                            : [...current, matchKey],
                        )
                      }
                    >
                      <td>
                        {match.firstGameId === "—" ? (
                          formatLocalDateTime(match.startTs)
                        ) : (
                          <a
                            className="rankingLink"
                            href={`https://lichess.org/${encodeURIComponent(match.firstGameId)}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {formatLocalDateTime(match.startTs)}
                          </a>
                        )}
                      </td>
                      <td>
                        <a
                          className="rankingLink"
                          href={`/@/${encodeURIComponent(match.opponent)}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {formatOpponentWithRating(match.opponent, match.opponentAfterRating)}
                        </a>
                      </td>
                      <td>{match.timeControl}</td>
                      <td className="scoreCell">
                        <span>{formatScore(match.playerScore)}</span>
                        <span className="scoreDash"> - </span>
                        <span>{formatScore(match.opponentScore)}</span>
                      </td>
                      <td>
                        {Number.isFinite(match.afterRating)
                          ? `${match.afterRating.toFixed(1)}(${formatSignedDecimal(match.ratingChange)})`
                          : "—"}
                      </td>
                      <td>
                        {Number.isFinite(match.afterRd)
                          ? `${match.afterRd.toFixed(1)}(${formatSignedDecimal(match.rdChange)})`
                          : "—"}
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="matchDetailsRow">
                        <td colSpan={6}>
                          <div className="matchDetailsInner">
                            <strong>Games</strong>
                            <ul>
                              {match.games.map((game, index) => (
                                <li key={`${matchKey}-${game.id}-${index}`}>
                                  {`Game ${index + 1}: winner ${game.winner}, score ${formatScore(
                                    game.playerScoreAfter,
                                  )} - ${formatScore(game.opponentScoreAfter)}`}
                                  <span> • </span>
                                  {game.id === "—" ? (
                                    "—"
                                  ) : (
                                    <a
                                      className="rankingLink"
                                      href={`https://lichess.org/${encodeURIComponent(game.id)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {game.id}
                                    </a>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="emptyRankings">
                    No matches found for this player with current filters in {selectedMode}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="paginationRow">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={currentPage <= 1}
          >
            Previous
          </button>
          <span>
            Page {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={currentPage >= totalPages}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
