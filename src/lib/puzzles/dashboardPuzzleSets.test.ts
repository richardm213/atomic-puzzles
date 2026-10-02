import { beforeEach, describe, expect, it } from "vitest";

import {
  createDashboardPuzzleSet,
  getOrderedPuzzleIndexesForDashboardSet,
  readDashboardPuzzleSet,
} from "./dashboardPuzzleSets";

describe("dashboard puzzle sets", () => {
  beforeEach(() => window.localStorage.clear());

  it("preserves the dashboard order while removing duplicate and invalid puzzle ids", () => {
    const set = createDashboardPuzzleSet([8, "2", 8, "invalid", -1, 4], "player");

    expect(set?.puzzleIds).toEqual([8, 2, 4]);
    expect(readDashboardPuzzleSet(set?.id ?? "")?.puzzleIds).toEqual([8, 2, 4]);
    expect(
      getOrderedPuzzleIndexesForDashboardSet(
        [{ puzzleId: 2 }, { puzzleId: 4 }, { puzzleId: 8 }],
        set,
      ),
    ).toEqual([2, 0, 1]);
  });
});
