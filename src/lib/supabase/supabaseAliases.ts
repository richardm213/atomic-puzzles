import type { Aliases2TableRow, AliasesTableRow } from "../../types/supabase";
import { normalizeUsername } from "../../utils/playerNames";
import { cachedRequest } from "../../utils/requestCache";
import { getSupabaseClient } from "./supabaseClient";
import { fetchAllSupabaseRows, loadSupabaseRows } from "./supabaseRows";

export type NormalizedAliasRow = {
  username: string;
  aliases: string[];
  openings: string[];
  banned: boolean;
  accounts: AliasAccount[];
  hasExplicitCountableAliases: boolean;
};

export type AliasAccountSource = "lichess" | "chesscom";

export type AliasAccount = {
  alias: string;
  displayAlias: string;
  source: AliasAccountSource;
  isCounted: boolean;
  banned: boolean;
};

type NormalizedAlias2Row = {
  username: string;
  alias: string;
  banned: boolean;
  isCounted: boolean;
  accounts: AliasAccount[];
};

export type MergedAliasRow = {
  username: string;
  aliases: string[];
  openings: string[];
  banned: boolean;
  countableAliases: string[];
  accounts: AliasAccount[];
  hasExplicitCountableAliases: boolean;
};

type MergeInputRow = NormalizedAliasRow & {
  countableAliases?: string[];
};

type ProfileAliasSource = {
  username: string;
  aliasTableRow: NormalizedAliasRow | null;
};

const ALIASES_TABLE = "aliases" as const;
const ALIASES2_TABLE = "aliases2" as const;
const ALIASES_SELECT_COLUMNS = "username,aliases,openings,banned";
const ALIASES2_SELECT_COLUMNS = "alias,username,banned,count_games";
const aliasesRowsCache = new Map<string, Promise<MergedAliasRow[]>>();
const aliasTableRowsCache = new Map<string, Promise<NormalizedAliasRow[]>>();
const alias2TableRowsCache = new Map<string, Promise<MergedAliasRow[]>>();
const alias2RawRowsCache = new Map<string, Promise<Aliases2TableRow[]>>();
const profileAliasSourceCache = new Map<string, Promise<ProfileAliasSource>>();
const profileAliasEntryCache = new Map<string, Promise<MergedAliasRow | null>>();

const createLichessAccount = (
  alias: string,
  isCounted: boolean = true,
  banned: boolean = false,
): AliasAccount => ({
  alias,
  displayAlias: alias,
  source: "lichess",
  isCounted,
  banned,
});

const normalizeCountGamesValue = (
  value: Aliases2TableRow["count_games"] | undefined,
): "y" | "n" | "c" | "o" => {
  if (value === undefined || value === null) return "y";
  if (typeof value === "boolean") return value ? "y" : "n";
  if (typeof value === "number") return value === 0 ? "n" : "y";

  const normalizedValue = String(value).trim().toLowerCase();
  if (
    normalizedValue === "o" ||
    normalizedValue === "both" ||
    normalizedValue === "lichess+chesscom" ||
    normalizedValue === "lichess+chess.com"
  ) {
    return "o";
  }
  if (
    normalizedValue === "c" ||
    normalizedValue === "chesscom" ||
    normalizedValue === "chess.com"
  ) {
    return "c";
  }
  if (
    normalizedValue === "n" ||
    normalizedValue === "no" ||
    normalizedValue === "false" ||
    normalizedValue === "0"
  ) {
    return "n";
  }
  return "y";
};

const createAlias2Accounts = (
  alias: string,
  rawAlias: string,
  countGames: ReturnType<typeof normalizeCountGamesValue>,
  banned: boolean,
): AliasAccount[] => {
  const chessComDisplayAlias = normalizeUsername(rawAlias || alias);
  if (countGames === "c") {
    return [
      {
        alias,
        displayAlias: chessComDisplayAlias,
        source: "chesscom",
        isCounted: false,
        banned,
      },
    ];
  }
  if (countGames === "o") {
    return [
      createLichessAccount(alias, true, banned),
      {
        alias,
        displayAlias: chessComDisplayAlias,
        source: "chesscom",
        isCounted: false,
        banned,
      },
    ];
  }
  return [createLichessAccount(alias, countGames === "y", banned)];
};

