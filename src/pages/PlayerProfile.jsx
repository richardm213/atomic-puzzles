import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  defaultMatchLengthMax,
  defaultMatchLengthMin,
  defaultRatingMax,
  defaultRatingMin,
  isMatchLengthWithinBounds,
  matchLengthBoundsByMode,
  modeOptions,
  opponentRatingSliderMax,
  opponentRatingSliderMin,
  pageSizeOptions,
} from "../constants/matches";
import { useAliasesLookup } from "../hooks/useAliasesLookup";
import {
  formatLocalDateTime,
  formatOpponentWithRating,
  formatScore,
  formatSignedDecimal,
} from "../utils/formatters";
import { parseTimeControlParts } from "../utils/matchTransforms";
import { loadRawMatchesByMode, normalizeMatches } from "../lib/matchData";
import { fetchLbRows, monthKeyFromMonthValue } from "../lib/supabaseLb";
import { fetchPlayerRatingsRows } from "../lib/supabasePlayerRatings";
import { ProfileMetricCard } from "../components/ProfileMetricCard";

const parseMonthRanksFromLbRows = (rows) => {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const monthKey = monthKeyFromMonthValue(row?.month);
      if (!monthKey) return null;
      const monthDate = new Date(`${String(row.month).slice(0, 10)}T00:00:00Z`);
      const mode = String(row?.tc || "").toLowerCase();
      const rank = Number(row?.rank);
      const rating = Number(row?.rating);
      if (!modeOptions.includes(mode) || rank <= 0) return null;

      return {
        monthKey,
        monthDate,
        monthLabel: monthKey,
        mode,
        rank,
        rating,
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
    const peak = Number(row?.peak);
    const rd = Number(row?.rd);
    const games = Number(row?.games);
    const rank = Number(row?.rank);
    if (!modeOptions.includes(mode)) return;
    if (!rowUsername) return;

    snapshotsByMode[mode].set(rowUsername, {
      currentRating: rating,
      peakRating: peak,
      currentRd: rd,
      gamesPlayed: games,
      rank,
    });
  });

  return snapshotsByMode;
};

const loadCurrentRatingsSnapshot = async (username) => {
  const rows = await fetchPlayerRatingsRows({ username });
  return parseCurrentRatingsFromRows(rows);
};

const normalizeRatingSnapshot = (snapshot) => {
  return {
    currentRating: snapshot?.currentRating ?? null,
    peakRating: snapshot?.peakRating ?? null,
    currentRd: snapshot?.currentRd ?? null,
    gamesPlayed: snapshot?.gamesPlayed ?? 0,
    rank: snapshot?.rank ?? null,
  };
};

