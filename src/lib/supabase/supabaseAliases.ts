import { getSupabaseClient } from "./supabaseClient";
import { fetchAllSupabaseRows, loadSupabaseRows } from "./supabaseRows";
import { cachedRequest } from "../../utils/requestCache";
import { normalizeUsername } from "../../utils/playerNames";

type AliasesTableRow = {
  username: string | null;
  aliases: string[] | null;
  banned: boolean | null;
};

type Aliases2TableRow = {
  alias: string | null;
  username: string | null;
  banned: boolean | null;
  count_games: boolean | number | null;
};

export type NormalizedAliasRow = {
  username: string;
  aliases: string[];
  banned: boolean;
  hasExplicitCountableAliases: boolean;
};

type NormalizedAlias2Row = {
  username: string;
  alias: string;
  banned: boolean;
  countGames: boolean;
};

export type MergedAliasRow = {
  username: string;
  aliases: string[];
  banned: boolean;
  countableAliases: string[];
  hasExplicitCountableAliases: boolean;
};

type MergeInputRow = NormalizedAliasRow & {
  countableAliases?: string[];
};

const ALIASES_TABLE = "aliases";
const ALIASES2_TABLE = "aliases2";
const ALIASES_SELECT_COLUMNS = "username,aliases,banned";
const ALIASES2_SELECT_COLUMNS = "alias,username,banned,count_games";
const aliasesRowsCache = new Map<string, Promise<MergedAliasRow[]>>();
const aliasTableRowsCache = new Map<string, Promise<NormalizedAliasRow[]>>();
const alias2TableRowsCache = new Map<string, Promise<MergedAliasRow[]>>();
const profileUsernameCache = new Map<string, Promise<string>>();
const profileAliasEntryCache = new Map<string, Promise<MergedAliasRow | null>>();

const normalizeAliasRow = (
  row: AliasesTableRow | null | undefined,
): NormalizedAliasRow | null => {
  const username = normalizeUsername(row?.username);
  const aliases = Array.isArray(row?.aliases)
    ? row.aliases.map(normalizeUsername).filter(Boolean)
    : [];

  if (!username) return null;

  return {
    username,
    aliases: [...new Set(aliases.filter((alias) => alias !== username))],
    banned: Boolean(row?.banned),
    hasExplicitCountableAliases: false,
  };
};

const fetchUncachedAliasRows = async (): Promise<NormalizedAliasRow[]> => {
  const supabase = getSupabaseClient();
  const rows = await fetchAllSupabaseRows<AliasesTableRow>(ALIASES_TABLE, () =>
    supabase.from(ALIASES_TABLE).select(ALIASES_SELECT_COLUMNS).order("username"),
  );

  return rows
    .map(normalizeAliasRow)
    .filter((row): row is NormalizedAliasRow => row !== null);
};

const fetchAliasesTableRows = async (): Promise<NormalizedAliasRow[]> =>
  cachedRequest(aliasTableRowsCache, ["aliases-table"], async () => fetchUncachedAliasRows());

const normalizeAlias2Row = (
  row: Aliases2TableRow | null | undefined,
): NormalizedAlias2Row | null => {
  const username = normalizeUsername(row?.username);
  const alias = normalizeUsername(row?.alias);

  if (!username || !alias) return null;

  return {
    username,
    alias,
    banned: Boolean(row?.banned),
    countGames:
      row?.count_games === undefined || row?.count_games === null ? true : Boolean(row.count_games),
  };
};

