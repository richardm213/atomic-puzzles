import { act, renderHook } from "@testing-library/react";

import { usePracticeClocks } from "./usePracticeClocks";
import type { PracticeSide } from "./usePracticeSettings";

describe("practice clocks", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("charges the active side, awards each side's increment, and pauses both clocks", () => {
    const { result, rerender } = renderHook(
      ({ side }: { side: PracticeSide | null }) => usePracticeClocks(1, 2, side),
      { initialProps: { side: "white" as PracticeSide | null } },
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remaining).toEqual({ white: 59000, black: 60000 });
    act(() => result.current.addIncrement("white"));
    rerender({ side: "black" });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.remaining).toEqual({ white: 61000, black: 58000 });
    act(() => result.current.addIncrement("black"));
    rerender({ side: null });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.remaining).toEqual({ white: 61000, black: 60000 });
  });

  it("resets without charging stale elapsed time and restarts the active timer", () => {
    const { result } = renderHook(() => usePracticeClocks(1, 0, "white"));
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    act(() => result.current.reset(2));
    expect(result.current.remaining).toEqual({ white: 120000, black: 120000 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.remaining).toEqual({ white: 119000, black: 120000 });
  });

  it("flags the opponent's clock and prevents increments after flagging", () => {
    const { result } = renderHook(() => usePracticeClocks(1, 2, "black"));
    act(() => {
      vi.advanceTimersByTime(61000);
    });
    expect(result.current.expired).toBe("black");
    expect(result.current.remaining).toEqual({ white: 60000, black: 0 });
    act(() => result.current.addIncrement("black"));
    expect(result.current.remaining.black).toBe(0);
    act(() => result.current.reset());
    expect(result.current.expired).toBeNull();
  });
});
