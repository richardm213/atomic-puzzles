import { modeOptions } from "../../constants/matches";
import { loadAliasesLookup } from "./aliasesLookup";
import { getSupabaseClient } from "../supabase/supabaseClient";
import { MATCH_TABLE_BY_MODE } from "../supabase/supabaseMatchRows";
import { loadSupabaseRows } from "../supabase/supabaseRows";
import { cachedRequest } from "../../utils/requestCache";
import { normalizeUsername } from "../../utils/playerNames";

type SupabaseClient = ReturnType<typeof getSupabaseClient>;

const LB_TABLE = import.meta.env.VITE_SUPABASE_LB_TABLE?.trim() ?? "lb";
const usernameResolutionCache = new Map<string, Promise<string>>();
const usernamePresenceCache = new Map<string, Promise<boolean>>();

const escapeFilterValue = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/,/g, "\\,");

const usernameExistsInProfileTables = async (
  supabase: SupabaseClient,
  username: string,
): Promise<boolean> => {
  const [playerRatingsRows, leaderboardRows] = await Promise.all([
    loadSupabaseRows<{ username: string }>(
      "player_ratings",
      supabase.from("player_ratings").select("username").eq("username", username).limit(1),
    ),
    loadSupabaseRows<{ username: string }>(
      LB_TABLE,
      supabase.from(LB_TABLE).select("username").eq("username", username).limit(1),
    ),
  ]);

  return playerRatingsRows.length > 0 || leaderboardRows.length > 0;
};

const usernameExistsInMatchTables = async (
  supabase: SupabaseClient,
  username: string,
): Promise<boolean> => {
  const escapedUsername = escapeFilterValue(username);
  const matchRowsByMode = await Promise.all(
    modeOptions.map((mode) => {
      const tableName = MATCH_TABLE_BY_MODE[mode];
      return loadSupabaseRows<{ match_id: string }>(
        tableName,
        supabase
          .from(tableName)
          .select("match_id")
          .or(`player_1.eq.${escapedUsername},player_2.eq.${escapedUsername}`)
          .limit(1),
      );
    }),
  );

  return matchRowsByMode.some((rows) => rows.length > 0);
};

const hasSupabaseUsernameMatch = async (value: string): Promise<boolean> =>
  cachedRequest(usernamePresenceCache, ["username-presence", value], async () => {
    const username = normalizeUsername(value);
    if (!username) return false;

    const supabase = getSupabaseClient();
    if (await usernameExistsInProfileTables(supabase, username)) return true;
    return usernameExistsInMatchTables(supabase, username);
  });

export const resolveUsernameInput = async (value: string): Promise<string> =>
  cachedRequest(usernameResolutionCache, ["resolved-username", value], async () => {
    const username = normalizeUsername(value);
    if (!username) return "";
    if (await hasSupabaseUsernameMatch(username)) return username;

    const aliasesLookup = await loadAliasesLookup();
    return aliasesLookup.get(username)?.primary ?? username;
  });

export const resolveUsernameInputs = async (values: string[] = []): Promise<string[]> =>
  Promise.all(values.map((value) => resolveUsernameInput(value)));
