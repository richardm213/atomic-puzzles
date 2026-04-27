import { getSupabaseClient } from "./supabaseClient";
import { loadSupabasePage } from "./supabaseRows";
import { defaultRatingMax, defaultRatingMin, type Mode } from "../../constants/matches";
import { cachedRequest } from "../../utils/requestCache";
import { normalizeUsername } from "../../utils/playerNames";

export type MatchRow = {
  match_id: string;
  player_1: string;
  player_2: string;
  start_ts: number;
  time_control: string | null;
  source: string | null;
  tournament_id: string | null;
  games: unknown;
  p1_before_rating: number | null;
  p1_after_rating: number | null;
  p1_before_rd: number | null;
  p1_after_rd: number | null;
  p2_before_rating: number | null;
  p2_after_rating: number | null;
  p2_before_rd: number | null;
  p2_after_rd: number | null;
};

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
};

export type MatchPageOptions = {
  page?: number;
  pageSize?: number;
};

export const MATCH_TABLE_BY_MODE: Record<Mode, string> = {
  blitz: "blitz_matches",
  bullet: "bullet_matches",
  hyperbullet: "hyper_matches",
};

const MATCH_SELECT_COLUMNS = [
  "match_id",
  "player_1",
  "player_2",
  "start_ts",
  "time_control",
  "source",
  "tournament_id",
  "games",
  "p1_before_rating",
  "p1_after_rating",
  "p1_before_rd",
  "p1_after_rd",
  "p2_before_rating",
  "p2_after_rating",
  "p2_before_rd",
  "p2_after_rd",
].join(",");

const matchRowsCache = new Map<string, Promise<{ rows: MatchRow[]; total: number }>>();
const MAX_MATCH_PAGE_SIZE = 200;

const escapeOrValue = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/,/g, "\\,");

const numericBoundary = (value: unknown, fallback: number): number => {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
};

const numericBoundaryOrNull = (value: unknown): number | null => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : null;
};

type NormalizedFilters = {
  username: string;
  pairPlayerA: string;
  pairPlayerB: string;
  matchId: string;
  ratingFilterType: string;
  ratingMin: number | null;
  ratingMax: number | null;
  startTs: number;
  endTs: number;
  timeControl: string;
};

const getMatchTableName = (mode: string): string => {
  const normalizedMode = String(mode ?? "").toLowerCase() as Mode;
  const tableName = MATCH_TABLE_BY_MODE[normalizedMode];
  if (!tableName) throw new Error(`Unsupported match mode "${mode}"`);
  return tableName;
};

const normalizeMatchFilters = (filters: MatchFilters = {}): NormalizedFilters => {
  const usernamePair = Array.isArray(filters.usernamePair) ? filters.usernamePair : [];
  const rawRatingMin = filters.ratingMin ?? filters.opponentRatingMin;
  const rawRatingMax = filters.ratingMax ?? filters.opponentRatingMax;
  const ratingMin = numericBoundaryOrNull(rawRatingMin);
  const ratingMax = numericBoundaryOrNull(rawRatingMax);

  return {
    username: escapeOrValue(normalizeUsername(filters.username)),
    pairPlayerA: escapeOrValue(normalizeUsername(usernamePair[0])),
    pairPlayerB: escapeOrValue(normalizeUsername(usernamePair[1])),
    matchId: escapeOrValue(filters.matchId),
    ratingFilterType: String(filters.ratingFilterType ?? "both").toLowerCase(),
    ratingMin,
    ratingMax,
    startTs: numericBoundary(filters.startTs, Number.MIN_SAFE_INTEGER),
    endTs: numericBoundary(filters.endTs, Number.MAX_SAFE_INTEGER),
    timeControl: String(filters.timeControl ?? "").trim(),
  };
};

// PostgrestFilterBuilder generics get too deep when chained, so the helper
// boundaries use `any`. Filters in / rows out are still strongly typed.
type ChainedQuery = any;

