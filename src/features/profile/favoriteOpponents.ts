import { type Mode, modeOptions } from "../../constants/matches";
import type { NormalizedMatch } from "../../lib/matches/matchData";
import { normalizeUsername } from "../../utils/playerNames";

export type RankHistoryMode = Mode | "all";

export type FavoriteOpponentSort =
  | "opponent"
  | "matches"
  | "score"
  | "games"
  | "ratingGain"
  | "performance"
  | "recent"
  | "timeControl";

export type FavoriteOpponentSortDirection = "asc" | "desc";

export type FavoriteOpponentMatch = NormalizedMatch & { mode: Mode };

export type FavoriteOpponentRow = {
  opponent: string;
  matchCount: number;
  gameCount: number;
  playerScore: number;
  opponentScore: number;
  ratingChange: number;
  ratedMatchCount: number;
  performanceScore: number | null;
  performanceSortScore: number | null;
  mostRecentTs: number;
  favoriteTimeControl: string;
  favoriteTimeControlCount: number;
  matches: FavoriteOpponentMatch[];
};

const STORAGE_KEYS = {
  mode: "atomic-puzzles:profile-favorite-opponent-mode",
  matchLimit: "atomic-puzzles:profile-favorite-opponent-match-limit",
  sort: "atomic-puzzles:profile-favorite-opponent-sort",
  sortDirection: "atomic-puzzles:profile-favorite-opponent-sort-direction",
} as const;

const DEFAULT_MATCH_LIMIT = 500;
const ALL_MODE_MATCH_LIMIT_OPTIONS = [250, 500, 1000, 1500, 2000];
const SINGLE_MODE_MATCH_LIMIT_OPTIONS = [250, 500, 1000, 1500, 2000, 5000];
const SCORE_CONFIDENCE_Z = 1.281551565545;
const PERFORMANCE_SCORE_RATE_MIN = 0.01;
const PERFORMANCE_SCORE_RATE_MAX = 0.99;
const PERFORMANCE_CONFIDENCE_SCALE = 400;
const MAX_COUNTED_RATING_CHANGE_RD = 90;

export const favoriteOpponentPageSize = 200;
export const favoriteOpponentDisplayCountOptions = [25, 50, 100];
export const favoriteOpponentSortLabels = {
  opponent: "Opponent",
  matches: "Most matches",
  score: "Best score",
  games: "Most games",
  ratingGain: "Most rating gain",
  performance: "Best performance",
  recent: "Most recent",
  timeControl: "Most played TC",
} satisfies Record<FavoriteOpponentSort, string>;
export const favoriteOpponentSortOptions = Object.keys(
  favoriteOpponentSortLabels,
) as FavoriteOpponentSort[];

export const isFavoriteOpponentSort = (value: string): value is FavoriteOpponentSort =>
  (favoriteOpponentSortOptions as readonly string[]).includes(value);

const isFavoriteOpponentSortDirection = (value: string): value is FavoriteOpponentSortDirection =>
  value === "asc" || value === "desc";

export const getFavoriteOpponentDefaultSortDirection = (
  sort: FavoriteOpponentSort,
): FavoriteOpponentSortDirection => (sort === "opponent" ? "asc" : "desc");

export const isFavoriteOpponentMode = (value: string): value is RankHistoryMode =>
  value === "all" || (modeOptions as readonly string[]).includes(value);

export const getFavoriteOpponentMatchLimitOptions = (mode: RankHistoryMode): number[] =>
  mode === "all" ? ALL_MODE_MATCH_LIMIT_OPTIONS : SINGLE_MODE_MATCH_LIMIT_OPTIONS;

export const getFavoriteOpponentAllowedMatchLimit = (
  mode: RankHistoryMode,
  requestedMatchLimit: number,
): number => {
  const options = getFavoriteOpponentMatchLimitOptions(mode);
  if (options.includes(requestedMatchLimit)) return requestedMatchLimit;
  return options.filter((option) => option <= requestedMatchLimit).at(-1) ?? DEFAULT_MATCH_LIMIT;
};

export const getStoredFavoriteOpponentMode = (): RankHistoryMode => {
  if (typeof window === "undefined") return "all";
  try {
    const storedMode = window.localStorage.getItem(STORAGE_KEYS.mode) ?? "";
    return isFavoriteOpponentMode(storedMode) ? storedMode : "all";
  } catch {
    return "all";
  }
};

export const getStoredFavoriteOpponentMatchLimit = (
  mode: RankHistoryMode = getStoredFavoriteOpponentMode(),
): number => {
  if (typeof window === "undefined") return DEFAULT_MATCH_LIMIT;
  try {
    return getFavoriteOpponentAllowedMatchLimit(
      mode,
      Number(window.localStorage.getItem(STORAGE_KEYS.matchLimit)),
    );
  } catch {
    return DEFAULT_MATCH_LIMIT;
  }
};

export const getStoredFavoriteOpponentSort = (): FavoriteOpponentSort => {
  if (typeof window === "undefined") return "matches";
  try {
    const storedSort = window.localStorage.getItem(STORAGE_KEYS.sort) ?? "";
    return isFavoriteOpponentSort(storedSort) ? storedSort : "matches";
  } catch {
    return "matches";
  }
};

