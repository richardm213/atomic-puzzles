import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useAtomicDbEngineSettings } from "./useAtomicDbEngineSettings";

const STORAGE_KEY = "atomic-puzzles.test.atomicdb-engine";

describe("useAtomicDbEngineSettings", () => {
  beforeEach(() => window.localStorage.clear());

  it("restores the user's chosen number of engine lines", () => {
    const first = renderHook(() => useAtomicDbEngineSettings({ storageKey: STORAGE_KEY }));

    act(() => first.result.current[1]((current) => ({ ...current, lineCount: 5 })));
    first.unmount();

    const second = renderHook(() => useAtomicDbEngineSettings({ storageKey: STORAGE_KEY }));
    expect(second.result.current[0].lineCount).toBe(5);
  });
});
