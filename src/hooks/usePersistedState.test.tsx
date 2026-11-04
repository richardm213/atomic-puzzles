import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { usePersistedState } from "./usePersistedState";

describe("usePersistedState", () => {
  beforeEach(() => window.localStorage.clear());

  it("loads and validates JSON values", () => {
    window.localStorage.setItem("settings", JSON.stringify({ count: "4" }));
    const schema = z.object({ count: z.coerce.number() });

    const { result } = renderHook(() => usePersistedState("settings", schema, { count: 0 }));

    expect(result.current[0]).toEqual({ count: 4 });
  });

  it("accepts legacy plain strings", () => {
    window.localStorage.setItem("mode", "peak");

    const { result } = renderHook(() =>
      usePersistedState("mode", z.enum(["current", "peak"]), "current"),
    );

    expect(result.current[0]).toBe("peak");
  });

  it("falls back for invalid data and persists updates synchronously", () => {
    window.localStorage.setItem("size", "not-a-size");
    const { result } = renderHook(() => usePersistedState("size", z.number().positive(), 20));

    expect(result.current[0]).toBe(20);
    act(() => result.current[1](50));

    expect(window.localStorage.getItem("size")).toBe("50");
  });

  it("persists functional updates before an immediate unmount", () => {
    const { result, unmount } = renderHook(() => usePersistedState("enabled", z.boolean(), true));

    act(() => result.current[1]((enabled) => !enabled));
    unmount();

    expect(window.localStorage.getItem("enabled")).toBe("false");
  });
});
