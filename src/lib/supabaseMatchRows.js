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
  const useSinglePage = Number.isFinite(pageSize) && pageSize > 0;
  const rows = [];
  let from = useSinglePage ? (pageNumber - 1) * pageSize : 0;

  const username = String(filters.username || "").trim();
  const escapedUsername = username.replace(/,/g, "\\,");
  const hasOpponentRatingMin = Number.isFinite(Number(filters.opponentRatingMin));
  const hasOpponentRatingMax = Number.isFinite(Number(filters.opponentRatingMax));
  const opponentRatingMin = Math.floor(Number(filters.opponentRatingMin));
  const opponentRatingMax = Math.floor(Number(filters.opponentRatingMax));
  while (true) {
    const rangeEnd = useSinglePage ? from + pageSize - 1 : from + 999;
    let query = supabase
      .from(tableName)
      .select(MATCH_SELECT_COLUMNS, { count: "exact" })
      .order("start_ts", { ascending: false })
      .order("end_ts", { ascending: false });
    if (username && hasOpponentRatingMin && hasOpponentRatingMax) {
      query = query.or(
        `and(player_1.ilike.${escapedUsername},p2_after_rating.gte.${opponentRatingMin},p2_after_rating.lte.${opponentRatingMax}),and(player_2.ilike.${escapedUsername},p1_after_rating.gte.${opponentRatingMin},p1_after_rating.lte.${opponentRatingMax})`,
      );
    } else if (username) {
      query = query.or(`player_1.ilike.${escapedUsername},player_2.ilike.${escapedUsername}`);
    }
    if (Number.isFinite(Number(filters.startTs))) {
      query = query.gte("start_ts", Math.floor(Number(filters.startTs)));
    }
    if (Number.isFinite(Number(filters.endTs))) {
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
      const total = Number.isFinite(count) ? count : rows.length;
      return { rows, total };
    }
    from += 1000;
  }
};
