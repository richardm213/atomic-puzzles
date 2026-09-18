import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createExplorerRequestLifecycle,
  parseExplorerNavigation,
} from "../core/requestLifecycle.js";

afterEach(() => vi.useRealTimers());

describe("explorer request lifecycle", () => {
  it("rejects malformed client ordering metadata", () => {
    const session = "7df5aa4d-e7c6-4caf-b1fc-5b1474e9891a";
    expect(parseExplorerNavigation(session, "1")).toEqual({ session, sequence: 1 });
    for (const value of ["0", "-1", "1.2", "Infinity", "9007199254740992", undefined]) {
      expect(parseExplorerNavigation(session, value)).toBeUndefined();
    }
    expect(parseExplorerNavigation("bad", "1")).toBeUndefined();
  });

  it("bounds request lifetime and does not let a release clear another request's deadline", () => {
    vi.useFakeTimers();
    const begin = createExplorerRequestLifecycle();
    const first = begin({ session: "a", sequence: 1 });
    const second = begin({ session: "a", sequence: 2 });
    expect(first.signal.aborted).toBe(true);
    expect(first.signal.reason.statusCode).toBe(409);
    first.release();
    expect(second.signal.aborted).toBe(false);
    vi.advanceTimersByTime(15_000);
    expect(second.signal.aborted).toBe(true);
    expect(second.signal.reason.statusCode).toBe(504);
    second.release();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows independent tabs and remembers sequence ordering after completion", () => {
    const begin = createExplorerRequestLifecycle();
    const a = begin({ session: "a", sequence: 2 });
    const b = begin({ session: "b", sequence: 1 });
    a.release();
    expect(() => begin({ session: "a", sequence: 1 })).toThrow("superseded");
    expect(b.signal.aborted).toBe(false);
    b.release();
  });
});
