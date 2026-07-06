import { modeOptions } from "../../constants/matches";
import { normalizeUsername } from "../../utils/playerNames";
import { cachedRequest } from "../../utils/requestCache";
import { fetchAliasRows } from "../supabase/supabaseAliases";
import { getSupabaseClient } from "../supabase/supabaseClient";
import { MATCH_TABLE_BY_MODE } from "../supabase/supabaseMatchRows";
import { loadSupabaseRows } from "../supabase/supabaseRows";
import { loadAliasesLookup } from "./aliasesLookup";

type SupabaseClient = ReturnType<typeof getSupabaseClient>;

const LB_TABLE = import.meta.env.VITE_SUPABASE_LB_TABLE?.trim() ?? "lb";
const USERNAME_SUGGESTION_LIMIT = 8;
const usernameResolutionCache = new Map<string, Promise<string>>();
const usernamePresenceCache = new Map<string, Promise<boolean>>();
const usernameSuggestionCache = new Map<string, Promise<UsernameSearchSuggestion[]>>();

export type UsernameSearchSuggestion = {
  username: string;
  matchedName: string;
  matchType: "username" | "alias";
  banned: boolean;
};

type RankedUsernameSearchSuggestion = UsernameSearchSuggestion & {
  rank: number;
};

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

const getSuggestionRank = (
  query: string,
  value: string,
  matchType: UsernameSearchSuggestion["matchType"],
): number | null => {
  if (!value.includes(query)) return null;

  const typeOffset = matchType === "username" ? 0 : 1;
  if (value === query) return typeOffset;
  if (value.startsWith(query)) return 2 + typeOffset;
  return 4 + typeOffset;
};

const addSuggestion = (
  suggestionsByMatchedName: Map<string, RankedUsernameSearchSuggestion>,
  suggestion: RankedUsernameSearchSuggestion,
): void => {
  const existingSuggestion = suggestionsByMatchedName.get(suggestion.matchedName);
  if (!existingSuggestion || suggestion.rank < existingSuggestion.rank) {
    suggestionsByMatchedName.set(suggestion.matchedName, suggestion);
  }
};

const fetchMatchingUsernames = async (query: string): Promise<string[]> => {
  const supabase = getSupabaseClient();
  const matchPattern = `%${query}%`;
  const [playerRatingRows, leaderboardRows, userRows] = await Promise.all([
    loadSupabaseRows<{ username: string | null }>(
      "player_ratings",
      supabase.from("player_ratings").select("username").ilike("username", matchPattern).limit(12),
    ),
    loadSupabaseRows<{ username: string | null }>(
      LB_TABLE,
      supabase.from(LB_TABLE).select("username").ilike("username", matchPattern).limit(24),
    ),
    loadSupabaseRows<{ username: string | null }>(
      "users",
      supabase.from("users").select("username").ilike("username", matchPattern).limit(12),
    ),
  ]);

  return [
    ...new Set(
      [...playerRatingRows, ...leaderboardRows, ...userRows]
        .map((row) => normalizeUsername(row.username))
        .filter(Boolean),
    ),
  ];
};

export const searchUsernameSuggestions = async (
  value: string,
  limit = USERNAME_SUGGESTION_LIMIT,
): Promise<UsernameSearchSuggestion[]> =>
  cachedRequest(usernameSuggestionCache, ["username-suggestions", value, limit], async () => {
    const query = normalizeUsername(value);
    if (query.length < 3) return [];

    const suggestionsByMatchedName = new Map<string, RankedUsernameSearchSuggestion>();
    const [aliasRows, usernames] = await Promise.all([
      fetchAliasRows(),
      fetchMatchingUsernames(query),
    ]);

    aliasRows.forEach((row) => {
      const members = [
        { value: row.username, matchType: "username" as const },
        ...row.aliases.map((alias) => ({ value: alias, matchType: "alias" as const })),
      ];

      members.forEach((member) => {
        const matchedName = normalizeUsername(member.value);
        const rank = getSuggestionRank(query, matchedName, member.matchType);
        if (rank === null) return;

        addSuggestion(suggestionsByMatchedName, {
          username: row.username,
          matchedName,
          matchType: member.matchType,
          banned: Boolean(row.banned),
          rank,
        });
      });
    });

    usernames.forEach((username) => {
      const rank = getSuggestionRank(query, username, "username");
      if (rank === null) return;

      addSuggestion(suggestionsByMatchedName, {
        username,
        matchedName: username,
        matchType: "username",
        banned: false,
        rank,
      });
    });

    return [...suggestionsByMatchedName.values()]
      .sort((first, second) => {
        if (first.rank !== second.rank) return first.rank - second.rank;
        if (first.matchedName.length !== second.matchedName.length) {
          return first.matchedName.length - second.matchedName.length;
        }
        return first.matchedName.localeCompare(second.matchedName);
      })
      .slice(0, limit)
      .map(({ rank: _rank, ...suggestion }) => suggestion);
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
