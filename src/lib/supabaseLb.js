import { getSupabaseClient } from "./supabaseClient";

const supabaseLbConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() || "",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "",
  table: import.meta.env.VITE_SUPABASE_LB_TABLE?.trim() || "lb",
  playerRatingsTable:
    import.meta.env.VITE_SUPABASE_PLAYER_RATINGS_TABLE?.trim() || "player_ratings",
  blitzMatchesTable:
    import.meta.env.VITE_SUPABASE_BLITZ_MATCHES_TABLE?.trim() || "blitz_matches",
  bulletMatchesTable:
    import.meta.env.VITE_SUPABASE_BULLET_MATCHES_TABLE?.trim() || "bullet_matches",
};

const LB_SELECT_COLUMNS = "username,month,rank,rating,rd,games,tc";
const PLAYER_RATINGS_SELECT_COLUMNS = "username,rating,peak,rd,games,tc,rank";

const requireSupabaseConfig = () => {
  const { url, anonKey } = supabaseLbConfig;
  if (!url || !anonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  }
};

export const monthKeyFromMonthValue = (monthValue) => {
  if (!monthValue) return "";
  const monthDate = new Date(`${String(monthValue).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(monthDate.getTime())) return "";
  return monthDate.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

export const isoMonthStartFromMonthKey = (monthKey) => {
  const monthDate = new Date(`${monthKey} 01 UTC`);
  if (Number.isNaN(monthDate.getTime())) return "";
  return monthDate.toISOString().slice(0, 10);
};

export const fetchLbRows = async ({ month, username, limit } = {}) => {
  requireSupabaseConfig();
  const { table } = supabaseLbConfig;
  const supabase = getSupabaseClient();
  let query = supabase.from(table).select(LB_SELECT_COLUMNS);
  if (month) query = query.eq("month", month);
  if (username) query = query.eq("username", username);
  if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
    query = query.limit(Math.floor(Number(limit)));
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed loading Supabase table "${table}": ${error.message}`);
  }
  const rows = data;
  if (!Array.isArray(rows)) {
    throw new Error(`Expected Supabase table "${table}" to return an array`);
  }

  return rows;
};

export const fetchPlayerRatingsRows = async ({ tc, username, limit } = {}) => {
  requireSupabaseConfig();
  const { playerRatingsTable } = supabaseLbConfig;
  const supabase = getSupabaseClient();
  let query = supabase
    .from(playerRatingsTable)
    .select(PLAYER_RATINGS_SELECT_COLUMNS)
    .order("rank", { ascending: true });
  if (tc) query = query.eq("tc", tc);
  if (username) query = query.eq("username", username);
  if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
    query = query.limit(Math.floor(Number(limit)));
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed loading Supabase table "${playerRatingsTable}": ${error.message}`);
  }
  const rows = data;
  if (!Array.isArray(rows)) {
    throw new Error(`Expected Supabase table "${playerRatingsTable}" to return an array`);
  }

  return rows;
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

export const fetchMatchRowsFromSupabase = async (mode, filters = {}, pageOptions = {}) => {
  requireSupabaseConfig();
  const normalizedMode = String(mode || "").toLowerCase();
  const tableName =
    normalizedMode === "blitz"
      ? supabaseLbConfig.blitzMatchesTable
      : normalizedMode === "bullet"
        ? supabaseLbConfig.bulletMatchesTable
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
  while (true) {
    const rangeEnd = useSinglePage ? from + pageSize - 1 : from + 999;
    let query = supabase
      .from(tableName)
      .select(MATCH_SELECT_COLUMNS, { count: "exact" })
      .order("start_ts", { ascending: false })
      .order("end_ts", { ascending: false });
    if (username) {
      const escaped = username.replace(/,/g, "\\,");
      query = query.or(`player_1.ilike.${escaped},player_2.ilike.${escaped}`);
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

export const hasSupabaseLbConfig = () => Boolean(supabaseLbConfig.url && supabaseLbConfig.anonKey);
