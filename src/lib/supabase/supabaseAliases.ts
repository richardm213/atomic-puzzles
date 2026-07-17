import type { Aliases2TableRow } from "../../types/supabase";
import { normalizeUsername } from "../../utils/playerNames";
import { cachedRequest } from "../../utils/requestCache";
import { getSupabaseClient } from "./supabaseClient";
import { fetchAllSupabaseRows, loadSupabaseRows } from "./supabaseRows";

type CountGamesMode = "y" | "n" | "c" | "o";

type NormalizedAliasAccountRow = {
  username: string;
  alias: string;
  openings: string[];
  banned: boolean;
  isCounted: boolean;
  accounts: AliasAccount[];
};

export type AliasAccountSource = "lichess" | "chesscom";

export type AliasAccount = {
  alias: string;
  displayAlias: string;
  source: AliasAccountSource;
  isCounted: boolean;
  banned: boolean;
};

export type AliasIdentityRow = {
  username: string;
  aliases: string[];
  openings: string[];
  banned: boolean;
  accounts: AliasAccount[];
};

type AliasIdentityAccumulator = {
  username: string;
  aliases: Set<string>;
  openings: Set<string>;
  accounts: AliasAccount[];
  hasActiveAccount: boolean;
  hasBannedAccount: boolean;
  hasBannedCanonicalAccount: boolean;
};

const ALIAS_TABLE = "aliases2" as const;
const ALIAS_SELECT_COLUMNS = "alias,username,banned,count_games,openings";
const COUNT_GAMES_ALIASES: Record<string, CountGamesMode> = {
  "0": "n",
  "1": "y",
  both: "o",
  c: "c",
  chesscom: "c",
  "chess.com": "c",
  false: "n",
  lichess: "y",
  "lichess+chess.com": "o",
  "lichess+chesscom": "o",
  n: "n",
  no: "n",
  o: "o",
  true: "y",
  y: "y",
  yes: "y",
};
const aliasRowsCache = new Map<string, Promise<AliasIdentityRow[]>>();
const rawAliasRowsCache = new Map<string, Promise<Aliases2TableRow[]>>();
const canonicalProfileUsernameCache = new Map<string, Promise<string>>();
const profileAliasEntryCache = new Map<string, Promise<AliasIdentityRow | null>>();

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

const createChessComAccount = (
  alias: string,
  displayAlias: string,
  banned: boolean,
): AliasAccount => ({
  alias,
  displayAlias,
  source: "chesscom",
  isCounted: true,
  banned,
});

const normalizeCountGamesValue = (
  value: Aliases2TableRow["count_games"] | undefined,
): CountGamesMode => {
  if (value === undefined || value === null) return "y";
  if (typeof value === "boolean") return value ? "y" : "n";
  if (typeof value === "number") return value === 0 ? "n" : "y";

  const normalizedValue = String(value).trim().toLowerCase();
  return COUNT_GAMES_ALIASES[normalizedValue] ?? "y";
};

