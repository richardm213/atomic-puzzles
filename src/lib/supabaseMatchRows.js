import { getSupabaseClient } from "./supabaseClient";

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
  const hasRatingMin = filters.ratingMin !== undefined && filters.ratingMin !== null;
  const hasRatingMax = filters.ratingMax !== undefined && filters.ratingMax !== null;
  const ratingFilterType = String(filters.ratingFilterType || "both").toLowerCase();
  const ratingMin = Math.floor(Number(filters.ratingMin));
  const ratingMax = Math.floor(Number(filters.ratingMax));
  while (true) {
    const rangeEnd = useSinglePage ? from + pageSize - 1 : from + 999;
    let query = supabase
      .from(tableName)
      .select(MATCH_SELECT_COLUMNS, { count: "exact" })
      .order("start_ts", { ascending: false })
      .order("end_ts", { ascending: false });
    if (username) {
      query = query.or(`player_1.ilike.${escapedUsername},player_2.ilike.${escapedUsername}`);
    }

    if (hasRatingMin && hasRatingMax) {
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
    if (filters.startTs !== undefined && filters.startTs !== null) {
      query = query.gte("start_ts", Math.floor(Number(filters.startTs)));
    }
    if (filters.endTs !== undefined && filters.endTs !== null) {
      query = query.lte("start_ts", Math.floor(Number(filters.endTs)));
    }
    if (filters.timeControl) {
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
