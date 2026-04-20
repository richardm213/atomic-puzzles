const UNKNOWN_PUZZLE_EVENT_LABEL = "Unknown event";

export const normalizePuzzleEventName = (value) => {
  if (typeof value !== "string") return UNKNOWN_PUZZLE_EVENT_LABEL;

  const trimmed = value.trim();
  return trimmed || UNKNOWN_PUZZLE_EVENT_LABEL;
};

export const getPuzzleEventKey = (value) => {
  const normalizedEvent = normalizePuzzleEventName(value);

  if (normalizedEvent === UNKNOWN_PUZZLE_EVENT_LABEL) {
    return "unknown-event";
  }

  return encodeURIComponent(normalizedEvent.toLocaleLowerCase());
};

const sortGroups = (left, right) => {
  if (left.event === UNKNOWN_PUZZLE_EVENT_LABEL) return 1;
  if (right.event === UNKNOWN_PUZZLE_EVENT_LABEL) return -1;

  return left.event.localeCompare(right.event, undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

export const groupPuzzlesByEvent = (puzzles = []) => {
  const groups = new Map();

  puzzles.forEach((puzzle) => {
    const event = normalizePuzzleEventName(puzzle?.event);
    if (event === UNKNOWN_PUZZLE_EVENT_LABEL) return;

    const existingGroup = groups.get(event);

    if (existingGroup) {
      existingGroup.puzzles.push(puzzle);
      existingGroup.authors.add((puzzle?.author || "").trim() || "Unknown");
      return;
    }

    groups.set(event, {
      event,
      eventKey: getPuzzleEventKey(event),
      puzzles: [puzzle],
      authors: new Set([(puzzle?.author || "").trim() || "Unknown"]),
    });
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
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
