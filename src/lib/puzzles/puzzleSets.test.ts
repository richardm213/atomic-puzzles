import { describe, expect, it } from "vitest";

import { formatPuzzleSetDate } from "../../../shared/domain/puzzles/puzzleSetMetadata";
import type { Puzzle } from "./puzzleLibrary";
import {
  getOrderedPuzzleIndexesForEvent,
  groupPuzzlesByEvent,
  isEndgamePuzzleEvent,
  normalizePuzzleEventName,
  UNKNOWN_PUZZLE_EVENT_LABEL,
} from "./puzzleSets";

const makePuzzle = (overrides: Partial<Puzzle>): Puzzle =>
  ({
    fen: "fen",
    solution: "1. e4",
    puzzleId: 1,
    ...overrides,
  }) as Puzzle;

const makeSet = (
  id: number,
  eventName: string,
  eventDate = "",
  players: string[] = [],
  sourceId: string | null = null,
) => ({ id, event_name: eventName, event_date: eventDate, players, source_id: sourceId });

describe("normalizePuzzleEventName", () => {
  it("trims whitespace", () => {
    expect(normalizePuzzleEventName("  ACL 2024  ")).toBe("ACL 2024");
  });

  it("returns the unknown label for non-strings or empty strings", () => {
    expect(normalizePuzzleEventName(null)).toBe(UNKNOWN_PUZZLE_EVENT_LABEL);
    expect(normalizePuzzleEventName("")).toBe(UNKNOWN_PUZZLE_EVENT_LABEL);
    expect(normalizePuzzleEventName(undefined)).toBe(UNKNOWN_PUZZLE_EVENT_LABEL);
  });
});

describe("formatPuzzleSetDate", () => {
  it("shows month and year without day-level precision", () => {
    expect(formatPuzzleSetDate("2026-03-26")).toBe("Mar 2026");
    expect(formatPuzzleSetDate("2026-03")).toBe("Mar 2026");
  });
});

describe("isEndgamePuzzleEvent", () => {
  it("recognizes endgame sets without depending on capitalization", () => {
    expect(isEndgamePuzzleEvent("Tipau Endgames")).toBe(true);
    expect(isEndgamePuzzleEvent("ATOMIC ENDGAME STUDIES")).toBe(true);
  });

  it("does not classify regular event sets as endgames", () => {
    expect(isEndgamePuzzleEvent("AWC 2025: Wolfram vs Randoom")).toBe(false);
    expect(isEndgamePuzzleEvent(null)).toBe(false);
  });
});

