import { getSupabaseClient } from "./supabaseClient";
import { fetchAllSupabaseRows } from "./supabaseRows";
import { cachedRequest } from "../utils/requestCache";
import { normalizeUsername } from "../utils/playerNames";

const ALIASES_TABLE = "aliases";
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

export const fetchAliasRows = async () =>
  cachedRequest(aliasesRowsCache, ["aliases"], fetchUncachedAliasRows);
