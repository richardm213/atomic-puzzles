import type { Puzzle } from "./puzzleLibrary";

const UNKNOWN_PUZZLE_EVENT_LABEL = "Unknown event";

export type PuzzleEventGroup = {
  event: string;
  eventKey: string;
  puzzles: Puzzle[];
  authors: string[];
};

export const normalizePuzzleEventName = (value: unknown): string => {
  if (typeof value !== "string") return UNKNOWN_PUZZLE_EVENT_LABEL;

  const trimmed = value.trim();
  return trimmed || UNKNOWN_PUZZLE_EVENT_LABEL;
};

const getPuzzleEventKey = (value: string): string => {
  const normalizedEvent = normalizePuzzleEventName(value);

  if (normalizedEvent === UNKNOWN_PUZZLE_EVENT_LABEL) {
    return "unknown-event";
  }

  return encodeURIComponent(normalizedEvent.toLocaleLowerCase());
};

const sortGroups = (left: PuzzleEventGroup, right: PuzzleEventGroup): number => {
  if (left.event === UNKNOWN_PUZZLE_EVENT_LABEL) return 1;
  if (right.event === UNKNOWN_PUZZLE_EVENT_LABEL) return -1;

  return left.event.localeCompare(right.event, undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

type PuzzleGroupBuilder = {
  event: string;
  eventKey: string;
  puzzles: Puzzle[];
  authors: Set<string>;
};

export const groupPuzzlesByEvent = (puzzles: Puzzle[] = []): PuzzleEventGroup[] => {
  const groups = new Map<string, PuzzleGroupBuilder>();

  puzzles.forEach((puzzle) => {
    const event = normalizePuzzleEventName(puzzle?.["event"]);
    if (event === UNKNOWN_PUZZLE_EVENT_LABEL) return;

    const author = String(puzzle?.["author"] ?? "").trim() || "Unknown";
    const existingGroup = groups.get(event);

    if (existingGroup) {
      existingGroup.puzzles.push(puzzle);
      existingGroup.authors.add(author);
      return;
    }

    groups.set(event, {
      event,
      eventKey: getPuzzleEventKey(event),
      puzzles: [puzzle],
      authors: new Set([author]),
    });
  });

  return [...groups.values()]
    .map((group): PuzzleEventGroup => ({
      event: group.event,
      eventKey: group.eventKey,
      puzzles: [...group.puzzles].sort((left, right) => {
        const leftId = Number(left?.puzzleId ?? 0);
        const rightId = Number(right?.puzzleId ?? 0);
        return leftId - rightId;
      }),
      authors: [...group.authors].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      ),
    }))
    .sort(sortGroups);
};

export { UNKNOWN_PUZZLE_EVENT_LABEL };
