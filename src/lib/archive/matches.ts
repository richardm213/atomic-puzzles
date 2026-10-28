import { knownSourceKeys, type SourceFilters } from "../../constants/matches";
import type { PaginatedCollection, PaginationOptions } from "../../types/pagination";
import { normalizeUsername } from "../../utils/playerNames";
import { cachedRequest } from "../../utils/requestCache";
import { optionalFiniteNumber } from "../matches/transforms";
import { appendArchiveParam, fetchArchiveJson } from "./client";
import type { ArchiveMode, MatchRow } from "./types";

export type { MatchRow } from "./types";

export type MatchFilters = {
  username?: string;
  usernamePair?: string[];
  matchId?: string;
  ratingFilterType?: "both" | "average" | string;
  ratingMin?: number | string | null;
  ratingMax?: number | string | null;
  opponentRatingMin?: number | string | null;
  opponentRatingMax?: number | string | null;
  startTs?: number | string | null;
  endTs?: number | string | null;
  timeControl?: string;
  timeControlInitial?: string;
  timeControlIncrement?: string;
  sourceFilters?: Partial<SourceFilters>;
};

type MatchPageOptions = PaginationOptions;
type MatchPageResult = PaginatedCollection<"rows", MatchRow>;

const ARCHIVE_MATCH_MODES = new Set<ArchiveMode>([
  "blitz",
  "bullet",
  "hyperbullet",
  "wolfrandom",
  "atomic960",
]);

const matchRowsCache = new Map<string, Promise<MatchPageResult>>();
const MAX_MATCH_PAGE_SIZE = 200;

const buildParams = (
  mode: ArchiveMode | undefined,
  filters: MatchFilters,
  page: number,
  pageSize: number,
  includeTotal: boolean,
): URLSearchParams => {
  const params = new URLSearchParams({
    resource: "matches",
    page: String(page),
    pageSize: String(pageSize),
  });
  appendArchiveParam(params, "mode", mode);
  if (!includeTotal) params.set("includeTotal", "false");
  appendArchiveParam(params, "username", normalizeUsername(filters.username));
  appendArchiveParam(params, "pairA", normalizeUsername(filters.usernamePair?.[0]));
  appendArchiveParam(params, "pairB", normalizeUsername(filters.usernamePair?.[1]));
  appendArchiveParam(params, "matchId", filters.matchId);
  appendArchiveParam(params, "startTs", optionalFiniteNumber(filters.startTs));
  appendArchiveParam(params, "endTs", optionalFiniteNumber(filters.endTs));
  appendArchiveParam(params, "timeControl", filters.timeControl);
  appendArchiveParam(params, "timeControlInitial", filters.timeControlInitial);
  appendArchiveParam(params, "timeControlIncrement", filters.timeControlIncrement);
  const ratingMin = optionalFiniteNumber(filters.ratingMin ?? filters.opponentRatingMin);
  const ratingMax = optionalFiniteNumber(filters.ratingMax ?? filters.opponentRatingMax);
  if (ratingMin !== null && ratingMax !== null) {
    appendArchiveParam(params, "ratingFilterType", filters.ratingFilterType ?? "both");
    appendArchiveParam(params, "ratingMin", ratingMin);
    appendArchiveParam(params, "ratingMax", ratingMax);
  }
  const sourceFilters = filters.sourceFilters ?? {};
  const allSourcesEnabled = knownSourceKeys.every((source) => sourceFilters[source] !== false);
  if (!allSourcesEnabled) {
    params.set(
      "sources",
      knownSourceKeys.filter((source) => sourceFilters[source] !== false).join(","),
    );
  }
  return params;
};

const fetchUncachedMatchRows = async (
  mode: ArchiveMode | undefined,
  filters: MatchFilters,
  options: MatchPageOptions,
): Promise<MatchPageResult> => {
  if (mode !== undefined && !ARCHIVE_MATCH_MODES.has(mode)) {
    throw new Error(`Unsupported match mode "${mode}"`);
  }
  const requestedSize = Math.floor(Number(options.pageSize));
  const singlePage = Number.isFinite(requestedSize) && requestedSize > 0;
  const pageSize = singlePage ? Math.min(MAX_MATCH_PAGE_SIZE, requestedSize) : MAX_MATCH_PAGE_SIZE;
  const includeTotal = options.includeTotal !== false;
  let page = Math.max(1, Math.floor(Number(options.page)) || 1);
  const rows: MatchRow[] = [];
  for (;;) {
    const params = buildParams(mode, filters, page, pageSize, includeTotal);
    let result: MatchPageResult;
    try {
      result = await fetchArchiveJson<MatchPageResult>(params);
    } catch (error) {
      const unsupportedIncludeTotal =
        !includeTotal &&
        error instanceof Error &&
        error.message.includes("Unexpected query parameter: includeTotal");
      if (!unsupportedIncludeTotal) throw error;

      const compatibleParams = new URLSearchParams(params);
      compatibleParams.delete("includeTotal");
      result = await fetchArchiveJson<MatchPageResult>(compatibleParams);
    }
    rows.push(...result.rows);
    if (singlePage || !result.hasNextPage || result.rows.length < pageSize) {
      return { ...result, rows };
    }
    page += 1;
  }
};

export const fetchMatchRowsFromArchive = async (
  mode: ArchiveMode | undefined,
  filters: MatchFilters = {},
  pageOptions: MatchPageOptions = {},
): Promise<MatchPageResult> =>
  cachedRequest(matchRowsCache, ["matches-archive", mode, filters, pageOptions], () =>
    fetchUncachedMatchRows(mode, filters, pageOptions),
  );
