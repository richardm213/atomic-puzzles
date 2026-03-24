import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { fetchLbRows, fetchPlayerRatingsRows, monthKeyFromMonthValue } from "../lib/supabaseLb";

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

const parseMonthRanksFromLbRows = (rows) => {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const monthKey = monthKeyFromMonthValue(row?.month);
      if (!monthKey) return null;
      const monthDate = new Date(`${String(row.month).slice(0, 10)}T00:00:00Z`);
      const mode = String(row?.tc || "").toLowerCase();
      const rank = Number(row?.rank);
      const rating = Number(row?.rating);
      if (!modeOptions.includes(mode) || !Number.isFinite(rank) || rank <= 0) return null;

      return {
        monthKey,
        monthDate,
        monthLabel: monthKey,
        mode,
        rank,
        rating: Number.isFinite(rating) ? rating : null,
      };
    })
    .filter(Boolean);
};

const loadMonthRanksFromLb = async (username) => {
  const rows = await fetchLbRows({ username });
  return parseMonthRanksFromLbRows(rows);
};

const parseCurrentRatingsFromRows = (rows) => {
  const snapshotsByMode = {
    blitz: new Map(),
    bullet: new Map(),
  };

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const mode = String(row?.tc || "").toLowerCase();
    const rowUsername = String(row?.username || "").trim();
    const rating = Number(row?.rating);
    const rd = Number(row?.rd);
    const games = Number(row?.games);
    const rank = Number(row?.rank);
    if (!modeOptions.includes(mode)) return;
    if (!rowUsername) return;
    if (!Number.isFinite(rating) || !Number.isFinite(rd) || !Number.isFinite(games)) return;

    snapshotsByMode[mode].set(rowUsername.toLowerCase(), {
        currentRating: rating,
        currentRd: rd,
        gamesPlayed: games,
        rank: Number.isFinite(rank) ? rank : null,
      });
  });

  return snapshotsByMode;
};

