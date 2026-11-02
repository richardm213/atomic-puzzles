import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAtomicDbEngineSettings } from "./useAtomicDbEngineSettings";

const STORAGE_KEY = "atomic-puzzles.test.atomicdb-engine";

describe("useAtomicDbEngineSettings", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to two lines on mobile without overriding a later preference", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true }),
    );

    const first = renderHook(() => useAtomicDbEngineSettings({ storageKey: STORAGE_KEY }));
    expect(first.result.current[0].lineCount).toBe(2);

    act(() => first.result.current[1]((current) => ({ ...current, lineCount: 3 })));
    first.unmount();

    const second = renderHook(() => useAtomicDbEngineSettings({ storageKey: STORAGE_KEY }));
    expect(second.result.current[0].lineCount).toBe(3);
  });

  it("restores the user's chosen number of engine lines", () => {
    const first = renderHook(() => useAtomicDbEngineSettings({ storageKey: STORAGE_KEY }));

    act(() => first.result.current[1]((current) => ({ ...current, lineCount: 5 })));
    first.unmount();

    const second = renderHook(() => useAtomicDbEngineSettings({ storageKey: STORAGE_KEY }));
    expect(second.result.current[0].lineCount).toBe(5);
  });

  it("restores the follow-up move preference", () => {
    const first = renderHook(() => useAtomicDbEngineSettings({ storageKey: STORAGE_KEY }));

    act(() => first.result.current[1]((current) => ({ ...current, showFollowUpMoves: false })));
    first.unmount();

    const second = renderHook(() => useAtomicDbEngineSettings({ storageKey: STORAGE_KEY }));
    expect(second.result.current[0].showFollowUpMoves).toBe(false);
  });
});
