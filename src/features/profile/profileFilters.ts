import { defaultRatingMax, defaultRatingMin } from "../../constants/matches";
import type { MatchFilters } from "../../lib/archive/matches";
import {
  buildTimeControlFilter,
  type MatchListFilters,
  parseDateInputBoundary,
} from "../../lib/matches/filters";
import { readStoredSourceFilters } from "../../lib/matches/sourceFilterStorage";

export type ProfileFilters = MatchListFilters & {
  opponentRatingMin: number;
  opponentRatingMax: number;
  opponentFilter: string;
};

export const createDefaultProfileFilters = (): ProfileFilters => ({
  opponentRatingMin: defaultRatingMin,
  opponentRatingMax: defaultRatingMax,
  opponentFilter: "",
  startDateFilter: "",
  endDateFilter: "",
  sourceFilters: readStoredSourceFilters(),
  timeControlInitialFilter: "all",
  timeControlIncrementFilter: "all",
});

export const buildMatchFilters = (username: string, filters: ProfileFilters): MatchFilters => {
  const queryFilters: MatchFilters = { username };
  const timeControl = buildTimeControlFilter(
    filters.timeControlInitialFilter,
    filters.timeControlIncrementFilter,
  );
  if (timeControl) queryFilters.timeControl = timeControl;
  if (
    filters.opponentRatingMin !== defaultRatingMin ||
    filters.opponentRatingMax !== defaultRatingMax
  ) {
    queryFilters.opponentRatingMin = filters.opponentRatingMin;
    queryFilters.opponentRatingMax = filters.opponentRatingMax;
  }
  if (filters.startDateFilter) {
    queryFilters.startTs = parseDateInputBoundary(filters.startDateFilter, "start");
  }
  if (filters.endDateFilter) {
    queryFilters.endTs = parseDateInputBoundary(filters.endDateFilter, "end");
  }
  queryFilters.sourceFilters = filters.sourceFilters;
  return queryFilters;
};

export const isClientSidePagedSearch = (filters: { opponentFilter?: string }): boolean =>
  Boolean(String(filters.opponentFilter || "").trim());
