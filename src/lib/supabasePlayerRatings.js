import { getSupabaseClient } from "./supabaseClient";
import { cachedRequest } from "../utils/requestCache";

const supabasePlayerRatingsConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() || "",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "",
  table: "player_ratings",
};

const PLAYER_RATINGS_SELECT_COLUMNS = "username,rating,peak,rd,games,tc,rank";
const playerRatingsCache = new Map();

const requireSupabaseConfig = () => {
  const { url, anonKey } = supabasePlayerRatingsConfig;
  if (!url || !anonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  }
};

const fetchUncachedPlayerRatingsRows = async ({ tc, username, limit } = {}) => {
  requireSupabaseConfig();
  const { table } = supabasePlayerRatingsConfig;
  const supabase = getSupabaseClient();
  let query = supabase
    .from(table)
    .select(PLAYER_RATINGS_SELECT_COLUMNS)
    .order("rank", { ascending: true });
  if (tc) query = query.eq("tc", tc);
  if (username) query = query.eq("username", username);
  if (Number(limit) > 0) {
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

export const fetchPlayerRatingsRows = async (filters = {}) =>
  cachedRequest(playerRatingsCache, ["playerRatings", filters], () =>
    fetchUncachedPlayerRatingsRows(filters),
  );
