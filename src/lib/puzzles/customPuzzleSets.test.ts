import { describe, expect, it } from "vitest";

import { getOrderedPuzzleIndexesForCustomSet } from "./customPuzzleSets";

describe("custom puzzle sets", () => {
  it("maps saved ids to catalog indexes while preserving the saved order", () => {
    const indexes = getOrderedPuzzleIndexesForCustomSet(
      [{ puzzleId: 2 }, { puzzleId: 4 }, { puzzleId: 8 }],
      {
        id: "review",
        label: "Review",
        puzzleIds: [8, 2, 99, 4],
        createdAt: "2026-08-08T00:00:00.000Z",
        updatedAt: "2026-08-08T00:00:00.000Z",
        tags: [],
        untaggedOnly: false,
        authors: [],
        resultFilter: "all",
        completedCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        nextPuzzleId: 8,
      },
    );

    expect(indexes).toEqual([2, 0, 1]);
  });
});