const createAliasAccounts = (
  alias: string,
  rawAlias: string,
  countGames: CountGamesMode,
  banned: boolean,
): AliasAccount[] => {
  const accounts: AliasAccount[] = [];
  const chessComDisplayAlias = normalizeUsername(rawAlias || alias);

  if (countGames !== "c") {
    accounts.push(createLichessAccount(alias, countGames !== "n", banned));
  }

  if (countGames === "c" || countGames === "o") {
    accounts.push(createChessComAccount(alias, chessComDisplayAlias, banned));
  }

  return accounts;
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

const parsePostgresArrayLiteral = (value: string): string[] => {
  const rawValue = value.trim();
  if (!rawValue || rawValue === "{}") return [];
  if (!rawValue.startsWith("{") || !rawValue.endsWith("}")) return [rawValue];

  const values: string[] = [];
  let currentValue = "";
  let isQuoted = false;
  let tokenWasQuoted = false;
  let isEscaped = false;

  const pushCurrentValue = () => {
    const nextValue = tokenWasQuoted ? currentValue : currentValue.trim();
    if (tokenWasQuoted || nextValue.toUpperCase() !== "NULL") values.push(nextValue);
    currentValue = "";
    tokenWasQuoted = false;
  };

  for (const char of rawValue.slice(1, -1)) {
    if (isEscaped) {
      currentValue += char;
      isEscaped = false;
      continue;
    }

    if (isQuoted) {
      if (char === "\\") {
        isEscaped = true;
        continue;
      }
      if (char === '"') {
        isQuoted = false;
        tokenWasQuoted = true;
        continue;
      }
      currentValue += char;
      continue;
    }

    if (char === '"') {
      isQuoted = true;
      tokenWasQuoted = true;
      continue;
    }

    if (char === ",") {
      pushCurrentValue();
      continue;
    }

    currentValue += char;
  }

  pushCurrentValue();
  return values;
};

const normalizeOpenings = (openings: unknown): string[] => {
  const openingValues = Array.isArray(openings)
    ? openings
    : typeof openings === "string"
      ? parsePostgresArrayLiteral(openings)
      : [];

  return [
    ...new Set(
      openingValues
        .map((opening) =>
          String(opening || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
};

const isCountedMode = (countGames: CountGamesMode): boolean => countGames !== "n";

const normalizeAliasAccountRow = (
  row: Aliases2TableRow | null | undefined,
): NormalizedAliasAccountRow | null => {
  const username = normalizeUsername(row?.username);
  const rawAlias = String(row?.alias || "").trim();
  const alias = normalizeUsername(row?.alias);
  const countGames = normalizeCountGamesValue(row?.count_games);

  if (!username || !alias) return null;

  return {
    username,
    alias,
    banned: Boolean(row?.banned),
    isCounted: isCountedMode(countGames),
    openings: normalizeOpenings(row?.openings),
    accounts: createAliasAccounts(alias, rawAlias, countGames, Boolean(row?.banned)),
  };
};

const notNull = <T>(value: T | null): value is T => value !== null;

const createAliasIdentityAccumulator = (username: string): AliasIdentityAccumulator => ({
  username,
  aliases: new Set(),
  openings: new Set(),
  accounts: [],
  hasActiveAccount: false,
  hasBannedAccount: false,
  hasBannedCanonicalAccount: false,
});

const addAliasAccountRow = (
  accumulator: AliasIdentityAccumulator,
  row: NormalizedAliasAccountRow,
): void => {
  accumulator.accounts.push(...row.accounts);
  if (row.banned) {
    accumulator.hasBannedAccount = true;
    accumulator.hasBannedCanonicalAccount ||= row.alias === row.username;
    return;
  }

  accumulator.hasActiveAccount = true;
  if (row.alias !== accumulator.username) accumulator.aliases.add(row.alias);
  row.openings.forEach((opening) => accumulator.openings.add(opening));
};

const buildAliasIdentityRow = (
  username: string,
  rows: NormalizedAliasAccountRow[],
): AliasIdentityRow | null => {
  if (!username || rows.length === 0) return null;

  const accumulator = rows.reduce((nextAccumulator, row) => {
    addAliasAccountRow(nextAccumulator, row);
    return nextAccumulator;
  }, createAliasIdentityAccumulator(username));

  return {
    username: accumulator.username,
    aliases: [...accumulator.aliases],
    openings: [...accumulator.openings],
    banned:
      accumulator.hasBannedCanonicalAccount ||
      (!accumulator.hasActiveAccount && accumulator.hasBannedAccount),
    accounts: mergeAliasAccounts(accumulator.accounts),
  };
};

const addGroupedAliasRow = (
  rowsByUsername: Map<string, NormalizedAliasAccountRow[]>,
  row: NormalizedAliasAccountRow,
): void => {
  const existingRows = rowsByUsername.get(row.username);
  if (existingRows) {
    existingRows.push(row);
    return;
  }

  rowsByUsername.set(row.username, [row]);
};

export const buildAliasIdentityRowsFromAliases2Rows = (
  rows: Aliases2TableRow[] = [],
): AliasIdentityRow[] => {
  const rowsByUsername = new Map<string, NormalizedAliasAccountRow[]>();

  rows.forEach((rawRow) => {
    const row = normalizeAliasAccountRow(rawRow);
    if (row) addGroupedAliasRow(rowsByUsername, row);
  });

  return Array.from(rowsByUsername.entries())
    .map(([username, identityRows]) => buildAliasIdentityRow(username, identityRows))
    .filter(notNull);
};

const getFirstAliasIdentityRow = (rows: Aliases2TableRow[]): AliasIdentityRow | null =>
  buildAliasIdentityRowsFromAliases2Rows(rows)[0] ?? null;

const fetchRawAliasRows = async (): Promise<Aliases2TableRow[]> =>
  cachedRequest(rawAliasRowsCache, ["aliases2-raw"], async () => {
    const supabase = getSupabaseClient();
    return fetchAllSupabaseRows<Aliases2TableRow>(ALIAS_TABLE, () =>
      supabase.from(ALIAS_TABLE).select(ALIAS_SELECT_COLUMNS).order("username").order("alias"),
    );
  });

const fetchCanonicalUsernameForAlias = async (value: string): Promise<string> => {
  const username = normalizeUsername(value);
  if (!username) return "";

  const supabase = getSupabaseClient();
  const rows = await loadSupabaseRows<{ username: string | null; alias: string | null }>(
    ALIAS_TABLE,
    supabase.from(ALIAS_TABLE).select("username,alias").eq("alias", username).limit(1),
  );

  const exactMatch = normalizeUsername(rows[0]?.username);
  if (exactMatch) return exactMatch;

  try {
    const aliasRows = await fetchRawAliasRows();
    const caseInsensitiveMatch = aliasRows.find((row) => normalizeUsername(row.alias) === username);
    return normalizeUsername(caseInsensitiveMatch?.username);
  } catch {
    return "";
  }
};

const fetchAliasIdentityRowForUsername = async (
  username: string,
): Promise<AliasIdentityRow | null> => {
  const supabase = getSupabaseClient();
  const rows = await loadSupabaseRows<Aliases2TableRow>(
    ALIAS_TABLE,
    supabase.from(ALIAS_TABLE).select(ALIAS_SELECT_COLUMNS).eq("username", username).order("alias"),
  );
  const exactAggregateRow = getFirstAliasIdentityRow(rows);
  if (exactAggregateRow) return exactAggregateRow;

  try {
    const aliasRows = await fetchRawAliasRows();
    return getFirstAliasIdentityRow(
      aliasRows.filter((row) => normalizeUsername(row.username) === username),
    );
  } catch {
    return null;
  }
};

const fetchUncachedAliasRows = async (): Promise<AliasIdentityRow[]> => {
  try {
    return buildAliasIdentityRowsFromAliases2Rows(await fetchRawAliasRows());
  } catch {
    return [];
  }
};

const resolveCanonicalProfileUsername = async (value: string): Promise<string> =>
  cachedRequest(canonicalProfileUsernameCache, ["canonical-profile-username", value], async () => {
    const username = normalizeUsername(value);
    if (!username) return "";

    const identityRow = await fetchProfileAliasRow(username);
    return identityRow?.username || username;
  });

export const resolveProfileUsernameFromAliases = async (value: string): Promise<string> =>
  resolveCanonicalProfileUsername(value);

export const fetchProfileAliasRow = async (value: string): Promise<AliasIdentityRow | null> =>
  cachedRequest(profileAliasEntryCache, ["profile-alias-entry", value], async () => {
    const username = normalizeUsername(value);
    if (!username) return null;

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("get_profile_identity", {
        p_username: username,
      });
      if (error) throw error;
      return getFirstAliasIdentityRow(Array.isArray(data) ? data : []);
    } catch {
      // Keep profile lookup functional while the RPC migration rolls out.
      const canonicalUsername = (await fetchCanonicalUsernameForAlias(username)) || username;
      return fetchAliasIdentityRowForUsername(canonicalUsername);
    }
  });

export const fetchAliasRows = async (): Promise<AliasIdentityRow[]> =>
  cachedRequest(aliasRowsCache, ["aliases2"], async () => fetchUncachedAliasRows());
