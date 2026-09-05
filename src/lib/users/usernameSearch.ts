import { normalizeUsername } from "../../utils/playerNames";
import { cachedRequest } from "../../utils/requestCache";
import { fetchAliasRows } from "../archive/aliases";
import { appendArchiveParam, fetchArchiveJson } from "../archive/client";
import { getSupabaseClient } from "../supabase/client";
import { loadSupabaseRows } from "../supabase/rows";
import { loadAliasesLookup } from "./aliasesLookup";

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

const hasArchiveUsernameMatch = async (value: string): Promise<boolean> =>
  cachedRequest(usernamePresenceCache, ["username-presence", value], async () => {
    const username = normalizeUsername(value);
    if (!username) return false;

    const params = new URLSearchParams({ resource: "usernames" });
    appendArchiveParam(params, "exact", username);
    const rows = await fetchArchiveJson<Array<{ username?: string | null }>>(params);
    return rows.length > 0;
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
  const params = new URLSearchParams({ resource: "usernames" });
  appendArchiveParam(params, "query", query);
  const [archiveRows, userRows] = await Promise.all([
    fetchArchiveJson<Array<{ username?: string | null }>>(params),
    loadSupabaseRows<{ username: string | null }>(
      "users",
      supabase.from("users").select("username").ilike("username", `%${query}%`).limit(12),
    ).catch(() => []),
  ]);

  return [
    ...new Set(
      [...archiveRows, ...userRows].map((row) => normalizeUsername(row.username)).filter(Boolean),
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
    if (await hasArchiveUsernameMatch(username)) return username;

    const aliasesLookup = await loadAliasesLookup();
    return aliasesLookup.get(username)?.primary ?? username;
  });

export const resolveUsernameInputs = async (values: string[] = []): Promise<string[]> =>
  Promise.all(values.map((value) => resolveUsernameInput(value)));
