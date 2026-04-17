import { loadAliasesLookup } from "./aliasesLookup";
import { getSupabaseClient } from "./supabaseClient";
import { loadSupabaseRows } from "./supabaseRows";
import { cachedRequest } from "../utils/requestCache";
import { normalizeUsername } from "../utils/playerNames";

const LB_TABLE = import.meta.env.VITE_SUPABASE_LB_TABLE?.trim() || "lb";
const usernameResolutionCache = new Map();
const usernamePresenceCache = new Map();

const escapeFilterValue = (value) => String(value || "").trim().replace(/,/g, "\\,");

const usernameExistsInProfileTables = async (supabase, username) => {
  const [playerRatingsRows, leaderboardRows] = await Promise.all([
    loadSupabaseRows(
      "player_ratings",
      supabase.from("player_ratings").select("username").eq("username", username).limit(1),
    ),
    loadSupabaseRows(
      LB_TABLE,
      supabase.from(LB_TABLE).select("username").eq("username", username).limit(1),
    ),
  ]);

  return playerRatingsRows.length > 0 || leaderboardRows.length > 0;
};

const usernameExistsInMatchTables = async (supabase, username) => {
  const escapedUsername = escapeFilterValue(username);
  const [blitzRows, bulletRows] = await Promise.all([
    loadSupabaseRows(
      "blitz_matches",
      supabase
        .from("blitz_matches")
        .select("match_id")
        .or(`player_1.eq.${escapedUsername},player_2.eq.${escapedUsername}`)
        .limit(1),
    ),
    loadSupabaseRows(
      "bullet_matches",
      supabase
        .from("bullet_matches")
        .select("match_id")
        .or(`player_1.eq.${escapedUsername},player_2.eq.${escapedUsername}`)
        .limit(1),
    ),
  ]);

  return blitzRows.length > 0 || bulletRows.length > 0;
};

export const hasSupabaseUsernameMatch = async (value) =>
  cachedRequest(usernamePresenceCache, ["username-presence", value], async () => {
    const username = normalizeUsername(value);
    if (!username) return false;

    const supabase = getSupabaseClient();
    if (await usernameExistsInProfileTables(supabase, username)) return true;
    return usernameExistsInMatchTables(supabase, username);
  });

export const resolveUsernameInput = async (value) =>
  cachedRequest(usernameResolutionCache, ["resolved-username", value], async () => {
    const username = normalizeUsername(value);
    if (!username) return "";
    if (await hasSupabaseUsernameMatch(username)) return username;

    const aliasesLookup = await loadAliasesLookup();
    return aliasesLookup.get(username)?.primary ?? username;
  });

export const resolveUsernameInputs = async (values = []) =>
  Promise.all(values.map((value) => resolveUsernameInput(value)));