const mergeAliasRows = (rows: MergeInputRow[] = []): MergedAliasRow[] => {
  const mergedRows = new Map<string, MergedAliasRow>();

  rows.filter(Boolean).forEach((row) => {
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
              ...(rowExplicit ? (row.countableAliases ?? []) : []),
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
};

const buildAlias2AggregateRow = (rows: Aliases2TableRow[] = []): MergedAliasRow | null => {
  const normalizedRows = rows
    .map(normalizeAlias2Row)
    .filter((row): row is NormalizedAlias2Row => row !== null);
  if (normalizedRows.length === 0) return null;

  const username = normalizedRows[0]!.username;
  const aliases = new Set<string>();
  const countableAliases = new Set<string>();
  let banned = false;

  normalizedRows.forEach((row) => {
    if (row.alias !== username) aliases.add(row.alias);
    if (row.countGames) countableAliases.add(row.alias);
    banned = Boolean(banned || row.banned);
  });

  return {
    username,
    aliases: [...aliases],
    banned,
    countableAliases: [...countableAliases],
    hasExplicitCountableAliases: true,
  };
};

const fetchAliasesTableRowForUsername = async (
  username: string,
): Promise<NormalizedAliasRow | null> => {
  const supabase = getSupabaseClient();
  const rows = await loadSupabaseRows<AliasesTableRow>(
    ALIASES_TABLE,
    supabase.from(ALIASES_TABLE).select(ALIASES_SELECT_COLUMNS).eq("username", username).limit(1),
  );
  return normalizeAliasRow(rows[0]);
};

const fetchAliasesTableRowForAlias = async (alias: string): Promise<NormalizedAliasRow | null> => {
  const supabase = getSupabaseClient();
  const rows = await loadSupabaseRows<AliasesTableRow>(
    ALIASES_TABLE,
    supabase
      .from(ALIASES_TABLE)
      .select(ALIASES_SELECT_COLUMNS)
      .contains("aliases", [alias])
      .limit(1),
  );
  return normalizeAliasRow(rows[0]);
};

const fetchAliases2CanonicalUsername = async (value: string): Promise<string> => {
  const username = normalizeUsername(value);
  if (!username) return "";

  const supabase = getSupabaseClient();
  const rows = await loadSupabaseRows<{ username: string | null; alias: string | null }>(
    ALIASES2_TABLE,
    supabase.from(ALIASES2_TABLE).select("username,alias").eq("alias", username).limit(1),
  );

  return normalizeUsername(rows[0]?.username);
};

const fetchAliases2AggregateRowForUsername = async (
  username: string,
): Promise<MergedAliasRow | null> => {
  const supabase = getSupabaseClient();
  const rows = await loadSupabaseRows<Aliases2TableRow>(
    ALIASES2_TABLE,
    supabase
      .from(ALIASES2_TABLE)
      .select(ALIASES2_SELECT_COLUMNS)
      .eq("username", username)
      .order("alias"),
  );
  return buildAlias2AggregateRow(rows);
};

const fetchUncachedAlias2Rows = async (): Promise<MergedAliasRow[]> => {
  const supabase = getSupabaseClient();

  try {
    const rows = await fetchAllSupabaseRows<Aliases2TableRow>(ALIASES2_TABLE, () =>
      supabase
        .from(ALIASES2_TABLE)
        .select(ALIASES2_SELECT_COLUMNS)
        .order("username")
        .order("alias"),
    );
    type AggregateEntry = {
      aliases: Set<string>;
      banned: boolean;
      countableAliases: Set<string>;
    };
    const aliasesByUsername = new Map<string, AggregateEntry>();

    rows
      .map(normalizeAlias2Row)
      .filter((row): row is NormalizedAlias2Row => row !== null)
      .forEach((row) => {
        const { username, alias } = row;
        const existingEntry: AggregateEntry = aliasesByUsername.get(username) ?? {
          aliases: new Set<string>(),
          banned: false,
          countableAliases: new Set<string>(),
        };

        if (alias !== username) existingEntry.aliases.add(alias);
        if (row.countGames) existingEntry.countableAliases.add(alias);
        existingEntry.banned = Boolean(existingEntry.banned || row.banned);
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

const fetchAliases2TableRows = async (): Promise<MergedAliasRow[]> =>
  cachedRequest(alias2TableRowsCache, ["aliases2-table"], async () => fetchUncachedAlias2Rows());

export const resolveProfileUsernameFromAliases = async (value: string): Promise<string> =>
  cachedRequest(profileUsernameCache, ["profile-username", value], async () => {
    const username = normalizeUsername(value);
    if (!username) return "";

    const alias2Match = await fetchAliases2CanonicalUsername(username);
    if (alias2Match) return alias2Match;

    const aliasTableDirectMatch = await fetchAliasesTableRowForUsername(username);
    if (aliasTableDirectMatch) return aliasTableDirectMatch.username;

    const aliasTableAliasMatch = await fetchAliasesTableRowForAlias(username);
    if (aliasTableAliasMatch) return aliasTableAliasMatch.username;

    return username;
  });

export const fetchProfileAliasRow = async (value: string): Promise<MergedAliasRow | null> =>
  cachedRequest(profileAliasEntryCache, ["profile-alias-entry", value], async () => {
    const canonicalUsername = await resolveProfileUsernameFromAliases(value);
    if (!canonicalUsername) return null;

    return fetchAliases2AggregateRowForUsername(canonicalUsername);
  });

export const fetchAliasRows = async (): Promise<MergedAliasRow[]> =>
  cachedRequest(aliasesRowsCache, ["aliases"], async () => {
    const [aliasRows, alias2Rows] = await Promise.all([
      fetchAliasesTableRows(),
      fetchAliases2TableRows(),
    ]);
    return mergeAliasRows([...aliasRows, ...alias2Rows]);
  });
