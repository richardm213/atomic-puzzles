import { normalizeUsername } from "../../utils/playerNames";
import { cachedRequest } from "../../utils/requestCache";
import { appendArchiveParam, fetchArchiveJson } from "./client";
import type { AliasRow } from "./types";

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

const COUNT_GAMES_MODES = new Set<CountGamesMode>(["y", "n", "c", "o"]);
const aliasRowsCache = new Map<string, Promise<AliasIdentityRow[]>>();
const rawAliasRowsCache = new Map<string, Promise<AliasRow[]>>();
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

const normalizeCountGamesValue = (value: AliasRow["count_games"] | undefined): CountGamesMode => {
  const normalizedValue = String(value ?? "y")
    .trim()
    .toLowerCase() as CountGamesMode;
  return COUNT_GAMES_MODES.has(normalizedValue) ? normalizedValue : "y";
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
  const openingValues = typeof openings === "string" ? parsePostgresArrayLiteral(openings) : [];

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
  row: AliasRow | null | undefined,
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

export const buildAliasIdentityRowsFromArchiveRows = (
  rows: AliasRow[] = [],
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

const getFirstAliasIdentityRow = (rows: AliasRow[]): AliasIdentityRow | null =>
  buildAliasIdentityRowsFromArchiveRows(rows)[0] ?? null;

const fetchRawAliasRows = async (): Promise<AliasRow[]> =>
  cachedRequest(rawAliasRowsCache, ["aliases-raw"], async () => {
    return fetchArchiveJson<AliasRow[]>(new URLSearchParams({ resource: "aliases" }));
  });

const fetchCanonicalUsernameForAlias = async (value: string): Promise<string> => {
  const username = normalizeUsername(value);
  if (!username) return "";

  const params = new URLSearchParams({ resource: "aliases" });
  appendArchiveParam(params, "username", username);
  const rows = await fetchArchiveJson<AliasRow[]>(params);
  return normalizeUsername(rows[0]?.username);
};

const fetchAliasIdentityRowForUsername = async (
  username: string,
): Promise<AliasIdentityRow | null> => {
  const params = new URLSearchParams({ resource: "aliases" });
  appendArchiveParam(params, "username", username);
  const rows = await fetchArchiveJson<AliasRow[]>(params);
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
    return buildAliasIdentityRowsFromArchiveRows(await fetchRawAliasRows());
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

    const canonicalUsername = (await fetchCanonicalUsernameForAlias(username)) || username;
    return fetchAliasIdentityRowForUsername(canonicalUsername);
  });

export const fetchAliasRows = async (): Promise<AliasIdentityRow[]> =>
  cachedRequest(aliasRowsCache, ["aliases"], async () => fetchUncachedAliasRows());
