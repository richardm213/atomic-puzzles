import { knownSourceKeys, type SourceFilters } from "../../constants/matches";
import { normalizeUsername } from "../../utils/playerNames";
import { cachedRequest } from "../../utils/requestCache";
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
  sourceFilters?: Partial<SourceFilters>;
};

type MatchPageOptions = { page?: number; pageSize?: number };

const ARCHIVE_MATCH_MODES = new Set<ArchiveMode>([
  "blitz",
  "bullet",
  "hyperbullet",
  "wolfrandom",
  "atomic960",
]);

const matchRowsCache = new Map<string, Promise<{ rows: MatchRow[]; total: number }>>();
const MAX_MATCH_PAGE_SIZE = 200;

const finiteNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const buildParams = (
  mode: ArchiveMode,
  filters: MatchFilters,
  page: number,
  pageSize: number,
): URLSearchParams => {
  const params = new URLSearchParams({
    resource: "matches",
    mode,
    page: String(page),
    pageSize: String(pageSize),
  });
  appendArchiveParam(params, "username", normalizeUsername(filters.username));
  appendArchiveParam(params, "pairA", normalizeUsername(filters.usernamePair?.[0]));
  appendArchiveParam(params, "pairB", normalizeUsername(filters.usernamePair?.[1]));
  appendArchiveParam(params, "matchId", filters.matchId);
  appendArchiveParam(params, "startTs", finiteNumber(filters.startTs));
  appendArchiveParam(params, "endTs", finiteNumber(filters.endTs));
  appendArchiveParam(params, "timeControl", filters.timeControl);
  appendArchiveParam(params, "ratingFilterType", filters.ratingFilterType ?? "both");
  appendArchiveParam(
    params,
    "ratingMin",
    finiteNumber(filters.ratingMin ?? filters.opponentRatingMin),
  );
  appendArchiveParam(
    params,
    "ratingMax",
    finiteNumber(filters.ratingMax ?? filters.opponentRatingMax),
  );
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
  mode: ArchiveMode,
  filters: MatchFilters,
  options: MatchPageOptions,
): Promise<{ rows: MatchRow[]; total: number }> => {
  if (!ARCHIVE_MATCH_MODES.has(mode)) throw new Error(`Unsupported match mode "${mode}"`);
  const requestedSize = Math.floor(Number(options.pageSize));
  const singlePage = Number.isFinite(requestedSize) && requestedSize > 0;
  const pageSize = singlePage ? Math.min(MAX_MATCH_PAGE_SIZE, requestedSize) : MAX_MATCH_PAGE_SIZE;
  let page = Math.max(1, Math.floor(Number(options.page)) || 1);
  const rows: MatchRow[] = [];
  for (;;) {
    const result = await fetchArchiveJson<{ rows: MatchRow[]; total: number }>(
      buildParams(mode, filters, page, pageSize),
    );
    rows.push(...result.rows);
    if (singlePage || rows.length >= result.total || result.rows.length < pageSize) {
      return { rows, total: result.total };
    }
    page += 1;
  }
};

export const fetchMatchRowsFromArchive = async (
  mode: ArchiveMode,
  filters: MatchFilters = {},
  pageOptions: MatchPageOptions = {},
): Promise<{ rows: MatchRow[]; total: number }> =>
  cachedRequest(matchRowsCache, ["matches-archive", mode, filters, pageOptions], () =>
    fetchUncachedMatchRows(mode, filters, pageOptions),
  );
