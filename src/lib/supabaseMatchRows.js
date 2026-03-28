import { getSupabaseClient } from "./supabaseClient";
import { defaultRatingMax, defaultRatingMin } from "../constants/matches";

const supabaseMatchConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() || "",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "",
  blitzMatchesTable: "blitz_matches",
  bulletMatchesTable: "bullet_matches",
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

const requireSupabaseConfig = () => {
  const { url, anonKey } = supabaseMatchConfig;
  if (!url || !anonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  }
};

export const fetchMatchRowsFromSupabase = async (mode, filters = {}, pageOptions = {}) => {
  requireSupabaseConfig();
  const normalizedMode = String(mode || "").toLowerCase();
  const tableName =
    normalizedMode === "blitz"
      ? supabaseMatchConfig.blitzMatchesTable
      : normalizedMode === "bullet"
        ? supabaseMatchConfig.bulletMatchesTable
        : "";
  if (!tableName) {
    throw new Error(`Unsupported match mode "${mode}"`);
  }

  const supabase = getSupabaseClient();
  const pageSize = Number(pageOptions.pageSize);
  const pageNumber = Math.max(1, Number(pageOptions.page) || 1);
  const useSinglePage = pageSize > 0;
  const rows = [];
  let from = useSinglePage ? (pageNumber - 1) * pageSize : 0;

  const username = String(filters.username || "").trim();
  const escapedUsername = username.replace(/,/g, "\\,");
  const usernamePair = Array.isArray(filters.usernamePair) ? filters.usernamePair : [];
  const pairPlayerA = String(usernamePair[0] || "").trim();
  const pairPlayerB = String(usernamePair[1] || "").trim();
  const escapedPairPlayerA = pairPlayerA.replace(/,/g, "\\,");
  const escapedPairPlayerB = pairPlayerB.replace(/,/g, "\\,");
  const rawRatingMin =
    filters.ratingMin !== undefined && filters.ratingMin !== null
      ? filters.ratingMin
      : filters.opponentRatingMin;
  const rawRatingMax =
    filters.ratingMax !== undefined && filters.ratingMax !== null
      ? filters.ratingMax
      : filters.opponentRatingMax;
  const ratingFilterType = String(filters.ratingFilterType || "both").toLowerCase();
  const ratingMin = Math.floor(Number(rawRatingMin));
  const ratingMax = Math.floor(Number(rawRatingMax));
  const hasRatingMin = Number.isFinite(ratingMin);
  const hasRatingMax = Number.isFinite(ratingMax);
  const isDefaultRatingRange = ratingMin === defaultRatingMin && ratingMax === defaultRatingMax;
  while (true) {
    const rangeEnd = useSinglePage ? from + pageSize - 1 : from + 999;
    let query = supabase
      .from(tableName)
      .select(MATCH_SELECT_COLUMNS, { count: "exact" })
      .order("start_ts", { ascending: false });
    if (username) {
      query = query.or(`player_1.ilike.${escapedUsername},player_2.ilike.${escapedUsername}`);
    }
    if (pairPlayerA && pairPlayerB) {
      query = query.or(
        `and(player_1.ilike.${escapedPairPlayerA},player_2.ilike.${escapedPairPlayerB}),and(player_1.ilike.${escapedPairPlayerB},player_2.ilike.${escapedPairPlayerA})`,
      );
    }

    if (hasRatingMin && hasRatingMax && !isDefaultRatingRange) {
      if (ratingFilterType === "average") {
        query = query.gte("avg_after_rating", ratingMin).lte("avg_after_rating", ratingMax);
      } else {
        query = query
          .gte("p1_after_rating", ratingMin)
          .lte("p1_after_rating", ratingMax)
          .gte("p2_after_rating", ratingMin)
          .lte("p2_after_rating", ratingMax);
      }
    }
    if (
      filters.startTs !== undefined &&
      filters.startTs !== null &&
      Number.isFinite(Number(filters.startTs)) &&
      Number(filters.startTs) !== Number.MIN_SAFE_INTEGER
    ) {
      query = query.gte("start_ts", Math.floor(Number(filters.startTs)));
    }
    if (
      filters.endTs !== undefined &&
      filters.endTs !== null &&
      Number.isFinite(Number(filters.endTs)) &&
      Number(filters.endTs) !== Number.MAX_SAFE_INTEGER
    ) {
      query = query.lte("start_ts", Math.floor(Number(filters.endTs)));
    }
    if (filters.timeControl && String(filters.timeControl).toLowerCase() !== "all") {
      query = query.eq("time_control", String(filters.timeControl));
    }
    query = query.range(from, rangeEnd);

    const { data, error, count } = await query;
    if (error) {
      throw new Error(`Failed loading Supabase table "${tableName}": ${error.message}`);
    }
    const page = data;
    if (!Array.isArray(page)) {
      throw new Error(`Expected Supabase table "${tableName}" to return an array`);
    }

    rows.push(...page);
    if (useSinglePage || page.length < 1000) {
      const total = count ?? rows.length;
      return { rows, total };
    }
    from += 1000;
  }
};
