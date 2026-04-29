import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useMatchLengthRange } from "./useMatchLengthRange";

describe("useMatchLengthRange", () => {
  it("initializes with the default bounds for the given mode", () => {
    const { result } = renderHook(() => useMatchLengthRange("blitz"));
    expect(result.current.bounds.min).toBe(1);
    expect(result.current.matchLengthMin).toBe(1);
    expect(result.current.matchLengthMax).toBe(50);
  });

  it("setMatchLengthMin updates only the lower bound", () => {
    const { result } = renderHook(() => useMatchLengthRange("blitz"));
    act(() => {
      result.current.setMatchLengthMin(7);
    });
    expect(result.current.matchLengthMin).toBe(7);
    expect(result.current.matchLengthMax).toBe(50);
  });

  it("setMatchLengthMax updates only the upper bound", () => {
    const { result } = renderHook(() => useMatchLengthRange("blitz"));
    act(() => {
      result.current.setMatchLengthMax(25);
    });
    expect(result.current.matchLengthMin).toBe(1);
    expect(result.current.matchLengthMax).toBe(25);
  });

  it("resets the range when the mode changes", () => {
    const { result, rerender } = renderHook(
      ({ mode }: { mode: "blitz" | "bullet" }) => useMatchLengthRange(mode),
      { initialProps: { mode: "blitz" } },
    );

    act(() => {
      result.current.setMatchLengthMin(15);
    });
    expect(result.current.matchLengthMin).toBe(15);

    rerender({ mode: "bullet" });
    expect(result.current.matchLengthMin).toBe(1);
    expect(result.current.matchLengthMax).toBe(50);
  });
});
