import { describe, expect, it } from "vitest";

import {
  createOpeningExplorerQueue,
  createPriorityFactory,
  OpeningExplorerQueueError,
} from "../../opening-explorer-request-queue.js";

const deferred = <T = string>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
};

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("opening explorer request queue", () => {
  it("runs newer visible work before queued prefetch work", async () => {
    const nextPriority = createPriorityFactory();
    const queue = createOpeningExplorerQueue({ maxConcurrent: 1, maxQueued: 4 });
    const active = deferred();
    const runOrder: string[] = [];

    const activePromise = queue.enqueue(() => {
      runOrder.push("active");
      return active.promise;
    }, nextPriority("visible"));
    const prefetchPromise = queue.enqueue(async () => {
      runOrder.push("prefetch");
      return "prefetch";
    }, nextPriority("prefetch"));
    const visiblePromise = queue.enqueue(async () => {
      runOrder.push("visible");
      return "visible";
    }, nextPriority("visible"));

    expect(runOrder).toEqual(["active"]);

    active.resolve("active");
    await expect(activePromise).resolves.toBe("active");
    await expect(visiblePromise).resolves.toBe("visible");
    await expect(prefetchPromise).resolves.toBe("prefetch");
    expect(runOrder).toEqual(["active", "visible", "prefetch"]);
  });

  it("lets a visible duplicate boost queued prefetch priority", async () => {
    const nextPriority = createPriorityFactory();
    const queue = createOpeningExplorerQueue({ maxConcurrent: 1, maxQueued: 4 });
    const active = deferred();
    const boostedPriority = nextPriority("prefetch");
    const runOrder: string[] = [];

    const activePromise = queue.enqueue(() => {
      runOrder.push("active");
      return active.promise;
    }, nextPriority("visible"));
    const boostedPromise = queue.enqueue(async () => {
      runOrder.push("boosted");
      return "boosted";
    }, boostedPriority);
    const visiblePromise = queue.enqueue(async () => {
      runOrder.push("visible");
      return "visible";
    }, nextPriority("visible"));

    boostedPriority.value = Math.max(boostedPriority.value, nextPriority("visible").value);
    active.resolve("active");

    await expect(activePromise).resolves.toBe("active");
    await expect(boostedPromise).resolves.toBe("boosted");
    await expect(visiblePromise).resolves.toBe("visible");
    expect(runOrder).toEqual(["active", "boosted", "visible"]);
  });

  it("drops the lowest-priority queued job when the queue is full", async () => {
    const nextPriority = createPriorityFactory();
    const queue = createOpeningExplorerQueue({ maxConcurrent: 1, maxQueued: 1 });
    const active = deferred();
    const runOrder: string[] = [];

    const activePromise = queue.enqueue(() => {
      runOrder.push("active");
      return active.promise;
    }, nextPriority("visible"));
    const stalePromise = queue.enqueue(async () => {
      runOrder.push("stale");
      return "stale";
    }, nextPriority("prefetch"));
    const visiblePromise = queue.enqueue(async () => {
      runOrder.push("visible");
      return "visible";
    }, nextPriority("visible"));

    await expect(stalePromise).rejects.toBeInstanceOf(OpeningExplorerQueueError);
    active.resolve("active");

    await expect(activePromise).resolves.toBe("active");
    await expect(visiblePromise).resolves.toBe("visible");
    await flushMicrotasks();
    expect(runOrder).toEqual(["active", "visible"]);
  });
});
