import { describe, expect, it } from "vitest";

import { getOpeningDisplayLabel, normalizeOpeningKey } from "./openings";

describe("opening display labels", () => {
  it("displays the two-knight shorthand with an uppercase N", () => {
    expect(getOpeningDisplayLabel("2n")).toBe("2N");
    expect(getOpeningDisplayLabel(" 2N h3 ")).toBe("2N h3");
  });

  it("normalizes opening keys for filtering without changing stored values", () => {
    expect(normalizeOpeningKey(" 2N h3 ")).toBe("2n h3");
  });
});
