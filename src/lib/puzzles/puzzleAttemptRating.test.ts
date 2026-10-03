import { describe, expect, it } from "vitest";

import { getPuzzleUnratedReason } from "./puzzleAttemptRating";

describe("getPuzzleUnratedReason", () => {
  it("uses a calendar month and clamps end-of-month dates", () => {
    const input = {
      username: "Creator",
      author: "creator",
      createdAt: "2028-01-31T12:00:00.000Z",
      hasUnratedAttempt: false,
    };

    expect(getPuzzleUnratedReason({ ...input, now: new Date("2028-02-29T11:59:59.999Z") })).toBe(
      "creator-window",
    );
    expect(
      getPuzzleUnratedReason({ ...input, now: new Date("2028-02-29T12:00:00.000Z") }),
    ).toBeNull();
  });

  it("keeps a recorded unrated attempt labeled after the publication window", () => {
    expect(
      getPuzzleUnratedReason({
        username: "creator",
        author: "creator",
        createdAt: "2026-01-01T00:00:00.000Z",
        hasUnratedAttempt: true,
        now: new Date("2026-06-01T00:00:00.000Z"),
      }),
    ).toBe("existing-unrated");
  });

  it("does not label another author's puzzle during its publication window", () => {
    expect(
      getPuzzleUnratedReason({
        username: "solver",
        author: "creator",
        createdAt: "2026-10-01T00:00:00.000Z",
        hasUnratedAttempt: false,
        now: new Date("2026-10-02T00:00:00.000Z"),
      }),
    ).toBeNull();
  });
});