const mergeAliasAccounts = (accounts: AliasAccount[] = []): AliasAccount[] => {
  const accountsByKey = new Map<string, AliasAccount>();

  accounts.forEach((account) => {
    const alias = normalizeUsername(account.alias);
    if (!alias) return;

    const source = account.source === "chesscom" ? "chesscom" : "lichess";
    const displayAlias =
      source === "chesscom"
        ? normalizeUsername(account.displayAlias || account.alias)
        : String(account.displayAlias || "").trim() || alias;
    accountsByKey.set(`${source}:${alias}`, {
      alias,
      displayAlias,
      source,
      isCounted: Boolean(account.isCounted),
      banned: Boolean(account.banned),
    });
  });

  return [...accountsByKey.values()];
};

const normalizeOpenings = (openings: unknown): string[] =>
  Array.isArray(openings)
    ? [
        ...new Set(
          openings
            .map((opening) =>
              String(opening || "")
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean),
        ),
      ]
    : [];

const normalizeAliasRow = (row: AliasesTableRow | null | undefined): NormalizedAliasRow | null => {
  const username = normalizeUsername(row?.username);
  const aliases = Array.isArray(row?.aliases)
    ? row.aliases.map(normalizeUsername).filter(Boolean)
    : [];
  const aliasesWithoutUsername = [...new Set(aliases.filter((alias) => alias !== username))];

  if (!username) return null;

  return {
    username,
    aliases: aliasesWithoutUsername,
    openings: normalizeOpenings(row?.openings),
    banned: Boolean(row?.banned),
    accounts: aliasesWithoutUsername.map((alias) =>
      createLichessAccount(alias, true, Boolean(row?.banned)),
    ),
    hasExplicitCountableAliases: false,
  };
};

const fetchUncachedAliasRows = async (): Promise<NormalizedAliasRow[]> => {
  const supabase = getSupabaseClient();
  const rows = await fetchAllSupabaseRows<AliasesTableRow>(ALIASES_TABLE, () =>
    supabase.from(ALIASES_TABLE).select(ALIASES_SELECT_COLUMNS).order("username"),
  );

  return rows.map(normalizeAliasRow).filter((row): row is NormalizedAliasRow => row !== null);
};

const fetchAliasesTableRows = async (): Promise<NormalizedAliasRow[]> =>
  cachedRequest(aliasTableRowsCache, ["aliases-table"], async () => fetchUncachedAliasRows());

const normalizeAlias2Row = (
  row: Aliases2TableRow | null | undefined,
): NormalizedAlias2Row | null => {
  const username = normalizeUsername(row?.username);
  const rawAlias = String(row?.alias || "").trim();
  const alias = normalizeUsername(row?.alias);
  const countGames = normalizeCountGamesValue(row?.count_games);

  if (!username || !alias) return null;

  return {
    username,
    alias,
    banned: Boolean(row?.banned),
    isCounted: countGames === "y" || countGames === "o",
    accounts: createAlias2Accounts(alias, rawAlias, countGames, Boolean(row?.banned)),
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
        openings: [...row.openings],
        banned: Boolean(row.banned),
        countableAliases: Array.isArray(row.countableAliases)
          ? [...row.countableAliases]
          : [row.username, ...row.aliases],
        accounts: mergeAliasAccounts(row.accounts),
        hasExplicitCountableAliases: Boolean(row.hasExplicitCountableAliases),
      });
      return;
    }

    const nextAliases = [...new Set([...existing.aliases, ...row.aliases])];
    const nextOpenings = [...new Set([...existing.openings, ...row.openings])];
    const existingExplicit = Boolean(existing.hasExplicitCountableAliases);
    const rowExplicit = Boolean(row.hasExplicitCountableAliases);
    const nextAccounts =
      existingExplicit || rowExplicit
        ? mergeAliasAccounts([
            ...(existingExplicit ? existing.accounts : []),
            ...(rowExplicit ? row.accounts : []),
          ])
        : mergeAliasAccounts([...(existing.accounts ?? []), ...(row.accounts ?? [])]);
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
      openings: nextOpenings,
      banned: Boolean(existing.banned || row.banned),
      countableAliases: nextCountableAliases,
      accounts: nextAccounts,
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
  const accounts: AliasAccount[] = [];
  let banned = false;

  normalizedRows.forEach((row) => {
    if (row.alias !== username) aliases.add(row.alias);
    if (row.isCounted) countableAliases.add(row.alias);
    accounts.push(...row.accounts);
    banned = Boolean(banned || row.banned);
  });

  return {
    username,
    aliases: [...aliases],
    openings: [],
    banned,
    countableAliases: [...countableAliases],
    accounts: mergeAliasAccounts(accounts),
    hasExplicitCountableAliases: true,
  };
};

