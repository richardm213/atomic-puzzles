export class OpeningExplorerQueueError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const createPriorityFactory = () => {
  let sequence = 0;
  return (intent) => ({ value: ++sequence, lane: intent === "prefetch" ? 0 : 1 });
};

export const createOpeningExplorerQueue = ({
  busyMessage = "Opening explorer is busy. Newer requests are being prioritized.",
  maxConcurrent,
  maxQueued,
  supersededMessage = "Opening explorer request was superseded by a newer request.",
}) => {
  const queue = [];
  let active = 0;
  let sequence = 0;
  const compare = (a, b) =>
    (a.priorityRef.lane ?? 1) - (b.priorityRef.lane ?? 1) ||
    a.priorityRef.value - b.priorityRef.value ||
    a.sequence - b.sequence;

  const pump = () => {
    while (active < maxConcurrent && queue.length) {
      const index = queue.reduce((best, job, i) => (compare(job, queue[best]) > 0 ? i : best), 0);
      const [job] = queue.splice(index, 1);
      job.start();
    }
  };

  const enqueue = (run, priorityRef) =>
    new Promise((resolve, reject) => {
      const signal = priorityRef.signal;
      const cancelled = () =>
        signal?.reason ?? new OpeningExplorerQueueError(supersededMessage, 499);
      if (signal?.aborted) {
        reject(cancelled());
        return;
      }

      let finished = false;
      const settle = (callback, value) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener("abort", abort);
        callback(value);
      };
      const abort = () => {
        const index = queue.indexOf(job);
        if (index >= 0) queue.splice(index, 1);
        settle(reject, cancelled());
        // A running driver call may not support cancellation. Keep its slot until
        // it actually settles; otherwise repeated aborts exceed maxConcurrent.
      };
      const release = () => {
        active -= 1;
        pump();
      };
      const job = {
        priorityRef,
        sequence: ++sequence,
        reject: (error) => settle(reject, error),
        start: () => {
          if (signal?.aborted) {
            abort();
            return;
          }
          active += 1;
          try {
            Promise.resolve(run())
              .then(
                (value) => settle(resolve, value),
                (error) => settle(reject, error),
              )
              .finally(release);
          } catch (error) {
            settle(reject, error);
            release();
          }
        },
      };
      signal?.addEventListener("abort", abort, { once: true });
      if (active < maxConcurrent) {
        job.start();
        return;
      }
      if (maxQueued <= 0) {
        job.reject(new OpeningExplorerQueueError(busyMessage));
        return;
      }
      if (queue.length >= maxQueued) {
        const lowest = queue.reduce(
          (best, item, i) => (compare(item, queue[best]) < 0 ? i : best),
          0,
        );
        if (compare(job, queue[lowest]) <= 0) {
          job.reject(new OpeningExplorerQueueError(busyMessage));
          return;
        }
        const [dropped] = queue.splice(lowest, 1);
        dropped.reject(new OpeningExplorerQueueError(supersededMessage));
      }
      queue.push(job);
      pump();
    });

  return { enqueue, stats: () => ({ active, queued: queue.length }) };
};
