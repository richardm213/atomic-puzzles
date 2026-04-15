import { getSupabaseClient } from "./supabaseClient";
import { loadSupabasePage } from "./supabaseRows";
import { defaultRatingMax, defaultRatingMin } from "../constants/matches";
import { cachedRequest } from "../utils/requestCache";

const MATCH_TABLE_BY_MODE = {
  blitz: "blitz_matches",
  bullet: "bullet_matches",
};

const MATCH_SELECT_COLUMNS = [
  "match_id",
  "player_1",
  "player_2",
  "start_ts",
  "end_ts",
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

const matchRowsCache = new Map();

const escapeOrValue = (value) => String(value || "").trim().replace(/,/g, "\\,");

const numericBoundary = (value, fallback) => {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
};

const getMatchTableName = (mode) => {
  const normalizedMode = String(mode || "").toLowerCase();
  const tableName = MATCH_TABLE_BY_MODE[normalizedMode];
  if (!tableName) throw new Error(`Unsupported match mode "${mode}"`);
  return tableName;
};

const normalizeMatchFilters = (filters = {}) => {
  const usernamePair = Array.isArray(filters.usernamePair) ? filters.usernamePair : [];
  const rawRatingMin = filters.ratingMin ?? filters.opponentRatingMin;
  const rawRatingMax = filters.ratingMax ?? filters.opponentRatingMax;
  const ratingMin = numericBoundary(rawRatingMin, null);
  const ratingMax = numericBoundary(rawRatingMax, null);

  return {
    username: escapeOrValue(filters.username),
    pairPlayerA: escapeOrValue(usernamePair[0]),
    pairPlayerB: escapeOrValue(usernamePair[1]),
    ratingFilterType: String(filters.ratingFilterType || "both").toLowerCase(),
    ratingMin,
    ratingMax,
    startTs: numericBoundary(filters.startTs, Number.MIN_SAFE_INTEGER),
    endTs: numericBoundary(filters.endTs, Number.MAX_SAFE_INTEGER),
    timeControl: String(filters.timeControl || "").trim(),
  };
};

const applyPlayerFilters = (query, { username, pairPlayerA, pairPlayerB }) => {
  if (username) {
    query = query.or(`player_1.eq.${username},player_2.eq.${username}`);
  }
  if (pairPlayerA && pairPlayerB) {
    query = query.or(
      `and(player_1.eq.${pairPlayerA},player_2.eq.${pairPlayerB}),and(player_1.eq.${pairPlayerB},player_2.eq.${pairPlayerA})`,
    );
  }
  return query;
};

const applyRatingFilter = (query, { ratingFilterType, ratingMin, ratingMax }) => {
  const hasRatingRange = Number.isFinite(ratingMin) && Number.isFinite(ratingMax);
  if (!hasRatingRange || (ratingMin === defaultRatingMin && ratingMax === defaultRatingMax)) {
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

const applyDateAndTimeFilters = (query, { startTs, endTs, timeControl }) => {
  if (startTs !== Number.MIN_SAFE_INTEGER) query = query.gte("start_ts", startTs);
  if (endTs !== Number.MAX_SAFE_INTEGER) query = query.lte("start_ts", endTs);
  if (timeControl && timeControl.toLowerCase() !== "all") {
    query = query.eq("time_control", timeControl);
  }
  return query;
};

const buildMatchQuery = (supabase, tableName, filters) => {
  const baseQuery = supabase
    .from(tableName)
    .select(MATCH_SELECT_COLUMNS, { count: "exact" })
    .order("start_ts", { ascending: false });

  return applyDateAndTimeFilters(
    applyRatingFilter(applyPlayerFilters(baseQuery, filters), filters),
    filters,
  );
};

const normalizePageOptions = ({ page, pageSize } = {}) => {
  const size = Math.floor(Number(pageSize));
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

const fetchUncachedMatchRowsFromSupabase = async (mode, filters = {}, pageOptions = {}) => {
  const tableName = getMatchTableName(mode);
  const supabase = getSupabaseClient();
  const normalizedFilters = normalizeMatchFilters(filters);
  const { pageSize, useSinglePage, from: firstRow } = normalizePageOptions(pageOptions);
  const rows = [];
  let from = firstRow;

  while (true) {
    const { rows: page, count } = await loadSupabasePage(
      tableName,
      buildMatchQuery(supabase, tableName, normalizedFilters).range(from, from + pageSize - 1),
    );

    rows.push(...page);
    if (useSinglePage || page.length < pageSize) return { rows, total: count ?? rows.length };
    from += pageSize;
  }
};

export const fetchMatchRowsFromSupabase = async (mode, filters = {}, pageOptions = {}) =>
  cachedRequest(matchRowsCache, ["matches", mode, filters, pageOptions], () =>
    fetchUncachedMatchRowsFromSupabase(mode, filters, pageOptions),
  );