describe("groupPuzzlesByEvent", () => {
  it("groups puzzles by event and sorts by id within a group", () => {
    const puzzles = [
      makePuzzle({
        puzzleId: 3,
        puzzle_set_id: 10,
        puzzle_set: makeSet(10, "ACL"),
        author: "alice",
      }),
      makePuzzle({ puzzleId: 1, puzzle_set_id: 10, puzzle_set: makeSet(10, "ACL"), author: "bob" }),
      makePuzzle({
        puzzleId: 2,
        puzzle_set_id: 20,
        puzzle_set: makeSet(20, "AWC"),
        author: "carol",
      }),
    ];

    const groups = groupPuzzlesByEvent(puzzles);

    expect(groups).toHaveLength(2);
    const acl = groups.find((g) => g.event === "ACL");
    expect(acl?.puzzles.map((p) => p.puzzleId)).toEqual([1, 3]);
    expect(acl?.authors.sort()).toEqual(["alice", "bob"]);
    expect(acl?.eventKey).toBe("10");
    expect(groups[0]?.eventName).toBe("AWC");
  });

  it("uses 'Unknown' for puzzles missing an author", () => {
    const groups = groupPuzzlesByEvent([
      makePuzzle({ puzzleId: 1, puzzle_set_id: 10, puzzle_set: makeSet(10, "ACL") }),
    ]);
    expect(groups[0]?.authors).toEqual(["Unknown"]);
  });

  it("excludes puzzles without an event from the result", () => {
    const groups = groupPuzzlesByEvent([
      makePuzzle({ puzzleId: 1 }),
      makePuzzle({ puzzleId: 2, puzzle_set_id: 10, puzzle_set: makeSet(10, "ACL") }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.event).toBe("ACL");
  });

  it("handles empty input", () => {
    expect(groupPuzzlesByEvent([])).toEqual([]);
  });

  it("groups spelling variants by structured event metadata", () => {
    const puzzles = [
      makePuzzle({
        puzzleId: 1,
        puzzle_set_id: 30,
        puzzle_set: makeSet(30, "Wolfrandom", "2026-07", ["Alice", "Bob"]),
      }),
      makePuzzle({
        puzzleId: 2,
        puzzle_set_id: 30,
        puzzle_set: makeSet(30, "Wolfrandom", "2026-07", ["Bob", "Alice"]),
      }),
    ];

    const groups = groupPuzzlesByEvent(puzzles);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      eventName: "Wolfrandom",
      eventDate: "2026-07",
      players: ["alice", "bob"],
    });
  });

  it("exposes the set source match id", () => {
    const [group] = groupPuzzlesByEvent([
      makePuzzle({
        puzzleId: 1,
        puzzle_set_id: 20,
        puzzle_set: makeSet(20, "AWC", "2025", ["Max", "Sircachetes"], "IJL3lXpE"),
      }),
    ]);

    expect(group?.sourceId).toBe("IJL3lXpE");
  });

  it("does not repeat a separate date in an AWC display name", () => {
    const [group] = groupPuzzlesByEvent([
      makePuzzle({
        puzzleId: 1,
        puzzle_set_id: 14,
        puzzle_set: makeSet(14, "AWC 2025 Round of 32", "2025-09", ["Max", "Sircachetes"]),
      }),
    ]);

    expect(group?.event).toBe("AWC 2025 Round of 32 · max vs sircachetes");
  });

  it("keeps the losers bracket and round in an AWC display name", () => {
    const [group] = groupPuzzlesByEvent([
      makePuzzle({
        puzzleId: 1,
        puzzle_set_id: 12,
        puzzle_set: makeSet(
          12,
          "AWC 2023 Losers Round 3",
          "2023-11",
          ["Jsf", "Lesha"],
          "OqWE65nu",
        ),
      }),
    ]);

    expect(group?.event).toBe("AWC 2023 Losers Round 3 · jsf vs lesha");
  });

  it("labels known blitz matches while leaving Paper-skies unlinked", () => {
    const groups = groupPuzzlesByEvent([
      makePuzzle({
        puzzleId: 1,
        puzzle_set_id: 16,
        puzzle_set: makeSet(16, "Blitz 8-game match", "2026-03", ["Opabinia", "Rechesster"]),
      }),
      makePuzzle({
        puzzleId: 2,
        puzzle_set_id: 17,
        puzzle_set: makeSet(17, "Blitz match", "2026-04", ["Paper-skies", "Rechesster"]),
      }),
    ]);

    expect(groups.find((group) => group.setId === 16)?.sourceId).toBe("CYLH7bBT");
    expect(groups.find((group) => group.setId === 16)?.event).toBe(
      "Blitz 8-game match · Mar 2026 · opabinia vs rechesster",
    );
    expect(groups.find((group) => group.setId === 17)?.sourceId).toBe("");
  });
});

describe("getOrderedPuzzleIndexesForEvent", () => {
  it("returns every puzzle in the selected event in puzzle-id order", () => {
    const puzzles = [
      makePuzzle({ puzzleId: 8, puzzle_set_id: 10, puzzle_set: makeSet(10, "ACL") }),
      makePuzzle({ puzzleId: 2, puzzle_set_id: 20, puzzle_set: makeSet(20, "AWC") }),
      makePuzzle({ puzzleId: 3, puzzle_set_id: 10, puzzle_set: makeSet(10, "ACL") }),
    ];

    expect(getOrderedPuzzleIndexesForEvent(puzzles, "10")).toEqual([2, 0]);
  });

  it("returns an empty list for an unknown event", () => {
    expect(
      getOrderedPuzzleIndexesForEvent(
        [makePuzzle({ puzzleId: 1, puzzle_set_id: 10, puzzle_set: makeSet(10, "ACL") })],
        "missing",
      ),
    ).toEqual([]);
  });

  it("finds a structured set by its generated key", () => {
    const puzzles = [
      makePuzzle({
        puzzleId: 8,
        puzzle_set_id: 20,
        puzzle_set: makeSet(20, "AWC", "2025", ["Max", "Sircachetes"]),
      }),
      makePuzzle({ puzzleId: 2, puzzle_set_id: 30, puzzle_set: makeSet(30, "Other") }),
    ];
    const group = groupPuzzlesByEvent(puzzles).find((candidate) => candidate.eventName === "AWC");
    expect(group).toBeDefined();
    expect(getOrderedPuzzleIndexesForEvent(puzzles, group!.eventKey)).toEqual([0]);
  });
});
