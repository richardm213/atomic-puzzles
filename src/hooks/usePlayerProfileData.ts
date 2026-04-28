import { useEffect, useState } from "react";
import {
  createModeRecord,
  defaultMode,
  defaultMatchLengthMax,
  isMatchLengthWithinBounds,
  knownSourceKeys,
  modeLabels,
  modeOptions,
  matchLengthBoundsByMode,
  type Mode,
  type SourceFilters,
} from "../constants/matches";
import { parseDateInputBoundary } from "../utils/matchFilters";
import { parseTimeControlParts } from "../utils/matchTransforms";
import { fetchLbRows, monthKeyFromMonthValue } from "../lib/supabase/supabaseLb";
import { fetchPlayerRatingsRows } from "../lib/supabase/supabasePlayerRatings";
import { formatCalendarDate } from "../utils/formatters";
import type { NormalizedMatch } from "../lib/matches/matchData";

export type MonthRank = {
  monthKey: string;
  monthDate: Date;
  monthLabel: string;
  mode: Mode;
  rank: number;
  rating: number;
};

export type TopWin = {
  opponent: string;
  gameId: string;
  startTs: number;
  opponentRating: number;
};

export type RatingSnapshot = {
  currentRating: number | null;
  peakRating: number | null;
  peakDate: string;
  currentRd: number | null;
  gamesPlayed: number;
  rank: number | null;
  topWins: TopWin[];
};

export type RatingsSnapshotByMode = Record<Mode, Map<string, RatingSnapshot>>;
export type RatingDisplayByMode = Record<Mode, RatingSnapshot>;

export type AppliedMatchFilters = {
  startDateFilter?: string | null;
  endDateFilter?: string | null;
  matchLengthMin: number;
  matchLengthMax: number;
  timeControlInitialFilter: string;
  timeControlIncrementFilter: string;
  opponentFilter?: string;
  sourceFilters?: Partial<SourceFilters>;
};

export type ProfileMetricCardEntry = {
  key: string;
  label: string;
  value: string | number | null;
  valueSuffix?: string;
  valueLink?: string | null;
  subtext?: string;
};

export type ProfileMetricCardRow = {
  key: string;
  label: string;
  cards: ProfileMetricCardEntry[];
};

const emptyRatingsSnapshotByMode: RatingsSnapshotByMode = createModeRecord(
  () => new Map<string, RatingSnapshot>(),
);

const isMode = (value: unknown): value is Mode =>
  (modeOptions as readonly string[]).includes(String(value));

const parseMonthRanksFromLbRows = (rows: unknown): MonthRank[] => {
  return (Array.isArray(rows) ? rows : [])
    .map((row): MonthRank | null => {
      const r = row as Record<string, unknown>;
      const monthKey = monthKeyFromMonthValue(r?.["month"] as string | null | undefined);
      if (!monthKey) return null;
      const monthDate = new Date(`${String(r["month"]).slice(0, 10)}T00:00:00Z`);
      const mode = String(r?.["tc"] ?? "").toLowerCase();
      const rank = Number(r?.["rank"]);
      const rating = Number(r?.["rating"]);
      if (!isMode(mode) || rank <= 0) return null;

      return {
        monthKey,
        monthDate,
        monthLabel: monthKey,
        mode,
        rank,
        rating,
      };
    })
    .filter((entry): entry is MonthRank => entry !== null);
};

const parseTopWinEntry = (entry: unknown): TopWin | null => {
  const [opponent, gameId, startTs, opponentRating] = String(entry ?? "").split(":");
  const normalizedOpponent = String(opponent ?? "").trim();
  const normalizedGameId = String(gameId ?? "").trim();
  const numericStartTs = Number(startTs);
  const numericOpponentRating = Number(opponentRating);
  if (
    !normalizedOpponent ||
    !normalizedGameId ||
    Number.isNaN(numericStartTs) ||
    Number.isNaN(numericOpponentRating)
  ) {
    return null;
  }

  return {
    opponent: normalizedOpponent,
    gameId: normalizedGameId,
    startTs: numericStartTs,
    opponentRating: numericOpponentRating,
  };
};

const parseTopWins = (serializedWins: unknown): TopWin[] =>
  String(serializedWins ?? "")
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseTopWinEntry)
    .filter((entry): entry is TopWin => entry !== null);

const parseCurrentRatingsFromRows = (rows: unknown): RatingsSnapshotByMode => {
  const snapshotsByMode: RatingsSnapshotByMode = createModeRecord(
    () => new Map<string, RatingSnapshot>(),
  );

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const r = row as Record<string, unknown>;
    const mode = String(r?.["tc"] ?? "").toLowerCase();
    const rowUsername = String(r?.["username"] ?? "").trim();
    const rating = Number(r?.["rating"]);
    const peak = Number(r?.["peak"]);
    const peakDate = String(r?.["peak_date"] ?? "").slice(0, 10);
    const rd = Number(r?.["rd"]);
    const games = Number(r?.["games"]);
    const rank = Number(r?.["rank"]);
    const topWins = parseTopWins(r?.["top20_wins"]);
    if (!isMode(mode) || !rowUsername) return;

    snapshotsByMode[mode].set(rowUsername, {
      currentRating: rating,
      peakRating: peak,
      peakDate,
      currentRd: rd,
      gamesPlayed: games,
      rank,
      topWins,
    });
  });

  return snapshotsByMode;
};

const normalizeRatingSnapshot = (snapshot: RatingSnapshot | undefined | null): RatingSnapshot => {
  return {
    currentRating: snapshot?.currentRating ?? null,
    peakRating: snapshot?.peakRating ?? null,
    peakDate: snapshot?.peakDate ?? "",
    currentRd: snapshot?.currentRd ?? null,
    gamesPlayed: snapshot?.gamesPlayed ?? 0,
    rank: snapshot?.rank ?? null,
    topWins: Array.isArray(snapshot?.topWins) ? snapshot.topWins : [],
  };
};

