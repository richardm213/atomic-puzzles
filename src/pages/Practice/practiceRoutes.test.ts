import { describe, expect, it } from "vitest";

import { practicePath, practiceRouteParam, practiceUsernamesFromRoute } from "./practiceRoutes";

describe("practice opponent routes", () => {
  it("creates a shareable route for the selected opponent", () => {
    expect(practicePath(["HowlinD"])).toBe("/practice/HowlinD");
    expect(practiceRouteParam(["HowlinD"])).toBe("HowlinD");
  });

  it("round-trips multiple opponents and removes duplicates", () => {
    expect(practiceUsernamesFromRoute("HowlinD,sircachetes,howlind")).toEqual([
      "HowlinD",
      "sircachetes",
    ]);
    expect(practicePath([])).toBe("/practice");
  });
});
