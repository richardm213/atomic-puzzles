import { describe, expect, it, vi } from "vitest";

import { recoverFromPreloadError } from "./preloadRecovery";

const createStorage = () => {
  const values = new Map<string, string>();

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

describe("recoverFromPreloadError", () => {
  it("prevents the chunk error and reloads once", () => {
    const event = new Event("vite:preloadError", { cancelable: true });
    const reload = vi.fn();

    const recovered = recoverFromPreloadError(event, {
      now: () => 1_000,
      reload,
      storage: createStorage(),
    });

    expect(recovered).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not enter a reload loop when the retry also fails", () => {
    const storage = createStorage();
    const reload = vi.fn();
    const firstEvent = new Event("vite:preloadError", { cancelable: true });
    const retryEvent = new Event("vite:preloadError", { cancelable: true });

    recoverFromPreloadError(firstEvent, { now: () => 20_000, reload, storage });
    const recovered = recoverFromPreloadError(retryEvent, {
      now: () => 20_500,
      reload,
      storage,
    });

    expect(recovered).toBe(false);
    expect(retryEvent.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("allows another recovery after the retry window", () => {
    const storage = createStorage();
    const reload = vi.fn();

    recoverFromPreloadError(new Event("vite:preloadError", { cancelable: true }), {
      now: () => 20_000,
      reload,
      storage,
    });
    const recovered = recoverFromPreloadError(
      new Event("vite:preloadError", { cancelable: true }),
      { now: () => 30_000, reload, storage },
    );

    expect(recovered).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
