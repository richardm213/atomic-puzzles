import { getSupabaseClient } from "./supabaseClient";
import { loadSupabaseRows } from "./supabaseRows";
import { cachedRequest } from "../utils/requestCache";
import { normalizeUsername } from "../utils/playerNames";

const PLAYER_RATINGS_TABLE = "player_ratings";
const PLAYER_RATINGS_SELECT_COLUMNS = "username,rating,peak,rd,games,tc,rank";
const playerRatingsCache = new Map();

const fetchUncachedPlayerRatingsRows = async ({ tc, username, limit } = {}) => {
  const supabase = getSupabaseClient();
  const normalizedUsername = normalizeUsername(username);
  let query = supabase
    .from(PLAYER_RATINGS_TABLE)
    .select(PLAYER_RATINGS_SELECT_COLUMNS)
    .order("rank", { ascending: true });
  if (tc) query = query.eq("tc", tc);
  if (normalizedUsername) query = query.eq("username", normalizedUsername);
  if (Number(limit) > 0) {
    query = query.limit(Math.floor(Number(limit)));
  }

  return loadSupabaseRows(PLAYER_RATINGS_TABLE, query);
};

export const fetchPlayerRatingsRows = async (filters = {}) =>
  cachedRequest(playerRatingsCache, ["playerRatings", filters], () =>
    fetchUncachedPlayerRatingsRows(filters),
  );
