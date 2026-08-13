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

  it("ignores absent and malformed time controls instead of offering bogus filters", () => {
    expect(
      getTimeControlOptions([
        { timeControl: null },
        { timeControl: "" },
        { timeControl: "60" },
        { timeControl: "60+0" },
      ]),
    ).toEqual({ initialOptions: ["60"], incrementOptions: ["0"] });

    expect(getTimeControlOptions(null)).toEqual({ initialOptions: [], incrementOptions: [] });
  });
});