export const PlayerProfilePage = ({ username }) => {
  const [selectedMode, setSelectedMode] = useState("blitz");
  const [matchesByMode, setMatchesByMode] = useState({
    blitz: [],
    bullet: [],
  });
  const [totalMatchesByMode, setTotalMatchesByMode] = useState({
    blitz: 0,
    bullet: 0,
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
  const [loadingMatches, setLoadingMatches] = useState(false);
  const aliasesLookup = useAliasesLookup();
  const [ratingsSnapshotByMode, setRatingsSnapshotByMode] = useState({
    blitz: new Map(),
    bullet: new Map(),
  });
  const [monthRanks, setMonthRanks] = useState([]);
  const [bestMonthRankCount, setBestMonthRankCount] = useState(5);
  const [recentMonthRankCount, setRecentMonthRankCount] = useState(5);
  const [bestWinCount, setBestWinCount] = useState(5);
  const [appliedFilters, setAppliedFilters] = useState({
    matchLengthMin: Math.max(defaultMatchLengthMin, initialMatchBounds.min),
    matchLengthMax: Math.min(defaultMatchLengthMax, initialMatchBounds.max),
    opponentRatingMin: defaultRatingMin,
    opponentRatingMax: defaultRatingMax,
    timeControlInitialFilter: "all",
    timeControlIncrementFilter: "all",
  });
  const matchLengthBounds = matchLengthBoundsByMode[selectedMode] ?? matchLengthBoundsByMode.blitz;

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

  const runMatchSearch = async (mode, nextAppliedFilters, nextPage = 1) => {
    setLoadingMatches(true);
    setError("");
    try {
      const selectedInitial = nextAppliedFilters.timeControlInitialFilter;
      const selectedIncrement = nextAppliedFilters.timeControlIncrementFilter;
      const timeControl =
        selectedInitial !== "all" && selectedIncrement !== "all"
          ? `${selectedInitial}+${selectedIncrement}`
          : "";
      const loaded = await loadRawMatchesByMode(mode, {
        filters: {
          username,
          timeControl,
          opponentRatingMin: nextAppliedFilters.opponentRatingMin,
          opponentRatingMax: nextAppliedFilters.opponentRatingMax,
        },
        page: nextPage,
        pageSize,
      });
      setMatchesByMode((current) => ({
        ...current,
        [mode]: normalizeMatches(loaded.matches, username),
      }));
      setTotalMatchesByMode((current) => ({
        ...current,
        [mode]: loaded.total,
      }));
      setAppliedFilters(nextAppliedFilters);
      setPage(nextPage);
    } catch (loadError) {
      setMatchesByMode((current) => ({
        ...current,
        [mode]: [],
      }));
      setTotalMatchesByMode((current) => ({
        ...current,
        [mode]: 0,
      }));
      setError(String(loadError));
    } finally {
      setLoadingMatches(false);
    }
  };

  useEffect(() => {
    const defaultFilters = {
      matchLengthMin: Math.max(defaultMatchLengthMin, initialMatchBounds.min),
      matchLengthMax: Math.min(defaultMatchLengthMax, initialMatchBounds.max),
      opponentRatingMin: defaultRatingMin,
      opponentRatingMax: defaultRatingMax,
      timeControlInitialFilter: "all",
      timeControlIncrementFilter: "all",
    };
    runMatchSearch("blitz", defaultFilters, 1);
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
      if (
        !isMatchLengthWithinBounds(
          match.gameCount,
          appliedFilters.matchLengthMin,
          appliedFilters.matchLengthMax,
          matchLengthBoundsByMode[selectedMode]?.max ?? defaultMatchLengthMax,
        )
      ) {
        return false;
      }

      const { initial, increment } = parseTimeControlParts(match.timeControl);
      if (
        appliedFilters.timeControlInitialFilter !== "all" &&
        initial !== appliedFilters.timeControlInitialFilter
      ) {
        return false;
      }
      if (
        appliedFilters.timeControlIncrementFilter !== "all" &&
        increment !== appliedFilters.timeControlIncrementFilter
      ) {
        return false;
      }

      return true;
    });
  }, [matches, appliedFilters, selectedMode]);

  const handleSearchClick = async () => {
    await runMatchSearch(
      selectedMode,
      {
        matchLengthMin,
        matchLengthMax,
        opponentRatingMin,
        opponentRatingMax,
        timeControlInitialFilter,
        timeControlIncrementFilter,
      },
      1,
    );
  };

  const totalPages = Math.max(
    1,
    Math.ceil((totalMatchesByMode[selectedMode] ?? 0) / Math.max(1, pageSize)),
  );
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    if (currentPage !== page) {
      setPage(currentPage);
      return;
    }
    if (appliedFilters && totalPages > 0) {
      runMatchSearch(selectedMode, appliedFilters, currentPage);
    }
  }, [currentPage, pageSize, selectedMode]);

  useEffect(() => {
    setExpandedMatchKeys([]);
  }, [currentPage, selectedMode, appliedFilters, username]);

  const ratingDisplayByMode = useMemo(() => {
    return {
      blitz: normalizeRatingSnapshot(ratingsSnapshotByMode.blitz.get(username)),
      bullet: normalizeRatingSnapshot(ratingsSnapshotByMode.bullet.get(username)),
    };
  }, [ratingsSnapshotByMode, username]);
  const blitzDisplaySummary = ratingDisplayByMode.blitz;
  const bulletDisplaySummary = ratingDisplayByMode.bullet;

  const bestWins = useMemo(() => {
    return filteredMatches
      .filter((match) =>
        Array.isArray(match.games) ? match.games.some((game) => game?.winner === username) : false,
      )
      .sort((a, b) => {
        const ratingDiff =
          (b.opponentAfterRating ?? -Infinity) - (a.opponentAfterRating ?? -Infinity);
        if (ratingDiff !== 0) return ratingDiff;
        return b.startTs - a.startTs;
      })
      .slice(0, bestWinCount);
  }, [bestWinCount, filteredMatches, username]);
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
    const entry = aliasesLookup.get(username);
    if (!entry) return [];
    return entry.members.filter((member) => member.toLowerCase() !== username);
  }, [aliasesLookup, username]);

  const formatCurrentRating = (summary) => {
    const provisionalSuffix = summary.currentRd >= 100 ? "?" : "";
    return `${summary.currentRating}${provisionalSuffix}`;
  };
  const formatRankSuffix = (rank) => {
    if (rank <= 0) return "";
    return ` (#${rank})`;
  };
  const profileMetricCards = [
    {
      key: "blitz-rating",
      label: "Blitz Rating",
      value: `${formatCurrentRating(blitzDisplaySummary)}${formatRankSuffix(blitzDisplaySummary.rank)}`,
    },
    {
      key: "blitz-rd",
      label: "Blitz RD",
      value: blitzDisplaySummary.currentRd,
    },
    {
      key: "blitz-peak-rating",
      label: "Blitz Peak Rating",
      value: blitzDisplaySummary.peakRating,
    },
    {
      key: "blitz-games-played",
      label: "Blitz Games Played",
      value: blitzDisplaySummary.gamesPlayed.toLocaleString("en-US"),
    },
    {
      key: "bullet-rating",
      label: "Bullet Rating",
      value: `${formatCurrentRating(bulletDisplaySummary)}${formatRankSuffix(bulletDisplaySummary.rank)}`,
    },
    {
      key: "bullet-rd",
      label: "Bullet RD",
      value: bulletDisplaySummary.currentRd,
    },
    {
      key: "bullet-peak-rating",
      label: "Bullet Peak Rating",
      value: bulletDisplaySummary.peakRating,
    },
    {
      key: "bullet-games-played",
      label: "Bullet Games Played",
      value: bulletDisplaySummary.gamesPlayed.toLocaleString("en-US"),
    },
  ];

  return (
    <div className="rankingsPage">
      <div className="panel rankingsPanel">
        <h1>{username}</h1>

        <div className="profileTopBar">
          {profileMetricCards.map((card) => (
            <ProfileMetricCard key={card.key} label={card.label} value={card.value} />
          ))}
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
                    <span className="profileBestMonthRankRating">{monthRank.rating}</span>
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
                    <span className="profileBestMonthRankRating">{monthRank.rating}</span>
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
          <button
            className="analyzeButton"
            type="button"
            onClick={handleSearchClick}
            disabled={loadingMatches}
          >
            {loadingMatches ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="opponentRatingFilter">
          <label htmlFor="match-length-min">
            Match length range: {matchLengthMin} -
            {matchLengthMax >= matchLengthBounds.max ? `${matchLengthBounds.max}+` : matchLengthMax}
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
              {filteredMatches.map((match) => {
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
                      <td>{`${match.afterRating}(${formatSignedDecimal(match.ratingChange)})`}</td>
                      <td>{`${match.afterRd}(${formatSignedDecimal(match.rdChange)})`}</td>
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
              {filteredMatches.length === 0 ? (
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
