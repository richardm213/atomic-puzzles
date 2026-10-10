import { describe, expect, it } from "vitest";

import {
  displayedCoinBalance,
  displayedCoinDeduction,
  formatCoinAmount,
  formatCoinBalance,
} from "./coinDisplay";

describe("coin display", () => {
  it("shows balances as whole coins and deductions to the nearest tenth", () => {
    expect(displayedCoinBalance(1234.99)).toBe(1234);
    expect(displayedCoinBalance(Number.NaN)).toBe(0);
    expect(displayedCoinDeduction(-1.26)).toBe(-1.3);
    expect(displayedCoinDeduction(-0.04)).toBe(0);
    expect(formatCoinBalance(1234.99)).toBe("1,234");
    expect(formatCoinAmount(1.6)).toBe("+1.6");
    expect(formatCoinAmount(-1.26)).toBe("-1.3");
  });
});
