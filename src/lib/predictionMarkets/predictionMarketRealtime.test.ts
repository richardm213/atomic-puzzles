import { describe, expect, it, vi } from "vitest";

import { createCoalescedBatchRefresh } from "./predictionMarketRealtime";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

describe("createCoalescedBatchRefresh", () => {
  it("runs one follow-up refresh when updates arrive during an active refresh", async () => {
    const firstRefresh = deferred();
    const refresh = vi
      .fn<(marketIds: readonly string[]) => Promise<void>>()
      .mockReturnValueOnce(firstRefresh.promise)
      .mockResolvedValue(undefined);
    const coordinator = createCoalescedBatchRefresh(refresh);

    coordinator.request(["market-a"]);
    coordinator.request(["market-a"]);
    coordinator.request(["market-b"]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenNthCalledWith(1, ["market-a"]);

    firstRefresh.resolve();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(refresh).toHaveBeenNthCalledWith(2, ["market-a", "market-b"]);
  });

  it("ignores queued work after it is stopped", async () => {
    const firstRefresh = deferred();
    const refresh = vi
      .fn<(marketIds: readonly string[]) => Promise<void>>()
      .mockReturnValue(firstRefresh.promise);
    const coordinator = createCoalescedBatchRefresh(refresh);

    coordinator.request(["market-a"]);
    coordinator.request(["market-b"]);
    coordinator.stop();
    firstRefresh.resolve();

    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
