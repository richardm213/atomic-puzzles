import { beforeEach, describe, expect, it } from "vitest";

import { getOrderedPuzzleIndexesForCustomSet, readLegacyCustomPuzzleSet } from "./customPuzzleSets";

describe("custom puzzle sets", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps pre-Supabase local sets readable", () => {
    window.localStorage.setItem(
      "atomic-puzzles.custom-puzzle-set.review",
      JSON.stringify({
        id: "review",
        label: "Missed puzzles",
        puzzleIds: [8, 4, 8, "invalid", 2],
        createdAt: "2026-08-08T00:00:00.000Z",
      }),
    );

    expect(readLegacyCustomPuzzleSet("review")).toMatchObject({
      label: "Missed puzzles",
      puzzleIds: [8, 4, 2],
      nextPuzzleId: 8,
    });
  });

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
        author: "",
        completedCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        nextPuzzleId: 8,
      },
    );

    expect(indexes).toEqual([2, 0, 1]);
  });
});
