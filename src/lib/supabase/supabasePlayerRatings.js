import { getSupabaseClient } from "./supabaseClient";
import { fetchAllSupabaseRows, loadSupabaseRows } from "./supabaseRows";
import { cachedRequest } from "../../utils/requestCache";
import { normalizeUsername } from "../../utils/playerNames";

const PLAYER_RATINGS_TABLE = "player_ratings";
const PLAYER_RATINGS_SELECT_COLUMNS = "username,rating,peak,peak_date,rd,games,tc,rank,top20_wins";
const playerRatingsCache = new Map();

const fetchUncachedPlayerRatingsRows = async ({ tc, username, limit } = {}) => {
  const supabase = getSupabaseClient();
  const normalizedUsername = normalizeUsername(username);
  const buildQuery = () => {
    let query = supabase
      .from(PLAYER_RATINGS_TABLE)
      .select(PLAYER_RATINGS_SELECT_COLUMNS)
      .order("rank", { ascending: true });
    if (tc) query = query.eq("tc", tc);
    if (normalizedUsername) query = query.eq("username", normalizedUsername);
    return query;
  };

  if (Number(limit) > 0) {
    return loadSupabaseRows(PLAYER_RATINGS_TABLE, buildQuery().limit(Math.floor(Number(limit))));
  }

  return fetchAllSupabaseRows(PLAYER_RATINGS_TABLE, buildQuery);
};

export const fetchPlayerRatingsRows = async (filters = {}) =>
  cachedRequest(playerRatingsCache, ["playerRatings", filters], () =>
    fetchUncachedPlayerRatingsRows(filters),
  );
