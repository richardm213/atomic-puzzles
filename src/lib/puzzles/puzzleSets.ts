import {
  formatPuzzleSetDate,
  formatPuzzleSetPlayers,
  puzzleSetMetadataFromRow,
} from "../../../shared/domain/puzzles/puzzleSetMetadata";
import type { Puzzle } from "./puzzleLibrary";

const UNKNOWN_PUZZLE_EVENT_LABEL = "Unknown event";

export type PuzzleEventGroup = {
  setId: number;
  event: string;
  eventName: string;
  eventDate: string;
  players: string[];
  sourceId: string;
  eventKey: string;
  puzzles: Puzzle[];
  authors: string[];
};

export const normalizePuzzleEventName = (value: unknown): string => {
  if (typeof value !== "string") return UNKNOWN_PUZZLE_EVENT_LABEL;

  const trimmed = value.trim();
  return trimmed || UNKNOWN_PUZZLE_EVENT_LABEL;
};

export const getPuzzleEventName = (puzzle: Puzzle): string =>
  normalizePuzzleEventName(puzzleSetMetadataFromRow(puzzle).eventName);

export const isAwcPuzzleEvent = (value: unknown): boolean => {
  const normalized = normalizePuzzleEventName(value).toLocaleLowerCase();
  return normalized === "awc" || normalized.startsWith("awc ") || normalized.includes("atomic wc");
};

export const getPuzzleEventKey = (value: string): string => {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) ? normalized : "";
};

export const getPuzzleSetDisplayName = (puzzle: Puzzle): string => {
  const metadata = puzzleSetMetadataFromRow(puzzle);
  const name = normalizePuzzleEventName(metadata.eventName);
  if (name === UNKNOWN_PUZZLE_EVENT_LABEL) return name;
  const date = isAwcPuzzleEvent(name) ? "" : formatPuzzleSetDate(metadata.eventDate);
  return [name, date, formatPuzzleSetPlayers(metadata.players)].filter(Boolean).join(" · ");
};

export const isEndgamePuzzleEvent = (value: unknown): boolean =>
  normalizePuzzleEventName(value).toLocaleLowerCase().includes("endgame");

export const getOrderedPuzzleIndexesForEvent = (
  puzzles: Puzzle[] = [],
  eventNameOrKey: string,
): number[] => {
  if (!eventNameOrKey) return [];

  let decodedSetId = eventNameOrKey;
  try {
    decodedSetId = decodeURIComponent(eventNameOrKey);
  } catch {
    // Keep the original value when it is not URI encoded.
  }
  const requestedSetId = getPuzzleEventKey(decodedSetId);
  if (!requestedSetId) return [];

  return puzzles
    .map((puzzle, index) => ({ puzzle, index }))
    .filter(({ puzzle }) => String(puzzle.puzzle_set_id ?? "") === requestedSetId)
    .sort(({ puzzle: left }, { puzzle: right }) => left.puzzleId - right.puzzleId)
    .map(({ index }) => index);
};

const sortGroups = (left: PuzzleEventGroup, right: PuzzleEventGroup): number => {
  if (left.eventName === UNKNOWN_PUZZLE_EVENT_LABEL) return 1;
  if (right.eventName === UNKNOWN_PUZZLE_EVENT_LABEL) return -1;

  const leftIsAwc = isAwcPuzzleEvent(left.eventName);
  const rightIsAwc = isAwcPuzzleEvent(right.eventName);
  if (leftIsAwc !== rightIsAwc) return leftIsAwc ? -1 : 1;

  const byName = left.eventName.localeCompare(right.eventName, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (byName !== 0) return byName;
  return right.eventDate.localeCompare(left.eventDate);
};

type PuzzleGroupBuilder = Omit<PuzzleEventGroup, "authors"> & { authors: Set<string> };

const knownPuzzleSetSourceIds: Readonly<Record<number, string>> = {
  1: "tiPlLQEE",
  2: "fIJoCI7j",
  3: "cna1BteU",
  10: "Yr9V8s5R",
  11: "5xtZlERw",
  12: "OqWE65nu",
  13: "tUvUftLZ",
  14: "IJL3lXpE",
  15: "75L7QLTy",
  16: "CYLH7bBT",
  18: "irgn69Ce",
  19: "3OG5r1jh",
  31: "UhIDR1jR",
  32: "sHD4NH5z",
  33: "K2GJJJnb",
  37: "s1XjJvZ8",
};

const getPuzzleSetSourceId = (puzzle: Puzzle): string => {
  const relation = Array.isArray(puzzle.puzzle_set) ? puzzle.puzzle_set[0] : puzzle.puzzle_set;
  const storedSourceId = String(relation?.source_id ?? "").trim();
  if (storedSourceId) return storedSourceId;

  const setId = Number.parseInt(String(puzzle.puzzle_set_id ?? relation?.id ?? ""), 10);
  return knownPuzzleSetSourceIds[setId] ?? "";
};

export const groupPuzzlesByEvent = (puzzles: Puzzle[] = []): PuzzleEventGroup[] => {
  const groups = new Map<string, PuzzleGroupBuilder>();

  puzzles.forEach((puzzle) => {
    const setId = Number.parseInt(String(puzzle.puzzle_set_id ?? ""), 10);
    if (!Number.isSafeInteger(setId) || setId <= 0) return;

    const metadata = puzzleSetMetadataFromRow(puzzle);
    const eventName = normalizePuzzleEventName(metadata.eventName);
    if (eventName === UNKNOWN_PUZZLE_EVENT_LABEL) return;

    const eventKey = String(setId);
    const author = String(puzzle.author ?? "").trim() || "Unknown";
    const existingGroup = groups.get(eventKey);

    if (existingGroup) {
      existingGroup.puzzles.push(puzzle);
      existingGroup.authors.add(author);
      return;
    }

    groups.set(eventKey, {
      setId,
      event: getPuzzleSetDisplayName(puzzle),
      eventName,
      eventDate: metadata.eventDate,
      players: metadata.players,
      sourceId: getPuzzleSetSourceId(puzzle),
      eventKey,
      puzzles: [puzzle],
      authors: new Set([author]),
    });
  });

  return [...groups.values()]
    .map((group): PuzzleEventGroup => ({
      ...group,
      puzzles: [...group.puzzles].sort((left, right) => left.puzzleId - right.puzzleId),
      authors: [...group.authors].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      ),
    }))
    .sort(sortGroups);
};

export { UNKNOWN_PUZZLE_EVENT_LABEL };
