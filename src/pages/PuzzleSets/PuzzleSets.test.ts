import { describe, expect, it } from "vitest";

import type { PuzzleEventGroup } from "../../lib/puzzles/puzzleSets";
import {
  getPuzzleSetYear,
  hasChessMoveInPuzzleSetName,
  matchesEventFilter,
  orderPuzzleSetGroups,
} from "./PuzzleSets";

const makeGroup = (
  eventName: string,
  eventDate: string,
  players: string[],
  setId: number,
): PuzzleEventGroup => ({ eventName, eventDate, players, setId }) as PuzzleEventGroup;

describe("puzzle set category filters", () => {
  it("separates Blitz, Wolfarena, WolframRandom, and Endgames", () => {
    expect(matchesEventFilter({ eventName: "3+2 match" }, "blitz")).toBe(true);
    expect(matchesEventFilter({ eventName: "Wolfarena" }, "wolfarena")).toBe(true);
    expect(matchesEventFilter({ eventName: "Wolfarena" }, "wolfrandom")).toBe(false);
    expect(matchesEventFilter({ eventName: "Wolfrandom" }, "wolfrandom")).toBe(true);
    expect(matchesEventFilter({ eventName: "Tipau Endgames" }, "endgames")).toBe(true);
    expect(matchesEventFilter({ eventName: "Nh3 d4 Qd3 tricks" }, "openings")).toBe(true);
  });

  it("puts only sets outside the named categories in Misc", () => {
    expect(matchesEventFilter({ eventName: "Atomic Marathon" }, "misc")).toBe(true);
    expect(matchesEventFilter({ eventName: "960 Swiss" }, "misc")).toBe(false);
    expect(matchesEventFilter({ eventName: "Nh3 d4 Qd3 tricks" }, "misc")).toBe(false);
  });

  it("uses the event date or a named tournament year without guessing for undated sets", () => {
    expect(getPuzzleSetYear({ eventName: "Wolfarena", eventDate: "2026-09" })).toBe("2026");
    expect(getPuzzleSetYear({ eventName: "AWC 2018 Finals", eventDate: "" })).toBe("2018");
    expect(getPuzzleSetYear({ eventName: "960 Swiss", eventDate: "" })).toBe("");
  });

  it("recognizes SAN move tokens in opening set names without matching ordinary labels", () => {
    expect(hasChessMoveInPuzzleSetName("Nh3 d4 Qd3 tricks")).toBe(true);
    expect(hasChessMoveInPuzzleSetName("1. e4 e5")).toBe(true);
    expect(hasChessMoveInPuzzleSetName("Bxh7+ ideas")).toBe(true);
    expect(hasChessMoveInPuzzleSetName("O-O attacks")).toBe(true);
    expect(hasChessMoveInPuzzleSetName("AWC 2026")).toBe(false);
    expect(hasChessMoveInPuzzleSetName("3+2 match")).toBe(false);
    expect(hasChessMoveInPuzzleSetName("Tipau Endgames")).toBe(false);
  });

  it("keeps the remaining sets stable for a page seed and varies them across seeds", () => {
    const groups = [
      makeGroup("ACL", "2025-01", [], 1),
      makeGroup("AWC 2024 Round 1", "2024-01", [], 2),
      makeGroup("960", "2023-01", [], 3),
      makeGroup("Wolfarena", "2026-01", [], 4),
      makeGroup("3+2 match", "2026-01", [], 5),
    ];

    const orderForSeed = (seed: number) =>
      orderPuzzleSetGroups(groups, seed).map((group) => group.setId);

    expect(orderForSeed(123)).toEqual(orderForSeed(123));
    expect(orderForSeed(123)).not.toEqual(orderForSeed(456));
  });
});
