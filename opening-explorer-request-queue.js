export class OpeningExplorerQueueError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const createPriorityFactory = () => {
  let sequence = 0;

  return (intent) => {
    sequence += 1;
    return {
      value: sequence * 2 + (intent === "prefetch" ? 0 : 1),
    };
  };
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

  const priorityValue = (job) => job.priorityRef.value;

  const findNextJobIndex = () => {
    let nextIndex = 0;

    for (let index = 1; index < queue.length; index += 1) {
      const current = queue[index];
      const next = queue[nextIndex];

      if (
        priorityValue(current) > priorityValue(next) ||
        (priorityValue(current) === priorityValue(next) && current.sequence > next.sequence)
      ) {
        nextIndex = index;
      }
    }

    return nextIndex;
  };

  const pump = () => {
    while (active < maxConcurrent && queue.length > 0) {
      const [job] = queue.splice(findNextJobIndex(), 1);
      active += 1;

      job
        .run()
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };

  const enqueue = (run, priorityRef) =>
    new Promise((resolve, reject) => {
      if (active < maxConcurrent) {
        active += 1;
        run()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            pump();
          });
        return;
      }

      if (maxQueued <= 0) {
        reject(new OpeningExplorerQueueError(busyMessage));
        return;
      }

      if (queue.length >= maxQueued) {
        const lowestIndex = queue.reduce((lowest, job, index) => {
          const lowestJob = queue[lowest];
          if (
            priorityValue(job) < priorityValue(lowestJob) ||
            (priorityValue(job) === priorityValue(lowestJob) && job.sequence < lowestJob.sequence)
          ) {
            return index;
          }

          return lowest;
        }, 0);
        const lowestJob = queue[lowestIndex];

        if (priorityRef.value <= priorityValue(lowestJob)) {
          reject(new OpeningExplorerQueueError(busyMessage));
          return;
        }

        const [droppedJob] = queue.splice(lowestIndex, 1);
        droppedJob.reject(new OpeningExplorerQueueError(supersededMessage));
      }

      sequence += 1;
      queue.push({
        priorityRef,
        reject,
        resolve,
        run,
        sequence,
      });
      pump();
    });

  return {
    enqueue,
    stats: () => ({
      active,
      queued: queue.length,
    }),
  };
};
