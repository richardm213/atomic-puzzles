import type { UsernameRecord } from "../../../shared/domain/users";
import { normalizeUsername } from "../../utils/playerNames";
import { cachedRequest } from "../../utils/requestCache";
import { fetchAliasRows, fetchProfileAliasRow } from "../archive/aliases";
import { appendArchiveParam, fetchArchiveJson } from "../archive/client";
import { getSupabaseClient } from "../supabase/client";
import { loadSupabaseRows } from "../supabase/rows";

const USERNAME_SUGGESTION_LIMIT = 8;
const usernameResolutionCache = new Map<string, Promise<string>>();
const usernameSuggestionCache = new Map<string, Promise<UsernameSearchSuggestion[]>>();

export type UsernameSearchSuggestion = {
  username: string;
  matchedName: string;
  matchType: "username" | "alias";
  banned: boolean;
  accountUsername: string | null;
};

type RankedUsernameSearchSuggestion = UsernameSearchSuggestion & {
  rank: number;
};

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
    fetchArchiveJson<UsernameRecord[]>(params),
    loadSupabaseRows<UsernameRecord>(
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
    if (query.length < 3 || !/^[a-z0-9_-]+$/.test(query)) return [];

    const suggestionsByMatchedName = new Map<string, RankedUsernameSearchSuggestion>();
    const [aliasRows, usernames] = await Promise.all([
      fetchAliasRows(query),
      fetchMatchingUsernames(query),
    ]);

    aliasRows.forEach((row) => {
      const members = [
        { value: row.username, matchType: "username" as const },
        ...row.aliases.map((alias) => ({ value: alias, matchType: "alias" as const })),
      ];

      members.forEach((member) => {
        const normalizedMatchedName = normalizeUsername(member.value);
        const pyChessAccount = row.accounts.find(
          (account) =>
            account.source === "pychess" &&
            (account.alias === member.value || account.displayAlias === member.value),
        );
        const matchedName = pyChessAccount
          ? String(pyChessAccount.displayAlias || pyChessAccount.alias).trim()
          : normalizedMatchedName;
        const rank = getSuggestionRank(query, normalizedMatchedName, member.matchType);
        if (rank === null) return;

        addSuggestion(suggestionsByMatchedName, {
          username: row.username,
          matchedName,
          matchType: member.matchType,
          banned: Boolean(row.banned),
          accountUsername: null,
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
        accountUsername: null,
        rank,
      });
    });

    const suggestions = [...suggestionsByMatchedName.values()]
      .sort((first, second) => {
        if (first.rank !== second.rank) return first.rank - second.rank;
        if (first.matchedName.length !== second.matchedName.length) {
          return first.matchedName.length - second.matchedName.length;
        }
        return first.matchedName.localeCompare(second.matchedName);
      })
      .slice(0, limit);

    const aliasRowsByUsername = new Map(aliasRows.map((row) => [row.username, row]));
    const accountCandidatesBySuggestion = suggestions.map((suggestion) => {
      const identity = aliasRowsByUsername.get(suggestion.username);
      if (identity?.banned || identity?.bot) return [];

      return [
        suggestion.matchedName,
        suggestion.username,
        ...(identity?.accounts ?? [])
          .filter((account) => account.source === "lichess" && !account.banned && !account.bot)
          .map((account) => account.alias),
      ]
        .map(normalizeUsername)
        .filter(Boolean);
    });
    const accountCandidates = [...new Set(accountCandidatesBySuggestion.flat())];
    const registeredRows = accountCandidates.length
      ? await loadSupabaseRows<UsernameRecord>(
          "users",
          getSupabaseClient().from("users").select("username").in("username", accountCandidates),
        ).catch(() => [])
      : [];
    const registeredUsernames = new Set(
      registeredRows.map((row) => normalizeUsername(row.username)).filter(Boolean),
    );

    return suggestions.map(({ rank: _rank, ...suggestion }, index) => ({
      ...suggestion,
      accountUsername:
        accountCandidatesBySuggestion[index]?.find((username) =>
          registeredUsernames.has(username),
        ) ?? null,
    }));
  });

export const resolveUsernameInput = async (value: string): Promise<string> =>
  cachedRequest(usernameResolutionCache, ["resolved-username", value], async () => {
    const exactUsername = String(value).trim();
    const username = normalizeUsername(exactUsername);
    if (!exactUsername) return "";

    const identity = await fetchProfileAliasRow(exactUsername);
    if (identity?.username) return identity.username;
    return username;
  });

export const resolveUsernameInputs = async (values: string[] = []): Promise<string[]> =>
  Promise.all(values.map((value) => resolveUsernameInput(value)));
