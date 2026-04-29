import { describe, expect, it, vi } from "vitest";

import { cachedRequest } from "./requestCache";

describe("cachedRequest", () => {
  it("memoizes by stable JSON of the key parts", async () => {
    const cache = new Map<string, Promise<number>>();
    const work = vi.fn().mockResolvedValue(42);

    const a = await cachedRequest(cache, [{ a: 1, b: 2 }], work);
    // Same content, different key ordering — should hit the cache
    const b = await cachedRequest(cache, [{ b: 2, a: 1 }], work);

    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("evicts the entry on rejection so the next call retries", async () => {
    const cache = new Map<string, Promise<number>>();
    const work = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(7);

    await expect(cachedRequest(cache, ["k"], work)).rejects.toThrow("boom");
    expect(cache.size).toBe(0);

    const result = await cachedRequest(cache, ["k"], work);
    expect(result).toBe(7);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("does not call the worker again while the first promise is in flight", async () => {
    const cache = new Map<string, Promise<number>>();
    let resolve: (value: number) => void = () => {};
    const work = vi.fn(
      () =>
        new Promise<number>((r) => {
          resolve = r;
        }),
    );

    const first = cachedRequest(cache, ["k"], work);
    const second = cachedRequest(cache, ["k"], work);

    expect(work).toHaveBeenCalledTimes(1);
    resolve(11);
    await expect(first).resolves.toBe(11);
    await expect(second).resolves.toBe(11);
  });
});
