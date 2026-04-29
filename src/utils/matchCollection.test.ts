import { describe, expect, it } from "vitest";

import { getTimeControlOptions } from "./matchCollection";

describe("getTimeControlOptions", () => {
  it("collects unique initial+increment values across matches, sorted numerically", () => {
    const result = getTimeControlOptions([
      { timeControl: "60+0" },
      { timeControl: "180+0" },
      { timeControl: "60+1" },
      { timeControl: "60+0" }, // duplicate
    ]);

    expect(result.initialOptions).toEqual(["60", "180"]);
    expect(result.incrementOptions).toEqual(["0", "1"]);
  });

  it("returns empty option lists for empty / nullish input", () => {
    expect(getTimeControlOptions([])).toEqual({ initialOptions: [], incrementOptions: [] });
    expect(getTimeControlOptions(null)).toEqual({ initialOptions: [], incrementOptions: [] });
  });

  it("treats blank time controls as initial=0 / increment=NaN (parser default)", () => {
    // parseTimeControlParts of "" returns { initial: "0", increment: "NaN" }
    // (both stringified). Both strings are truthy, so both get added; the
    // numeric sort floats NaN to the front of the increment list.
    const result = getTimeControlOptions([{ timeControl: "" }, { timeControl: "60+0" }]);
    expect(result.initialOptions).toEqual(["0", "60"]);
    expect(result.incrementOptions).toEqual(["NaN", "0"]);
  });
});
