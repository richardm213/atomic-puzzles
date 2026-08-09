import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCustomPuzzleSet,
  getOrderedPuzzleIndexesForCustomSet,
  readCustomPuzzleSet,
} from "./customPuzzleSets";

describe("custom puzzle sets", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("persists a unique, normalized list of puzzle ids", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.123456);

    const customSet = createCustomPuzzleSet(["8", 4, 8, "invalid", 2], "Missed puzzles");

    expect(customSet?.puzzleIds).toEqual([8, 4, 2]);
    expect(customSet?.label).toBe("Missed puzzles");
    expect(readCustomPuzzleSet(customSet?.id ?? "")).toEqual(customSet);
  });

  it("maps saved ids to catalog indexes while preserving the saved order", () => {
    const indexes = getOrderedPuzzleIndexesForCustomSet(
      [{ puzzleId: 2 }, { puzzleId: 4 }, { puzzleId: 8 }],
      {
        id: "review",
        label: "Review",
        puzzleIds: [8, 2, 99, 4],
        createdAt: "2026-08-08T00:00:00.000Z",
      },
    );

    expect(indexes).toEqual([2, 0, 1]);
  });
});