const formatCurrentRating = (summary: RatingSnapshot): string => {
  const provisionalSuffix = (summary.currentRd ?? 0) >= 100 ? "?" : "";
  return `${summary.currentRating}${provisionalSuffix}`;
};

const formatRankSuffix = (rank: number | null): string => {
  if (!rank || rank <= 0) return "";
  return ` (#${rank})`;
};

export const buildRankingsLocation = (
  monthKey: string | null | undefined,
  mode: Mode | string,
): string => {
  const [month, year] = String(monthKey ?? "")
    .trim()
    .split(/\s+/);
  if (!month || !year || !isMode(mode)) return "";
  const params = [
    `month=${encodeURIComponent(month)}`,
    `year=${encodeURIComponent(year)}`,
    `mode=${encodeURIComponent(mode)}`,
  ];
  return `/rankings?${params.join("&")}`;
};

export const useMonthRanks = (username: string): MonthRank[] => {
  const [monthRanks, setMonthRanks] = useState<MonthRank[]>([]);

  useEffect(() => {
    const loadMonthRanks = async (): Promise<void> => {
      try {
        const rows = await fetchLbRows({ username });
        setMonthRanks(parseMonthRanksFromLbRows(rows));
      } catch {
        setMonthRanks([]);
      }
    };

    void loadMonthRanks();
  }, [username]);

  return monthRanks;
};

export const useRatingsSnapshotByMode = (username: string): RatingsSnapshotByMode => {
  const [ratingsSnapshotByMode, setRatingsSnapshotByMode] = useState<RatingsSnapshotByMode>(
    emptyRatingsSnapshotByMode,
  );

  useEffect(() => {
    const loadRatingsSnapshot = async (): Promise<void> => {
      try {
        const rows = await fetchPlayerRatingsRows({ username });
        setRatingsSnapshotByMode(parseCurrentRatingsFromRows(rows));
      } catch {
        setRatingsSnapshotByMode(emptyRatingsSnapshotByMode);
      }
    };

    void loadRatingsSnapshot();
  }, [username]);

  return ratingsSnapshotByMode;
};

export const getRatingDisplayByMode = (
  ratingsSnapshotByMode: RatingsSnapshotByMode,
  username: string,
): RatingDisplayByMode =>
  Object.fromEntries(
    modeOptions.map((mode) => [
      mode,
      normalizeRatingSnapshot(ratingsSnapshotByMode[mode]?.get(username) ?? null),
    ]),
  ) as RatingDisplayByMode;

export const getProfileMetricCardRows = (
  ratingDisplayByMode: RatingDisplayByMode,
  latestMonthKeyByMode: Partial<Record<Mode, string>> = {},
): ProfileMetricCardRow[] =>
  modeOptions.map((mode): ProfileMetricCardRow => {
    const label = modeLabels[mode] ?? mode;
    const summary = ratingDisplayByMode[mode] ?? normalizeRatingSnapshot(null);
    const rankingsLocation = buildRankingsLocation(latestMonthKeyByMode[mode], mode);
    return {
      key: `${mode}-row`,
      label,
      cards: [
        {
          key: `${mode}-rating`,
          label: "Rating",
          value: formatCurrentRating(summary),
          valueSuffix: formatRankSuffix(summary.rank),
          valueLink: (summary.rank ?? 0) > 0 && rankingsLocation ? rankingsLocation : null,
        },
        {
          key: `${mode}-rd`,
          label: "RD",
          value: summary.currentRd,
        },
        {
          key: `${mode}-peak-rating`,
          label: "Peak Rating",
          value: summary.peakRating === 0 ? "N/A" : summary.peakRating,
          subtext:
            summary.peakRating !== null && summary.peakRating !== 0 && summary.peakDate
              ? formatCalendarDate(summary.peakDate)
              : "",
        },
        {
          key: `${mode}-games-played`,
          label: "Games Played",
          value: summary.gamesPlayed.toLocaleString("en-US"),
        },
      ],
    };
  });

export const getBestWinsForMode = (
  ratingDisplayByMode: RatingDisplayByMode,
  mode: Mode,
  bestWinCount: number,
): TopWin[] => (ratingDisplayByMode[mode]?.topWins ?? []).slice(0, bestWinCount);

export const filterMatches = (
  matches: NormalizedMatch[],
  appliedFilters: AppliedMatchFilters,
  selectedMode: Mode,
): NormalizedMatch[] => {
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
        matchLengthBoundsByMode[selectedMode]?.max ??
          matchLengthBoundsByMode[defaultMode]?.max ??
          defaultMatchLengthMax,
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

    const opponentFilter = String(appliedFilters.opponentFilter ?? "")
      .trim()
      .toLowerCase();
    if (
      opponentFilter &&
      !String(match.opponent ?? "")
        .toLowerCase()
        .includes(opponentFilter)
    ) {
      return false;
    }

    const sourceFilters = appliedFilters.sourceFilters ?? {};
    const sourceKey = String(match.sourceKey ?? "unknown").toLowerCase();
    const anyKnownSourceEnabled = Object.values(sourceFilters).some(Boolean);
    if (sourceKey === "unknown") return anyKnownSourceEnabled;
    if ((knownSourceKeys as string[]).includes(sourceKey)) {
      return Boolean(sourceFilters[sourceKey as keyof SourceFilters]);
    }

    return true;
  });
};

export const getMonthRankHighlights = (
  monthRanks: MonthRank[],
  bestMonthRankCount: number,
  recentMonthRankCount: number,
): { bestMonthRanks: MonthRank[]; recentMonthRanks: MonthRank[] } => ({
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
