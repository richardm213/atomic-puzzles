import { getSupabaseClient } from "./supabaseClient";
import { fetchAllSupabaseRows } from "./supabaseRows";
import { cachedRequest } from "../utils/requestCache";
import { normalizeUsername } from "../utils/playerNames";

const ALIASES_TABLE = "aliases";
const ALIASES2_TABLE = "aliases2";
const ALIASES_SELECT_COLUMNS = "username,aliases,banned";
const ALIASES2_SELECT_COLUMNS = "alias,username,banned,count_games";
const aliasesRowsCache = new Map();
const aliasTableRowsCache = new Map();
const alias2TableRowsCache = new Map();
const profileUsernameCache = new Map();

const normalizeAliasRow = (row) => {
  const username = normalizeUsername(row?.username);
  const aliases = Array.isArray(row?.aliases) ? row.aliases.map(normalizeUsername).filter(Boolean) : [];

  if (!username) return null;

  return {
    username,
    aliases: [...new Set(aliases.filter((alias) => alias !== username))],
    banned: Boolean(row?.banned),
    hasExplicitCountableAliases: false,
  };
};

const fetchUncachedAliasRows = async () => {
  const supabase = getSupabaseClient();
  const rows = await fetchAllSupabaseRows(ALIASES_TABLE, () =>
    supabase.from(ALIASES_TABLE).select(ALIASES_SELECT_COLUMNS).order("username"),
  );

  return rows.map(normalizeAliasRow).filter(Boolean);
};

export const fetchAliasesTableRows = async () =>
  cachedRequest(aliasTableRowsCache, ["aliases-table"], async () => fetchUncachedAliasRows());

const normalizeAlias2Row = (row) => {
  const username = normalizeUsername(row?.username);
  const alias = normalizeUsername(row?.alias);

  if (!username || !alias) return null;

  return {
    username,
    alias,
    banned: Boolean(row?.banned),
    countGames: row?.count_games === undefined || row?.count_games === null ? true : Boolean(row.count_games),
  };
};

const fetchUncachedAlias2Rows = async () => {
  const supabase = getSupabaseClient();

  try {
    const rows = await fetchAllSupabaseRows(ALIASES2_TABLE, () =>
      supabase.from(ALIASES2_TABLE).select(ALIASES2_SELECT_COLUMNS).order("username").order("alias"),
    );
    const aliasesByUsername = new Map();

    rows.map(normalizeAlias2Row).filter(Boolean).forEach((row) => {
      const { username, alias } = row;
      const existingEntry = aliasesByUsername.get(username) ?? {
        aliases: new Set(),
        banned: false,
        countableAliases: new Set(),
      };

      if (alias !== username) existingEntry.aliases.add(alias);
      if (row.countGames) existingEntry.countableAliases.add(alias);
      existingEntry.banned = Boolean(existingEntry.banned || row?.banned);
      aliasesByUsername.set(username, existingEntry);
    });

    return Array.from(aliasesByUsername.entries()).map(([username, entry]) => ({
      username,
      aliases: [...entry.aliases],
      banned: Boolean(entry.banned),
      countableAliases: [...entry.countableAliases],
      hasExplicitCountableAliases: true,
    }));
  } catch {
    return [];
  }
};

export const fetchAliases2TableRows = async () =>
  cachedRequest(alias2TableRowsCache, ["aliases2-table"], async () => fetchUncachedAlias2Rows());

const findCanonicalUsername = (rows, username) =>
  rows.find((row) => row.username === username || row.aliases.includes(username))?.username ?? "";

export const resolveProfileUsernameFromAliases = async (value) =>
  cachedRequest(profileUsernameCache, ["profile-username", value], async () => {
    const username = normalizeUsername(value);
    if (!username) return "";

    const aliasRows = await fetchAliasesTableRows();
    const aliasMatch = findCanonicalUsername(aliasRows, username);
    if (aliasMatch) return aliasMatch;

    const alias2Rows = await fetchAliases2TableRows();
    return findCanonicalUsername(alias2Rows, username) || username;
  });

export const fetchAliasRows = async () =>
  cachedRequest(aliasesRowsCache, ["aliases"], async () => {
    const [aliasRows, alias2Rows] = await Promise.all([
      fetchAliasesTableRows(),
      fetchAliases2TableRows(),
    ]);
    const mergedRows = new Map();

    [...aliasRows, ...alias2Rows].forEach((row) => {
      const existing = mergedRows.get(row.username);
      if (!existing) {
        mergedRows.set(row.username, {
          username: row.username,
          aliases: [...row.aliases],
          banned: Boolean(row.banned),
          countableAliases: Array.isArray(row.countableAliases)
            ? [...row.countableAliases]
            : [row.username, ...row.aliases],
          hasExplicitCountableAliases: Boolean(row.hasExplicitCountableAliases),
        });
        return;
      }

      const nextAliases = [...new Set([...existing.aliases, ...row.aliases])];
      const existingExplicit = Boolean(existing.hasExplicitCountableAliases);
      const rowExplicit = Boolean(row.hasExplicitCountableAliases);
      const nextCountableAliases =
        existingExplicit || rowExplicit
          ? [
              ...new Set([
                ...(existingExplicit ? existing.countableAliases : []),
                ...(rowExplicit ? row.countableAliases ?? [] : []),
              ]),
            ]
          : [
              ...new Set([
                ...(Array.isArray(existing.countableAliases)
                  ? existing.countableAliases
                  : [existing.username, ...existing.aliases]),
                ...(Array.isArray(row.countableAliases)
                  ? row.countableAliases
                  : [row.username, ...row.aliases]),
              ]),
            ];

      mergedRows.set(row.username, {
        username: row.username,
        aliases: nextAliases,
        banned: Boolean(existing.banned || row.banned),
        countableAliases: nextCountableAliases,
        hasExplicitCountableAliases: existingExplicit || rowExplicit,
      });
    });

    return [...mergedRows.values()];
  });
