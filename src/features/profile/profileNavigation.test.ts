import { describe, expect, it } from "vitest";

import { getProfileHistoryTabFromSearch } from "./profileNavigation";

describe("profile navigation", () => {
  it("normalizes legacy trophy links into the ranks tab", () => {
    expect(getProfileHistoryTabFromSearch("?tab=trophies")).toBe("ranks");
  });

  it("accepts known tabs and rejects unknown values", () => {
    expect(getProfileHistoryTabFromSearch("?tab=opponents")).toBe("opponents");
    expect(getProfileHistoryTabFromSearch("?tab=unknown")).toBe("matches");
  });
});
