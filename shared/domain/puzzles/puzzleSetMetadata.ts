export type PuzzleSetMetadata = {
  eventName: string;
  eventDate: string;
  players: string[];
  whitePlayer: string;
  blackPlayer: string;
};

export type PuzzleSetMetadataRow = {
  puzzle_set?: unknown;
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

export const puzzleSetMetadataFromRow = (row: PuzzleSetMetadataRow): PuzzleSetMetadata => {
  const puzzleSet = readPuzzleSetRelation(row.puzzle_set);

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
  const [year = 0, month] = normalized.split("-").map(Number);
  if (!month) return String(year);
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return `${monthLabel} ${year}`;
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
