import { describe, expect, it } from "vitest";

import { puzzleRatingFromRow } from "./puzzleRating";

describe("puzzleRatingFromRow", () => {
  it("keeps a human V label while showing the attempt-adjusted rating", () => {
    expect(
      puzzleRatingFromRow({
        rating_state: {
          rating: 2641,
          rating_deviation: 68,
          attempts: 9,
          successes: 3,
          computed_level: 5,
          human_level: 5,
          updated_at: "2026-09-29T00:00:00.000Z",
        },
      }),
    ).toMatchObject({
      level: 5,
      rating: 2641,
      ratingDeviation: 68,
      attempts: 9,
      successes: 3,
      source: "human",
    });
  });
});