const loadCurrentRatingsSnapshot = async (username) => {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  if (!normalizedUsername) {
    return {
      blitz: new Map(),
      bullet: new Map(),
    };
  }

  const rows = await fetchPlayerRatingsRows({ username: normalizedUsername });
  return parseCurrentRatingsFromRows(rows);
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
  const [ratingsSnapshotByMode, setRatingsSnapshotByMode] = useState({
    blitz: new Map(),
    bullet: new Map(),
  });
  const [monthRanks, setMonthRanks] = useState([]);
  const [bestMonthRankCount, setBestMonthRankCount] = useState(5);
  const [recentMonthRankCount, setRecentMonthRankCount] = useState(5);
  const [bestWinCount, setBestWinCount] = useState(5);
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
    const loadMonthRanks = async () => {
      try {
        const ranks = await loadMonthRanksFromLb(username);
        setMonthRanks(ranks);
      } catch {
        setMonthRanks([]);
      }
    };

    loadMonthRanks();
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

  useEffect(() => {
    const loadRatingsSnapshot = async () => {
      try {
        const snapshots = await loadCurrentRatingsSnapshot(username);
        setRatingsSnapshotByMode(snapshots);
      } catch {
        setRatingsSnapshotByMode({
          blitz: new Map(),
          bullet: new Map(),
        });
      }
    };

    loadRatingsSnapshot();
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
  const usernameLower = username.toLowerCase();
  const blitzSnapshot = ratingsSnapshotByMode.blitz.get(usernameLower);
  const bulletSnapshot = ratingsSnapshotByMode.bullet.get(usernameLower);
  const blitzDisplaySummary = {
    ...blitzSummary,
    currentRating: blitzSnapshot?.currentRating ?? blitzSummary.currentRating,
    currentRd: blitzSnapshot?.currentRd ?? blitzSummary.currentRd,
    gamesPlayed: blitzSnapshot?.gamesPlayed ?? blitzSummary.gamesPlayed,
    rank: blitzSnapshot?.rank ?? null,
  };
  const bulletDisplaySummary = {
    ...bulletSummary,
    currentRating: bulletSnapshot?.currentRating ?? bulletSummary.currentRating,
    currentRd: bulletSnapshot?.currentRd ?? bulletSummary.currentRd,
    gamesPlayed: bulletSnapshot?.gamesPlayed ?? bulletSummary.gamesPlayed,
    rank: bulletSnapshot?.rank ?? null,
  };

  const bestWins = useMemo(() => {
    return filteredMatches
      .filter((match) =>
        Array.isArray(match.games)
          ? match.games.some((game) => String(game?.winner || "").toLowerCase() === usernameLower)
          : false,
      )
      .sort((a, b) => {
        const ratingDiff =
          (b.opponentAfterRating ?? -Infinity) - (a.opponentAfterRating ?? -Infinity);
        if (ratingDiff !== 0) return ratingDiff;
        return b.startTs - a.startTs;
      })
      .slice(0, bestWinCount);
  }, [bestWinCount, filteredMatches, usernameLower]);
  const bestMonthRanks = useMemo(
    () =>
      [...monthRanks]
        .sort((a, b) => {
          if (a.rank !== b.rank) return a.rank - b.rank;
          return b.monthDate.getTime() - a.monthDate.getTime();
        })
        .slice(0, bestMonthRankCount),
    [bestMonthRankCount, monthRanks],
  );
  const recentMonthRanks = useMemo(
    () =>
      [...monthRanks]
        .sort((a, b) => b.monthDate.getTime() - a.monthDate.getTime())
        .slice(0, recentMonthRankCount),
    [monthRanks, recentMonthRankCount],
  );

  const aliasesForUser = useMemo(() => {
    const entry = aliasesLookup.get(username.toLowerCase());
    if (!entry) return [];
    return entry.members.filter((member) => member.toLowerCase() !== username.toLowerCase());
  }, [aliasesLookup, username]);

  const formatCurrentRating = (summary) => {
    if (!Number.isFinite(summary.currentRating)) return "—";
    const provisionalSuffix = Number.isFinite(summary.currentRd) && summary.currentRd >= 100 ? "?" : "";
    return `${summary.currentRating.toFixed(1)}${provisionalSuffix}`;
  };

  return (
    <div className="rankingsPage">
      <div className="panel rankingsPanel">
        <h1>{username}</h1>

        <div className="profileTopBar">
          <div className="profileMetric">
            <span className="statusLabel">Blitz Rating</span>
            <strong>
              {formatCurrentRating(blitzDisplaySummary)}
              {Number.isFinite(blitzDisplaySummary.rank)
                ? blitzDisplaySummary.rank > 0
                  ? ` (#${blitzDisplaySummary.rank})`
                  : ""
                : ""}
            </strong>
          </div>
          <div className="profileMetric">
            <span className="statusLabel">Blitz RD</span>
            <strong>
              {Number.isFinite(blitzDisplaySummary.currentRd)
                ? blitzDisplaySummary.currentRd.toFixed(1)
                : "—"}
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
            <strong>{blitzDisplaySummary.gamesPlayed.toLocaleString("en-US")}</strong>
          </div>
          <div className="profileMetric">
            <span className="statusLabel">Bullet Rating</span>
            <strong>
              {formatCurrentRating(bulletDisplaySummary)}
              {Number.isFinite(bulletDisplaySummary.rank)
                ? bulletDisplaySummary.rank > 0
                  ? ` (#${bulletDisplaySummary.rank})`
                  : ""
                : ""}
            </strong>
          </div>
          <div className="profileMetric">
            <span className="statusLabel">Bullet RD</span>
            <strong>
              {Number.isFinite(bulletDisplaySummary.currentRd)
                ? bulletDisplaySummary.currentRd.toFixed(1)
                : "—"}
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
            <strong>{bulletDisplaySummary.gamesPlayed.toLocaleString("en-US")}</strong>
          </div>
        </div>

        <div className="profileHighlights profileHighlightsTopRow">
          <div className="profileBestWins">
            <div className="profileBestMonthRanksHeader">
              <h2>Best Wins</h2>
              <label htmlFor="profile-best-win-count-select">
                Show
                <select
                  id="profile-best-win-count-select"
                  value={bestWinCount}
                  onChange={(event) => setBestWinCount(Number(event.target.value))}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </label>
            </div>
            {bestWins.length === 0 ? (
              <div className="emptyRankings">No wins available in {selectedMode}.</div>
            ) : (
              <ol>
                {bestWins.map((match) => (
                  <li key={`best-${match.startTs}-${match.firstGameId}`}>
                    <span className="profileBestWinOpponent">
                      <Link
                        className="rankingLink"
                        to="/@/$username"
                        params={{ username: match.opponent }}
                      >
                        {formatOpponentWithRating(match.opponent, match.opponentAfterRating)}
                      </Link>
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

        <div className="profileHighlights profileHighlightsBottomRow">
          <div className="profileBestMonthRanks">
            <div className="profileBestMonthRanksHeader">
              <h2>Best Ranks</h2>
              <label htmlFor="profile-best-month-rank-count-select">
                Show
                <select
                  id="profile-best-month-rank-count-select"
                  value={bestMonthRankCount}
                  onChange={(event) => setBestMonthRankCount(Number(event.target.value))}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </label>
            </div>
            {bestMonthRanks.length === 0 ? (
              <div className="emptyRankings">No monthly ranks available in {selectedMode}.</div>
            ) : (
              <ol>
                {bestMonthRanks.map((monthRank) => (
                  <li key={`best-month-rank-${monthRank.mode}-${monthRank.monthKey}`}>
                    <span className="profileBestMonthRankPrimary">
                      {monthRank.monthLabel} {monthRank.mode} · #{monthRank.rank}
                    </span>
                    <span className="profileBestMonthRankRating">
                      {Number.isFinite(monthRank.rating) ? monthRank.rating.toFixed(1) : "—"}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="profileBestMonthRanks">
            <div className="profileBestMonthRanksHeader">
              <h2>Recent Ranks</h2>
              <label htmlFor="profile-recent-month-rank-count-select">
                Show
                <select
                  id="profile-recent-month-rank-count-select"
                  value={recentMonthRankCount}
                  onChange={(event) => setRecentMonthRankCount(Number(event.target.value))}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </label>
            </div>
            {recentMonthRanks.length === 0 ? (
              <div className="emptyRankings">No monthly ranks available.</div>
            ) : (
              <ol>
                {recentMonthRanks.map((monthRank) => (
                  <li key={`recent-month-rank-${monthRank.mode}-${monthRank.monthKey}`}>
                    <span className="profileBestMonthRankPrimary">
                      {monthRank.monthLabel} {monthRank.mode} · #{monthRank.rank}
                    </span>
                    <span className="profileBestMonthRankRating">
                      {Number.isFinite(monthRank.rating) ? monthRank.rating.toFixed(1) : "—"}
                    </span>
                  </li>
                ))}
              </ol>
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
                        <Link
                          className="rankingLink"
                          to="/@/$username"
                          params={{ username: match.opponent }}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {formatOpponentWithRating(match.opponent, match.opponentAfterRating)}
                        </Link>
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
