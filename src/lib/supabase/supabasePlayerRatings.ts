import { getSupabaseClient } from "./supabaseClient";
import { fetchAllSupabaseRows, loadSupabaseRows } from "./supabaseRows";
import { cachedRequest } from "../../utils/requestCache";
import { normalizeUsername } from "../../utils/playerNames";
import type { PlayerRatingRow } from "../../types/supabase";

export type { PlayerRatingRow } from "../../types/supabase";

export type PlayerRatingFilters = {
  tc?: string;
  username?: string;
  limit?: number;
};

const PLAYER_RATINGS_TABLE = "player_ratings" as const;
const PLAYER_RATINGS_SELECT_COLUMNS = "username,rating,peak,peak_date,rd,games,tc,rank,top20_wins";
const playerRatingsCache = new Map<string, Promise<PlayerRatingRow[]>>();

const fetchUncachedPlayerRatingsRows = async (
  filters: PlayerRatingFilters = {},
): Promise<PlayerRatingRow[]> => {
  const { tc, username, limit } = filters;
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
    return loadSupabaseRows<PlayerRatingRow>(
      PLAYER_RATINGS_TABLE,
      buildQuery().limit(Math.floor(Number(limit))),
    );
  }

  return fetchAllSupabaseRows<PlayerRatingRow>(PLAYER_RATINGS_TABLE, buildQuery);
};

export const fetchPlayerRatingsRows = async (
  filters: PlayerRatingFilters = {},
): Promise<PlayerRatingRow[]> =>
  cachedRequest(playerRatingsCache, ["playerRatings", filters], () =>
    fetchUncachedPlayerRatingsRows(filters),
  );
