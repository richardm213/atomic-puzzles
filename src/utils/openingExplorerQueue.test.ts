import { describe, expect, it, vi } from "vitest";

import {
  createOpeningExplorerQueue,
  createPriorityFactory,
  OpeningExplorerQueueError,
} from "../../opening-explorer/core/requestQueue.js";

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

    Object.assign(boostedPriority, nextPriority("visible"));
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
  it("prioritizes visible work even over a newer prefetch", async () => {
    const queue = createOpeningExplorerQueue({ maxConcurrent: 1, maxQueued: 4 });
    const next = createPriorityFactory();
    const gate = deferred();
    const active = queue.enqueue(() => gate.promise, next("visible"));
    const order: string[] = [];
    const visible = queue.enqueue(async () => {
      order.push("visible");
    }, next("visible"));
    const prefetch = queue.enqueue(async () => {
      order.push("prefetch");
    }, next("prefetch"));
    gate.resolve("done");
    await Promise.all([active, visible, prefetch]);
    expect(order).toEqual(["visible", "prefetch"]);
  });

  it("removes aborted queued work immediately without running it", async () => {
    const queue = createOpeningExplorerQueue({ maxConcurrent: 1, maxQueued: 4 });
    const gate = deferred();
    const active = queue.enqueue(() => gate.promise, { value: 1 });
    const controller = new AbortController();
    const run = vi.fn(async () => "obsolete");
    const obsolete = queue.enqueue(run, { value: 2, signal: controller.signal });
    const rejected = expect(obsolete).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(queue.stats()).toEqual({ active: 1, queued: 0 });
    gate.resolve("done");
    await active;
    expect(run).not.toHaveBeenCalled();
  });

  it("does not free an aborted active slot until the underlying work finishes", async () => {
    const queue = createOpeningExplorerQueue({ maxConcurrent: 1, maxQueued: 4 });
    const gate = deferred();
    const controller = new AbortController();
    const active = queue.enqueue(() => gate.promise, { value: 1, signal: controller.signal });
    const rejected = expect(active).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    const run = vi.fn(async () => "latest");
    const latest = queue.enqueue(run, { value: 2 });
    expect(queue.stats()).toEqual({ active: 1, queued: 1 });
    expect(run).not.toHaveBeenCalled();
    gate.resolve("ignored");
    await expect(latest).resolves.toBe("latest");
    await flushMicrotasks();
    expect(queue.stats()).toEqual({ active: 0, queued: 0 });
  });

  it("rejects pre-aborted jobs and recovers capacity after a synchronous throw", async () => {
    const queue = createOpeningExplorerQueue({ maxConcurrent: 1, maxQueued: 4 });
    const controller = new AbortController();
    controller.abort();
    const run = vi.fn(async () => "never");
    await expect(queue.enqueue(run, { value: 1, signal: controller.signal })).rejects.toMatchObject(
      { name: "AbortError" },
    );
    expect(run).not.toHaveBeenCalled();
    await expect(
      queue.enqueue(
        () => {
          throw new Error("sync");
        },
        { value: 2 },
      ),
    ).rejects.toThrow("sync");
    await expect(queue.enqueue(async () => "ok", { value: 3 })).resolves.toBe("ok");
    await flushMicrotasks();
    expect(queue.stats()).toEqual({ active: 0, queued: 0 });
  });
});
