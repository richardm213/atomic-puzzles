import { describe, expect, it } from "vitest";

import { isToggleActionKey } from "./toggleActionKey";

describe("isToggleActionKey", () => {
  it("recognizes Enter and Space as toggle actions", () => {
    expect(isToggleActionKey({ key: "Enter" })).toBe(true);
    expect(isToggleActionKey({ key: " " })).toBe(true);
  });

  it("rejects every other key", () => {
    expect(isToggleActionKey({ key: "Tab" })).toBe(false);
    expect(isToggleActionKey({ key: "a" })).toBe(false);
  });
});
