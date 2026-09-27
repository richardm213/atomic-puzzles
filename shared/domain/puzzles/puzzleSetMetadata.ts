export type PuzzleSetMetadata = {
  eventName: string;
  eventDate: string;
  players: string[];
  whitePlayer: string;
  blackPlayer: string;
};

export type PuzzleSetMetadataRow = {
  puzzle_set_id?: unknown;
  puzzle_set?: unknown;
  puzzle_set_memberships?: unknown;
  white_player?: unknown;
  black_player?: unknown;
};

type PuzzleSetMetadataInput = {
  event?: unknown;
  eventName?: unknown;
  eventDate?: unknown;
  players?: unknown;
  whitePlayer?: unknown;
  blackPlayer?: unknown;
};

const ISO_PARTIAL_DATE = /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/;

export const normalizePuzzlePlayer = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const normalizePuzzlePlayers = (value: unknown): string[] => {
  const entries = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const players = new Set<string>();
  entries.forEach((entry) => {
    const player = normalizePuzzlePlayer(entry).toLocaleLowerCase();
    if (player) players.add(player);
  });
  return [...players].sort((left, right) => left.localeCompare(right));
};

export const normalizePuzzleEventDate = (value: unknown): string => {
  if (typeof value !== "string") return "";
  const normalized = value.trim().replaceAll(".", "-").replace(/-+$/, "");
  return ISO_PARTIAL_DATE.test(normalized) ? normalized : "";
};

export const normalizePuzzleSetMetadata = (value: PuzzleSetMetadataInput): PuzzleSetMetadata => {
  const whitePlayer = normalizePuzzlePlayer(value.whitePlayer);
  const blackPlayer = normalizePuzzlePlayer(value.blackPlayer);
  const suppliedPlayers = normalizePuzzlePlayers(value.players);
  const players = normalizePuzzlePlayers([
    ...suppliedPlayers,
    ...(whitePlayer ? [whitePlayer] : []),
    ...(blackPlayer ? [blackPlayer] : []),
  ]);

  return {
    eventName: normalizePuzzlePlayer(value.eventName) || normalizePuzzlePlayer(value.event),
    eventDate: normalizePuzzleEventDate(value.eventDate),
    players,
    whitePlayer,
    blackPlayer,
  };
};

const readPuzzleSetRelation = (value: unknown): Record<string, unknown> | null => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>) : null;
};

const readPuzzleSetMembershipRelations = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((membership) => {
    if (!membership || typeof membership !== "object") return [];
    const row = membership as Record<string, unknown>;
    const puzzleSet = readPuzzleSetRelation(row["puzzle_set"]);
    return puzzleSet ? [puzzleSet] : [];
  });
};

export const puzzleSetRelationsFromRow = (row: PuzzleSetMetadataRow): Record<string, unknown>[] => {
  const memberships = readPuzzleSetMembershipRelations(row.puzzle_set_memberships);
  const legacyRelation = readPuzzleSetRelation(row.puzzle_set);
  if (memberships.length > 0) {
    if (!legacyRelation) return memberships;
    const legacyId = String(legacyRelation["id"] ?? "");
    return [
      legacyRelation,
      ...memberships.filter((relation) => String(relation["id"] ?? "") !== legacyId),
    ];
  }
  if (legacyRelation) return [legacyRelation];

  const legacyId = String(row.puzzle_set_id ?? "").trim();
  return legacyId ? [{ id: legacyId }] : [];
};

export const puzzleSetMetadataFromRow = (
  row: PuzzleSetMetadataRow,
  puzzleSetId?: string | number,
): PuzzleSetMetadata => {
  const relations = puzzleSetRelationsFromRow(row);
  const requestedId = String(puzzleSetId ?? "");
  const puzzleSet =
    relations.find((relation) => String(relation["id"] ?? "") === requestedId) ?? relations[0];

  return normalizePuzzleSetMetadata({
    eventName: puzzleSet?.["event_name"],
    eventDate: puzzleSet?.["event_date"],
    players: puzzleSet?.["players"],
    whitePlayer: row.white_player,
    blackPlayer: row.black_player,
  });
};

export const getPuzzleSetKey = (value: PuzzleSetMetadata): string => {
  const metadata = normalizePuzzleSetMetadata(value);
  if (!metadata.eventName) return "";
  return encodeURIComponent(
    [metadata.eventName, metadata.eventDate, ...metadata.players]
      .filter(Boolean)
      .map((part) => part.toLocaleLowerCase())
      .join("|"),
  );
};

export const formatPuzzleSetDate = (value: string): string => {
  const normalized = normalizePuzzleEventDate(value);
  if (!normalized) return "";
  const [year = 0, month, day] = normalized.split("-").map(Number);
  if (!month) return String(year);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    ...(day ? { day: "numeric" as const } : {}),
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day || 1)));
};

export const formatPuzzleSetPlayers = (players: string[]): string => {
  const normalized = normalizePuzzlePlayers(players);
  if (normalized.length === 2) return `${normalized[0]} vs ${normalized[1]}`;
  return normalized.join(" · ");
};

export const buildLegacyPuzzleEvent = (value: PuzzleSetMetadata): string => {
  const metadata = normalizePuzzleSetMetadata(value);
  const date = formatPuzzleSetDate(metadata.eventDate);
  const players = formatPuzzleSetPlayers(metadata.players);
  return [metadata.eventName, date, players].filter(Boolean).join(": ");
};
