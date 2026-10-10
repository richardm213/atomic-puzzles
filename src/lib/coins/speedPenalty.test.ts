import { describe, expect, it } from "vitest";

import { formatCoinAmount } from "./coinDisplay";
import { calculateIncorrectAttemptSpeedPenalty } from "./speedPenalty";

describe("incorrect-attempt speed penalty", () => {
  it("decays from three coins toward 0.2 and stops at 30 seconds", () => {
    expect(calculateIncorrectAttemptSpeedPenalty(0)).toBe(3);
    expect(calculateIncorrectAttemptSpeedPenalty(10_000)).toBeCloseTo(1.216, 3);
    expect(calculateIncorrectAttemptSpeedPenalty(29_999)).toBeCloseTo(0.2, 3);
    expect(calculateIncorrectAttemptSpeedPenalty(30_000)).toBe(0);
    expect(calculateIncorrectAttemptSpeedPenalty(null)).toBe(0);
  });

  it("matches the deductions displayed on the earn coins page", () => {
    expect(
      [0, 5, 10, 15, 20, 25, 30].map((seconds) => {
        const penalty = calculateIncorrectAttemptSpeedPenalty(seconds * 1_000);
        return penalty === 0 ? "No deduction" : formatCoinAmount(-penalty);
      }),
    ).toEqual(["-3", "-1.9", "-1.2", "-0.8", "-0.5", "-0.3", "No deduction"]);
  });
});