const applyPlayerFilters = (
  query: ChainedQuery,
  { username, pairPlayerA, pairPlayerB, matchId }: NormalizedFilters,
): ChainedQuery => {
  let next = query;
  if (matchId) {
    next = next.eq("match_id", matchId);
  }
  if (username) {
    next = next.or(`player_1.eq.${username},player_2.eq.${username}`);
  }
  if (pairPlayerA && pairPlayerB) {
    next = next.or(
      `and(player_1.eq.${pairPlayerA},player_2.eq.${pairPlayerB}),and(player_1.eq.${pairPlayerB},player_2.eq.${pairPlayerA})`,
    );
  }
  return next;
};

const applyRatingFilter = (
  query: ChainedQuery,
  { ratingFilterType, ratingMin, ratingMax }: NormalizedFilters,
): ChainedQuery => {
  const hasRatingRange = Number.isFinite(ratingMin) && Number.isFinite(ratingMax);
  if (
    !hasRatingRange ||
    ratingMin === null ||
    ratingMax === null ||
    (ratingMin === defaultRatingMin && ratingMax === defaultRatingMax)
  ) {
    return query;
  }

  if (ratingFilterType === "average") {
    return query.gte("avg_after_rating", ratingMin).lte("avg_after_rating", ratingMax);
  }

  return query
    .gte("p1_after_rating", ratingMin)
    .lte("p1_after_rating", ratingMax)
    .gte("p2_after_rating", ratingMin)
    .lte("p2_after_rating", ratingMax);
};

const applyDateAndTimeFilters = (
  query: ChainedQuery,
  { startTs, endTs, timeControl }: NormalizedFilters,
): ChainedQuery => {
  let next = query;
  if (startTs !== Number.MIN_SAFE_INTEGER) next = next.gte("start_ts", startTs);
  if (endTs !== Number.MAX_SAFE_INTEGER) next = next.lte("start_ts", endTs);
  if (timeControl && timeControl.toLowerCase() !== "all") {
    next = next.eq("time_control", timeControl);
  }
  return next;
};

const buildMatchQuery = (
  supabase: ReturnType<typeof getSupabaseClient>,
  tableName: string,
  filters: NormalizedFilters,
): ChainedQuery => {
  const baseQuery = supabase
    .from(tableName)
    .select(MATCH_SELECT_COLUMNS, { count: "exact" })
    .order("start_ts", { ascending: false });

  return applyDateAndTimeFilters(
    applyRatingFilter(applyPlayerFilters(baseQuery, filters), filters),
    filters,
  );
};

const normalizePageOptions = (
  options: MatchPageOptions = {},
): { pageSize: number; from: number; useSinglePage: boolean } => {
  const { page, pageSize } = options;
  const size = Math.min(MAX_MATCH_PAGE_SIZE, Math.floor(Number(pageSize)));
  if (!Number.isFinite(size) || size <= 0) {
    return { pageSize: 1000, from: 0, useSinglePage: false };
  }

  const pageNumber = Math.max(1, Math.floor(Number(page)) || 1);
  return {
    pageSize: size,
    from: (pageNumber - 1) * size,
    useSinglePage: true,
  };
};

const fetchUncachedMatchRowsFromSupabase = async (
  mode: string,
  filters: MatchFilters = {},
  pageOptions: MatchPageOptions = {},
): Promise<{ rows: MatchRow[]; total: number }> => {
  const tableName = getMatchTableName(mode);
  const supabase = getSupabaseClient();
  const normalizedFilters = normalizeMatchFilters(filters);
  const { pageSize, useSinglePage, from: firstRow } = normalizePageOptions(pageOptions);
  const rows: MatchRow[] = [];
  let from = firstRow;

  for (;;) {
    const { rows: page, count } = await loadSupabasePage<MatchRow>(
      tableName,
      buildMatchQuery(supabase, tableName, normalizedFilters).range(from, from + pageSize - 1),
    );

    rows.push(...page);
    if (useSinglePage || page.length < pageSize) return { rows, total: count ?? rows.length };
    from += pageSize;
  }
};

export const fetchMatchRowsFromSupabase = async (
  mode: string,
  filters: MatchFilters = {},
  pageOptions: MatchPageOptions = {},
): Promise<{ rows: MatchRow[]; total: number }> =>
  cachedRequest(matchRowsCache, ["matches", mode, filters, pageOptions], () =>
    fetchUncachedMatchRowsFromSupabase(mode, filters, pageOptions),
  );
