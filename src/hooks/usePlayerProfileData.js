import { useEffect, useMemo, useState } from "react";
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
    const rd = Number(row?.rd);
    const games = Number(row?.games);
    const rank = Number(row?.rank);
    if (!modeOptions.includes(mode) || !rowUsername) return;

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

const normalizeRatingSnapshot = (snapshot) => {
  return {
    currentRating: snapshot?.currentRating ?? null,
    peakRating: snapshot?.peakRating ?? null,
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
  const [ratingsSnapshotByMode, setRatingsSnapshotByMode] = useState({
    blitz: new Map(),
    bullet: new Map(),
  });

  useEffect(() => {
    const loadRatingsSnapshot = async () => {
      try {
        const rows = await fetchPlayerRatingsRows({ username });
        setRatingsSnapshotByMode(parseCurrentRatingsFromRows(rows));
      } catch {
        setRatingsSnapshotByMode({
          blitz: new Map(),
          bullet: new Map(),
        });
      }
    };

    loadRatingsSnapshot();
  }, [username]);

  return ratingsSnapshotByMode;
};

export const useRatingDisplayByMode = (ratingsSnapshotByMode, username) => {
  return useMemo(
    () => ({
      blitz: normalizeRatingSnapshot(ratingsSnapshotByMode.blitz.get(username)),
      bullet: normalizeRatingSnapshot(ratingsSnapshotByMode.bullet.get(username)),
    }),
    [ratingsSnapshotByMode, username],
  );
};

export const useProfileMetricCards = (blitzDisplaySummary, bulletDisplaySummary) => {
  return useMemo(
    () => [
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
    ],
    [blitzDisplaySummary, bulletDisplaySummary],
  );
};

export const useTimeControlOptions = (matches) => {
  return useMemo(() => {
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
};

export const useFilteredMatches = (matches, appliedFilters, selectedMode) => {
  const startDateTs = useMemo(
    () => parseDateInputBoundary(appliedFilters.startDateFilter, "start"),
    [appliedFilters.startDateFilter],
  );
  const endDateTs = useMemo(
    () => parseDateInputBoundary(appliedFilters.endDateFilter, "end"),
    [appliedFilters.endDateFilter],
  );

  return useMemo(() => {
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
  }, [appliedFilters, matches, selectedMode, startDateTs, endDateTs]);
};

export const useBestWins = (filteredMatches, username, bestWinCount) => {
  return useMemo(() => {
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
};

export const useMonthRankHighlights = (monthRanks, bestMonthRankCount, recentMonthRankCount) => {
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

  return {
    bestMonthRanks,
    recentMonthRanks,
  };
};

export const useAliasesForUser = (aliasesLookup, username) => {
  return useMemo(() => {
    const entry = aliasesLookup.get(username);
    if (!entry) return [];
    return entry.members;
  }, [aliasesLookup, username]);
};

export const useExpandedMatchKeys = (currentPage, selectedMode, appliedFilters, username) => {
  const [expandedMatchKeys, setExpandedMatchKeys] = useState([]);

  useEffect(() => {
    setExpandedMatchKeys([]);
  }, [currentPage, selectedMode, appliedFilters, username]);

  const toggleExpandedMatchKey = (matchKey) => {
    setExpandedMatchKeys((current) =>
      current.includes(matchKey)
        ? current.filter((key) => key !== matchKey)
        : [...current, matchKey],
    );
  };

  return {
    expandedMatchKeys,
    toggleExpandedMatchKey,
  };
};
