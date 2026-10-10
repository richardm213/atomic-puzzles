import { describe, expect, it } from "vitest";

import { formatCoinAmount } from "./coinDisplay";
import { calculateCorrectAttemptSpeedBonus } from "./speedBonus";

describe("correct-attempt speed bonus", () => {
  it("decays from one coin toward 0.1 and stops at 30 seconds for V1–V3", () => {
    expect(calculateCorrectAttemptSpeedBonus(1, 0)).toBe(1);
    expect(calculateCorrectAttemptSpeedBonus(2, 10_000)).toBeCloseTo(0.464, 3);
    expect(calculateCorrectAttemptSpeedBonus(3, 29_999)).toBeCloseTo(0.1, 3);
    expect(calculateCorrectAttemptSpeedBonus(3, 30_000)).toBe(0);
    expect(calculateCorrectAttemptSpeedBonus(3, null)).toBe(0);
  });

  it("never applies to V4 or V5", () => {
    expect(calculateCorrectAttemptSpeedBonus(4, 0)).toBe(0);
    expect(calculateCorrectAttemptSpeedBonus(5, 10_000)).toBe(0);
  });

  it("matches the bonuses displayed on the earn coins page", () => {
    expect(
      [0, 5, 10, 15, 20, 25, 30].map((seconds) => {
        const bonus = calculateCorrectAttemptSpeedBonus(3, seconds * 1_000);
        return bonus === 0 ? "No bonus" : formatCoinAmount(bonus);
      }),
    ).toEqual(["+1", "+0.7", "+0.5", "+0.3", "+0.2", "+0.1", "No bonus"]);
  });
});