const fetchAliases2RawRows = async (): Promise<Aliases2TableRow[]> =>
  cachedRequest(alias2RawRowsCache, ["aliases2-raw"], async () => {
    const supabase = getSupabaseClient();
    return fetchAllSupabaseRows<Aliases2TableRow>(ALIASES2_TABLE, () =>
      supabase
        .from(ALIASES2_TABLE)
        .select(ALIASES2_SELECT_COLUMNS)
        .order("username")
        .order("alias"),
    );
  });

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

  const exactMatch = normalizeUsername(rows[0]?.username);
  if (exactMatch) return exactMatch;

  try {
    const aliasRows = await fetchAliases2RawRows();
    const caseInsensitiveMatch = aliasRows.find((row) => normalizeUsername(row.alias) === username);
    return normalizeUsername(caseInsensitiveMatch?.username);
  } catch {
    return "";
  }
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
  try {
    const rows = await fetchAliases2RawRows();
    type AggregateEntry = {
      aliases: Set<string>;
      banned: boolean;
      countableAliases: Set<string>;
      accounts: AliasAccount[];
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
          accounts: [],
        };

        if (alias !== username) existingEntry.aliases.add(alias);
        if (row.isCounted) existingEntry.countableAliases.add(alias);
        existingEntry.accounts.push(...row.accounts);
        existingEntry.banned = Boolean(existingEntry.banned || row.banned);
        aliasesByUsername.set(username, existingEntry);
      });

    return Array.from(aliasesByUsername.entries()).map(([username, entry]) => ({
      username,
      aliases: [...entry.aliases],
      openings: [],
      banned: Boolean(entry.banned),
      countableAliases: [...entry.countableAliases],
      accounts: mergeAliasAccounts(entry.accounts),
      hasExplicitCountableAliases: true,
    }));
  } catch {
    return [];
  }
};

const fetchAliases2TableRows = async (): Promise<MergedAliasRow[]> =>
  cachedRequest(alias2TableRowsCache, ["aliases2-table"], async () => fetchUncachedAlias2Rows());

const resolveProfileAliasSource = async (value: string): Promise<ProfileAliasSource> =>
  cachedRequest(profileAliasSourceCache, ["profile-alias-source", value], async () => {
    const username = normalizeUsername(value);
    if (!username) return { username: "", aliasTableRow: null };

    const [alias2Match, aliasTableDirectMatch] = await Promise.all([
      fetchAliases2CanonicalUsername(username),
      fetchAliasesTableRowForUsername(username),
    ]);

    if (alias2Match) {
      return {
        username: alias2Match,
        aliasTableRow: alias2Match === username ? aliasTableDirectMatch : null,
      };
    }

    const aliasTableRow = aliasTableDirectMatch ?? (await fetchAliasesTableRowForAlias(username));
    return {
      username: aliasTableRow?.username ?? username,
      aliasTableRow,
    };
  });

export const resolveProfileUsernameFromAliases = async (value: string): Promise<string> => {
  const { username } = await resolveProfileAliasSource(value);
  return username;
};

export const fetchProfileAliasRow = async (value: string): Promise<MergedAliasRow | null> =>
  cachedRequest(profileAliasEntryCache, ["profile-alias-entry", value], async () => {
    const { username: canonicalUsername, aliasTableRow: resolvedAliasTableRow } =
      await resolveProfileAliasSource(value);
    if (!canonicalUsername) return null;

    const aliasTableRowRequest =
      resolvedAliasTableRow ?? fetchAliasesTableRowForUsername(canonicalUsername);
    const [aliasTableRow, alias2AggregateRow] = await Promise.all([
      aliasTableRowRequest,
      fetchAliases2AggregateRowForUsername(canonicalUsername),
    ]);
    const mergedRows = mergeAliasRows(
      [aliasTableRow, alias2AggregateRow].filter((row): row is MergeInputRow => row !== null),
    );

    return mergedRows[0] ?? null;
  });

export const fetchAliasRows = async (): Promise<MergedAliasRow[]> =>
  cachedRequest(aliasesRowsCache, ["aliases"], async () => {
    const [aliasRows, alias2Rows] = await Promise.all([
      fetchAliasesTableRows(),
      fetchAliases2TableRows(),
    ]);
    return mergeAliasRows([...aliasRows, ...alias2Rows]);
  });
