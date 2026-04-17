import { getSupabaseClient } from "./supabaseClient";
import { fetchAllSupabaseRows } from "./supabaseRows";
import { cachedRequest } from "../utils/requestCache";
import { normalizeUsername } from "../utils/playerNames";

const ALIASES_TABLE = "aliases";
const ALIASES2_TABLE = "aliases2";
const ALIASES_SELECT_COLUMNS = "username,aliases";
const aliasesRowsCache = new Map();

const normalizeAliasRow = (row) => {
  const username = normalizeUsername(row?.username);
  const aliases = Array.isArray(row?.aliases) ? row.aliases.map(normalizeUsername).filter(Boolean) : [];

  if (!username) return null;

  return {
    username,
    aliases: [...new Set(aliases.filter((alias) => alias !== username))],
  };
};

const fetchUncachedAliasRows = async () => {
  const supabase = getSupabaseClient();
  const rows = await fetchAllSupabaseRows(ALIASES_TABLE, () =>
    supabase.from(ALIASES_TABLE).select(ALIASES_SELECT_COLUMNS).order("username"),
  );

  return rows.map(normalizeAliasRow).filter(Boolean);
};

const normalizeAliasList = (value) => {
  if (Array.isArray(value)) {
    return value.map(normalizeUsername).filter(Boolean);
  }

  const raw = String(value ?? "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeUsername).filter(Boolean);
    }
  } catch {
    // Fall back to comma-separated parsing below.
  }

  return raw
    .split(",")
    .map((entry) => normalizeUsername(entry))
    .filter(Boolean);
};

const fetchUncachedAlias2Rows = async () => {
  const supabase = getSupabaseClient();

  try {
    const rows = await fetchAllSupabaseRows(ALIASES2_TABLE, () =>
      supabase.from(ALIASES2_TABLE).select("*").order("username"),
    );
    const aliasesByUsername = new Map();

    rows.forEach((row) => {
      const username = normalizeUsername(
        row?.username ?? row?.primary ?? row?.canonical_username ?? row?.user ?? row?.player,
      );
      if (!username) return;

      const aliases = [
        ...normalizeAliasList(row?.aliases),
        ...normalizeAliasList(row?.members),
        normalizeUsername(row?.alias),
        normalizeUsername(row?.alt),
        normalizeUsername(row?.alias_username),
      ].filter(Boolean);

      const existingAliases = aliasesByUsername.get(username) ?? new Set();
      aliases.forEach((alias) => {
        if (alias !== username) existingAliases.add(alias);
      });
      aliasesByUsername.set(username, existingAliases);
    });

    return Array.from(aliasesByUsername.entries()).map(([username, aliases]) => ({
      username,
      aliases: [...aliases],
    }));
  } catch {
    return [];
  }
};

export const fetchAliasRows = async () =>
  cachedRequest(aliasesRowsCache, ["aliases"], async () => {
    const [aliasRows, alias2Rows] = await Promise.all([
      fetchUncachedAliasRows(),
      fetchUncachedAlias2Rows(),
    ]);
    const mergedRows = new Map();

    [...aliasRows, ...alias2Rows].forEach((row) => {
      const existing = mergedRows.get(row.username);
      if (!existing) {
        mergedRows.set(row.username, {
          username: row.username,
          aliases: [...row.aliases],
        });
        return;
      }

      mergedRows.set(row.username, {
        username: row.username,
        aliases: [...new Set([...existing.aliases, ...row.aliases])],
      });
    });

    return [...mergedRows.values()];
  });