export const getStoredFavoriteOpponentSortDirection = (): FavoriteOpponentSortDirection => {
  if (typeof window === "undefined") return "desc";
  try {
    const storedDirection = window.localStorage.getItem(STORAGE_KEYS.sortDirection) ?? "";
    return isFavoriteOpponentSortDirection(storedDirection) ? storedDirection : "desc";
  } catch {
    return "desc";
  }
};

const storePreference = (key: string, value: string): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The in-memory selection still applies when storage is unavailable.
  }
};

export const setStoredFavoriteOpponentMode = (mode: RankHistoryMode): void =>
  storePreference(STORAGE_KEYS.mode, mode);

export const setStoredFavoriteOpponentMatchLimit = (matchLimit: number): void =>
  storePreference(STORAGE_KEYS.matchLimit, String(matchLimit));

export const setStoredFavoriteOpponentSort = (sort: FavoriteOpponentSort): void =>
  storePreference(STORAGE_KEYS.sort, sort);

export const setStoredFavoriteOpponentSortDirection = (
  direction: FavoriteOpponentSortDirection,
): void => storePreference(STORAGE_KEYS.sortDirection, direction);

const favoriteTimeControlFromCounts = (
  counts: Map<string, { gameCount: number; latestTs: number }>,
): { favoriteTimeControl: string; favoriteTimeControlCount: number } => {
  const favorite = [...counts.entries()].sort((left, right) => {
    const countDifference = right[1].gameCount - left[1].gameCount;
    return countDifference !== 0 ? countDifference : right[1].latestTs - left[1].latestTs;
  })[0];
  return {
    favoriteTimeControl: favorite?.[0] ?? "—",
    favoriteTimeControlCount: favorite?.[1].gameCount ?? 0,
  };
};

const getMatchPerformanceScore = ({
  opponentRating,
  playerScore,
  opponentScore,
}: {
  opponentRating: number;
  playerScore: number;
  opponentScore: number;
}): number | null => {
  const scoreTotal = playerScore + opponentScore;
  if (!Number.isFinite(opponentRating) || scoreTotal <= 0) return null;
  const scoreRate = Math.min(
    PERFORMANCE_SCORE_RATE_MAX,
    Math.max(PERFORMANCE_SCORE_RATE_MIN, playerScore / scoreTotal),
  );
  return opponentRating + 400 * Math.log10(scoreRate / (1 - scoreRate));
};

const shouldCountRatingChange = (match: FavoriteOpponentMatch): boolean =>
  Number.isFinite(match.ratingChange) &&
  Number.isFinite(match.beforeRd) &&
  match.beforeRd < MAX_COUNTED_RATING_CHANGE_RD;

const getPerformanceSortScore = (
  performanceScore: number | null,
  performanceGameCount: number,
): number | null => {
  if (performanceScore === null || performanceGameCount <= 0) return null;
  return (
    performanceScore -
    (SCORE_CONFIDENCE_Z * PERFORMANCE_CONFIDENCE_SCALE) / Math.sqrt(performanceGameCount)
  );
};

type FavoriteOpponentAccumulator = Omit<
  FavoriteOpponentRow,
  "performanceScore" | "performanceSortScore" | "favoriteTimeControl" | "favoriteTimeControlCount"
> & {
  performanceScoreTotal: number;
  performanceScoreGameCount: number;
  timeControlCounts: Map<string, { gameCount: number; latestTs: number }>;
};

