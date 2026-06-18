import { describe, expect, it } from "vitest";

import { getOpeningDisplayLabel, normalizeOpeningKey } from "./openings";

describe("opening display labels", () => {
  it("displays the two-knight shorthand with an uppercase N", () => {
    expect(getOpeningDisplayLabel("2n")).toBe("2N");
    expect(getOpeningDisplayLabel(" 2N h3 ")).toBe("2N h3");
  });

  it("displays knight openings with uppercase piece notation", () => {
    expect(getOpeningDisplayLabel("nh3")).toBe("Nh3");
    expect(getOpeningDisplayLabel("na3")).toBe("Na3");
    expect(getOpeningDisplayLabel("e3 nc3")).toBe("e3 Nc3");
    expect(getOpeningDisplayLabel("nh3 na3")).toBe("Nh3 Na3");
  });

  it("displays pawn-only openings as coordinates", () => {
    expect(getOpeningDisplayLabel("e3 f4")).toBe("e3 f4");
  });

  it("normalizes opening keys for filtering without changing stored values", () => {
    expect(normalizeOpeningKey(" 2N h3 ")).toBe("2n h3");
  });
});
