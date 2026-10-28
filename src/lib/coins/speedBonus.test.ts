import { describe, expect, it } from "vitest";

import { calculateCorrectAttemptSpeedBonus } from "./speedBonus";

describe("correct-attempt speed bonus", () => {
  it("stays at one coin through 5 seconds, then decays toward 0.2 until 30 seconds", () => {
    expect(calculateCorrectAttemptSpeedBonus(1, 0)).toBe(1);
    expect(calculateCorrectAttemptSpeedBonus(2, 5_000)).toBe(1);
    expect(calculateCorrectAttemptSpeedBonus(2, 5_001)).toBeLessThan(1);
    expect(calculateCorrectAttemptSpeedBonus(2, 10_000)).toBeCloseTo(0.725, 3);
    expect(calculateCorrectAttemptSpeedBonus(3, 29_999)).toBeCloseTo(0.2, 3);
    expect(calculateCorrectAttemptSpeedBonus(3, 30_000)).toBe(0);
    expect(calculateCorrectAttemptSpeedBonus(3, null)).toBe(0);
  });

  it("never applies to V4 or V5", () => {
    expect(calculateCorrectAttemptSpeedBonus(4, 0)).toBe(0);
    expect(calculateCorrectAttemptSpeedBonus(5, 10_000)).toBe(0);
  });
});