export const getFavoriteOpponentRows = (
  matches: FavoriteOpponentMatch[],
): FavoriteOpponentRow[] => {
  const rowsByOpponent = new Map<string, FavoriteOpponentAccumulator>();

  for (const match of matches) {
    const opponentKey = normalizeUsername(match.opponent);
    if (!opponentKey) continue;

    const row = rowsByOpponent.get(opponentKey) ?? {
      opponent: match.opponent,
      matchCount: 0,
      gameCount: 0,
      playerScore: 0,
      opponentScore: 0,
      ratingChange: 0,
      ratedMatchCount: 0,
      performanceScoreTotal: 0,
      performanceScoreGameCount: 0,
      mostRecentTs: Number.NEGATIVE_INFINITY,
      timeControlCounts: new Map<string, { gameCount: number; latestTs: number }>(),
      matches: [],
    };

    const matchGameCount =
      Number.isFinite(match.gameCount) && match.gameCount > 0
        ? match.gameCount
        : match.playerScore + match.opponentScore;
    row.matchCount += 1;
    row.playerScore += match.playerScore;
    row.opponentScore += match.opponentScore;
    row.gameCount += matchGameCount;
    if (shouldCountRatingChange(match)) {
      row.ratingChange += match.ratingChange;
      row.ratedMatchCount += 1;
    }

    const performanceScore = getMatchPerformanceScore({
      opponentRating: Number.isFinite(match.opponentBeforeRating)
        ? match.opponentBeforeRating
        : match.opponentAfterRating,
      playerScore: match.playerScore,
      opponentScore: match.opponentScore,
    });
    if (performanceScore !== null) {
      row.performanceScoreTotal += performanceScore * matchGameCount;
      row.performanceScoreGameCount += matchGameCount;
    }
    row.mostRecentTs = Math.max(row.mostRecentTs, match.startTs);
    row.matches.push(match);

    const timeControl = match.timeControl || "—";
    const timeControlEntry = row.timeControlCounts.get(timeControl) ?? {
      gameCount: 0,
      latestTs: Number.NEGATIVE_INFINITY,
    };
    timeControlEntry.gameCount += matchGameCount;
    timeControlEntry.latestTs = Math.max(timeControlEntry.latestTs, match.startTs);
    row.timeControlCounts.set(timeControl, timeControlEntry);
    rowsByOpponent.set(opponentKey, row);
  }

  return [...rowsByOpponent.values()]
    .map(({ performanceScoreTotal, performanceScoreGameCount, timeControlCounts, ...row }) => {
      const performanceScore =
        performanceScoreGameCount > 0
          ? Math.round(performanceScoreTotal / performanceScoreGameCount)
          : null;
      return {
        ...row,
        performanceScore,
        performanceSortScore: getPerformanceSortScore(performanceScore, performanceScoreGameCount),
        matches: [...row.matches].sort((left, right) => right.startTs - left.startTs),
        ...favoriteTimeControlFromCounts(timeControlCounts),
      };
    })
    .sort((left, right) => {
      const matchDifference = right.matchCount - left.matchCount;
      if (matchDifference !== 0) return matchDifference;
      const recencyDifference = right.mostRecentTs - left.mostRecentTs;
      return recencyDifference !== 0
        ? recencyDifference
        : left.opponent.localeCompare(right.opponent);
    });
};

const getBestScoreValue = (row: FavoriteOpponentRow): number => {
  if (row.gameCount <= 0) return Number.NEGATIVE_INFINITY;
  const scoreRate = row.playerScore / row.gameCount;
  const zSquared = SCORE_CONFIDENCE_Z * SCORE_CONFIDENCE_Z;
  const confidencePenalty =
    SCORE_CONFIDENCE_Z *
    Math.sqrt((scoreRate * (1 - scoreRate) + zSquared / (4 * row.gameCount)) / row.gameCount);
  return (
    (scoreRate + zSquared / (2 * row.gameCount) - confidencePenalty) /
    (1 + zSquared / row.gameCount)
  );
};

const compareByPrimarySort = (
  left: FavoriteOpponentRow,
  right: FavoriteOpponentRow,
  sort: FavoriteOpponentSort,
): number => {
  if (sort === "opponent") return left.opponent.localeCompare(right.opponent);
  if (sort === "score") {
    const difference = getBestScoreValue(left) - getBestScoreValue(right);
    if (difference !== 0) return difference;
    const margin =
      left.playerScore - left.opponentScore - (right.playerScore - right.opponentScore);
    if (margin !== 0) return margin;
  }
  if (sort === "games") {
    const difference = left.gameCount - right.gameCount;
    if (difference !== 0) return difference;
  }
  if (sort === "ratingGain") {
    const availability = Number(left.ratedMatchCount > 0) - Number(right.ratedMatchCount > 0);
    if (availability !== 0) return availability;
    const difference =
      (left.ratedMatchCount > 0 ? Math.max(0, left.ratingChange) : 0) -
      (right.ratedMatchCount > 0 ? Math.max(0, right.ratingChange) : 0);
    if (difference !== 0) return difference;
  }
  if (sort === "performance") {
    const availability =
      Number(left.performanceSortScore !== null) - Number(right.performanceSortScore !== null);
    if (availability !== 0) return availability;
    const difference = (left.performanceSortScore ?? 0) - (right.performanceSortScore ?? 0);
    if (difference !== 0) return difference;
  }
  if (sort === "recent") {
    const difference = left.mostRecentTs - right.mostRecentTs;
    if (difference !== 0) return difference;
  }
  if (sort === "timeControl") {
    const difference = left.favoriteTimeControlCount - right.favoriteTimeControlCount;
    return difference !== 0
      ? difference
      : left.favoriteTimeControl.localeCompare(right.favoriteTimeControl);
  }
  return left.matchCount - right.matchCount;
};

export const compareFavoriteOpponentRows = (
  left: FavoriteOpponentRow,
  right: FavoriteOpponentRow,
  sort: FavoriteOpponentSort,
  direction: FavoriteOpponentSortDirection,
): number => {
  const primaryDifference = compareByPrimarySort(left, right, sort);
  if (primaryDifference !== 0) return direction === "asc" ? primaryDifference : -primaryDifference;
  const matchDifference = right.matchCount - left.matchCount;
  if (matchDifference !== 0) return matchDifference;
  if (sort !== "games") {
    const gameDifference = right.gameCount - left.gameCount;
    if (gameDifference !== 0) return gameDifference;
  }
  const recencyDifference = right.mostRecentTs - left.mostRecentTs;
  return recencyDifference !== 0 ? recencyDifference : left.opponent.localeCompare(right.opponent);
};
