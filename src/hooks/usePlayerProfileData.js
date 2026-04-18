import { useEffect, useState } from "react";
import {
  defaultMatchLengthMax,
  isMatchLengthWithinBounds,
  knownSourceKeys,
  modeOptions,
  matchLengthBoundsByMode,
} from "../constants/matches";
import { parseDateInputBoundary } from "../utils/matchFilters";
import { parseTimeControlParts } from "../utils/matchTransforms";
import { fetchLbRows, monthKeyFromMonthValue } from "../lib/supabaseLb";
import { fetchPlayerRatingsRows } from "../lib/supabasePlayerRatings";
import { formatCalendarDate } from "../utils/formatters";

const emptyRatingsSnapshotByMode = {
  blitz: new Map(),
  bullet: new Map(),
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
    const peakDate = String(row?.peak_date || "").slice(0, 10);
    const rd = Number(row?.rd);
    const games = Number(row?.games);
    const rank = Number(row?.rank);
    if (!modeOptions.includes(mode) || !rowUsername) return;

    snapshotsByMode[mode].set(rowUsername, {
      currentRating: rating,
      peakRating: peak,
      peakDate,
      currentRd: rd,
      gamesPlayed: games,
      rank,
    });
  });

  return snapshotsByMode;
};

const normalizeRatingSnapshot = (snapshot) => {
  return {
    currentRating: snapshot?.currentRating ?? null,
    peakRating: snapshot?.peakRating ?? null,
    peakDate: snapshot?.peakDate ?? "",
    currentRd: snapshot?.currentRd ?? null,
    gamesPlayed: snapshot?.gamesPlayed ?? 0,
    rank: snapshot?.rank ?? null,
  };
};

const formatCurrentRating = (summary) => {
  const provisionalSuffix = summary.currentRd >= 100 ? "?" : "";
  return `${summary.currentRating}${provisionalSuffix}`;
};

const formatRankSuffix = (rank) => {
  if (rank <= 0) return "";
  return ` (#${rank})`;
};

export const useMonthRanks = (username) => {
  const [monthRanks, setMonthRanks] = useState([]);

  useEffect(() => {
    const loadMonthRanks = async () => {
      try {
        const rows = await fetchLbRows({ username });
        setMonthRanks(parseMonthRanksFromLbRows(rows));
      } catch {
        setMonthRanks([]);
      }
    };

    loadMonthRanks();
  }, [username]);

  return monthRanks;
};

export const useRatingsSnapshotByMode = (username) => {
  const [ratingsSnapshotByMode, setRatingsSnapshotByMode] = useState(emptyRatingsSnapshotByMode);

  useEffect(() => {
    const loadRatingsSnapshot = async () => {
      try {
        const rows = await fetchPlayerRatingsRows({ username });
        setRatingsSnapshotByMode(parseCurrentRatingsFromRows(rows));
      } catch {
        setRatingsSnapshotByMode(emptyRatingsSnapshotByMode);
      }
    };

    loadRatingsSnapshot();
  }, [username]);

  return ratingsSnapshotByMode;
};

export const getRatingDisplayByMode = (ratingsSnapshotByMode, username) => ({
  blitz: normalizeRatingSnapshot(ratingsSnapshotByMode.blitz.get(username)),
  bullet: normalizeRatingSnapshot(ratingsSnapshotByMode.bullet.get(username)),
});

export const getProfileMetricCards = (blitzDisplaySummary, bulletDisplaySummary) =>
  [
    ["blitz", "Blitz", blitzDisplaySummary],
    ["bullet", "Bullet", bulletDisplaySummary],
  ].flatMap(([mode, label, summary]) => [
    {
      key: `${mode}-rating`,
      label: `${label} Rating`,
      value: `${formatCurrentRating(summary)}${formatRankSuffix(summary.rank)}`,
    },
    {
      key: `${mode}-rd`,
      label: `${label} RD`,
      value: summary.currentRd,
    },
    {
      key: `${mode}-peak-rating`,
      label: `${label} Peak Rating`,
      value: summary.peakRating === 0 ? "N/A" : summary.peakRating,
      subtext:
        summary.peakRating !== null && summary.peakRating !== 0 && summary.peakDate
          ? formatCalendarDate(summary.peakDate)
          : "",
    },
    {
      key: `${mode}-games-played`,
      label: `${label} Games Played`,
      value: summary.gamesPlayed.toLocaleString("en-US"),
    },
  ]);

export const getTimeControlOptions = (matches) => {
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
};

export const filterMatches = (matches, appliedFilters, selectedMode) => {
  const startDateTs = parseDateInputBoundary(appliedFilters.startDateFilter, "start");
  const endDateTs = parseDateInputBoundary(appliedFilters.endDateFilter, "end");

  return matches.filter((match) => {
      if (startDateTs !== null && match.startTs < startDateTs) return false;
      if (endDateTs !== null && match.startTs > endDateTs) return false;

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

      const opponentFilter = String(appliedFilters.opponentFilter || "").trim().toLowerCase();
      if (opponentFilter && !String(match.opponent || "").toLowerCase().includes(opponentFilter)) {
        return false;
      }

      const sourceFilters = appliedFilters.sourceFilters || {};
      const sourceKey = String(match.sourceKey || "unknown").toLowerCase();
      const anyKnownSourceEnabled = Object.values(sourceFilters).some(Boolean);
      if (sourceKey === "unknown") return anyKnownSourceEnabled;
      if (knownSourceKeys.includes(sourceKey)) return sourceFilters[sourceKey];

      return true;
  });
};

export const getBestWins = (filteredMatches, username, bestWinCount) =>
  filteredMatches
    .filter((match) =>
      Array.isArray(match.games) ? match.games.some((game) => game?.winner === username) : false,
    )
    .sort((a, b) => {
      const ratingDiff = (b.opponentAfterRating ?? -Infinity) - (a.opponentAfterRating ?? -Infinity);
      if (ratingDiff !== 0) return ratingDiff;
      return b.startTs - a.startTs;
    })
    .slice(0, bestWinCount);

export const getMonthRankHighlights = (monthRanks, bestMonthRankCount, recentMonthRankCount) => ({
  bestMonthRanks: [...monthRanks]
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return b.monthDate.getTime() - a.monthDate.getTime();
    })
    .slice(0, bestMonthRankCount),
  recentMonthRanks: [...monthRanks]
    .sort((a, b) => b.monthDate.getTime() - a.monthDate.getTime())
    .slice(0, recentMonthRankCount),
});

export const getAliasesForUser = (aliasesLookup, username) =>
  aliasesLookup.get(username)?.members ?? [];

export const toggleExpandedMatchKey = (currentKeys, matchKey) =>
  currentKeys.includes(matchKey)
    ? currentKeys.filter((key) => key !== matchKey)
    : [...currentKeys, matchKey];
