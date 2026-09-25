import { describe, expect, it } from "vitest";

import type { PuzzleEventGroup } from "../../lib/puzzles/puzzleSets";
import { getFeaturedPuzzleSetRank, matchesEventFilter, orderPuzzleSetGroups } from "./PuzzleSets";

const makeGroup = (
  eventName: string,
  eventDate: string,
  players: string[],
  setId: number,
): PuzzleEventGroup => ({ eventName, eventDate, players, setId }) as PuzzleEventGroup;

describe("puzzle set category filters", () => {
  it("separates Blitz, Wolfarena, WolframRandom, and Endgames", () => {
    expect(matchesEventFilter({ eventName: "Blitz 10-game match" }, "blitz")).toBe(true);
    expect(matchesEventFilter({ eventName: "Wolfarena" }, "wolfarena")).toBe(true);
    expect(matchesEventFilter({ eventName: "Wolfarena" }, "wolfrandom")).toBe(false);
    expect(matchesEventFilter({ eventName: "Wolfrandom" }, "wolfrandom")).toBe(true);
    expect(matchesEventFilter({ eventName: "Tipau Endgames" }, "endgames")).toBe(true);
  });

  it("keeps the requested featured sets in their curated order", () => {
    const groups = [
      makeGroup("Wolfrandom", "2026-09", ["quasabianth", "rabbier"], 37),
      makeGroup("AWC 2018 Finals", "2018-11", ["onubense", "tipau"], 10),
      makeGroup("Tipau Endgames", "", [], 29),
      makeGroup("Blitz 6-game match", "2026-09", ["maxwellssilvrhammer", "wolfram_ep"], 18),
      makeGroup("Blitz 10-game match", "2026-09", ["rechesster", "wolfram_ep"], 19),
    ];

    expect(groups.map(getFeaturedPuzzleSetRank)).toEqual([0, 1, 2, 3, 4]);
    expect(orderPuzzleSetGroups([...groups].reverse(), 123).map((group) => group.setId)).toEqual([
      37, 10, 29, 18, 19,
    ]);
  });

  it("keeps the remaining sets stable for a page seed and varies them across seeds", () => {
    const groups = [
      makeGroup("ACL", "2025-01", [], 1),
      makeGroup("AWC 2024 Round 1", "2024-01", [], 2),
      makeGroup("960", "2023-01", [], 3),
      makeGroup("Wolfarena", "2026-01", [], 4),
      makeGroup("Blitz match", "2026-01", [], 5),
    ];

    const orderForSeed = (seed: number) =>
      orderPuzzleSetGroups(groups, seed).map((group) => group.setId);

    expect(orderForSeed(123)).toEqual(orderForSeed(123));
    expect(orderForSeed(123)).not.toEqual(orderForSeed(456));
  });
});
