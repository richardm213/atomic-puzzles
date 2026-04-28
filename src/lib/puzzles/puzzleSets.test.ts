import { describe, expect, it } from "vitest";
import {
  UNKNOWN_PUZZLE_EVENT_LABEL,
  groupPuzzlesByEvent,
  normalizePuzzleEventName,
} from "./puzzleSets";
import type { Puzzle } from "./puzzleLibrary";

const makePuzzle = (overrides: Partial<Puzzle>): Puzzle =>
  ({
    fen: "fen",
    solution: "1. e4",
    puzzleId: 1,
    ...overrides,
  }) as Puzzle;

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

describe("groupPuzzlesByEvent", () => {
  it("groups puzzles by event and sorts by id within a group", () => {
    const puzzles = [
      makePuzzle({ puzzleId: 3, event: "ACL 2024", author: "alice" }),
      makePuzzle({ puzzleId: 1, event: "ACL 2024", author: "bob" }),
      makePuzzle({ puzzleId: 2, event: "AWC 2025", author: "carol" }),
    ];

    const groups = groupPuzzlesByEvent(puzzles);

    expect(groups).toHaveLength(2);
    const acl = groups.find((g) => g.event === "ACL 2024");
    expect(acl?.puzzles.map((p) => p.puzzleId)).toEqual([1, 3]);
    expect(acl?.authors.sort()).toEqual(["alice", "bob"]);
    expect(acl?.eventKey).toBe(encodeURIComponent("acl 2024"));
  });

  it("uses 'Unknown' for puzzles missing an author", () => {
    const groups = groupPuzzlesByEvent([
      makePuzzle({ puzzleId: 1, event: "ACL 2024" }),
    ]);
    expect(groups[0]?.authors).toEqual(["Unknown"]);
  });

  it("excludes puzzles without an event from the result", () => {
    const groups = groupPuzzlesByEvent([
      makePuzzle({ puzzleId: 1 }),
      makePuzzle({ puzzleId: 2, event: "ACL 2024" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.event).toBe("ACL 2024");
  });

  it("handles empty input", () => {
    expect(groupPuzzlesByEvent([])).toEqual([]);
  });
});
