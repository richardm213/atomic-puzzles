import { describe, expect, it } from "vitest";

import { calculateIncorrectAttemptSpeedPenalty } from "./speedPenalty";

describe("incorrect-attempt speed penalty", () => {
  it("stays at three coins through 3 seconds, then decays toward 0.5 until 30 seconds", () => {
    expect(calculateIncorrectAttemptSpeedPenalty(0)).toBe(3);
    expect(calculateIncorrectAttemptSpeedPenalty(3_000)).toBe(3);
    expect(calculateIncorrectAttemptSpeedPenalty(3_001)).toBeLessThan(3);
    expect(calculateIncorrectAttemptSpeedPenalty(10_000)).toBeCloseTo(1.885, 3);
    expect(calculateIncorrectAttemptSpeedPenalty(29_999)).toBeCloseTo(0.5, 3);
    expect(calculateIncorrectAttemptSpeedPenalty(30_000)).toBe(0);
    expect(calculateIncorrectAttemptSpeedPenalty(null)).toBe(0);
  });
});
