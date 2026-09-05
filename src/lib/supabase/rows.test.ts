import { describe, expect, it } from "vitest";

import { loadSupabaseRows } from "./rows";

describe("Supabase request concurrency", () => {
  it("runs up to four independent requests concurrently", async () => {
    let activeRequests = 0;
    let peakActiveRequests = 0;

    const createQuery = (value: number) => ({
      then: (
        resolve: (result: { data: number[]; error: null }) => void,
        reject: (error: unknown) => void,
      ) => {
        activeRequests += 1;
        peakActiveRequests = Math.max(peakActiveRequests, activeRequests);
        return new Promise<{ data: number[]; error: null }>((complete) => {
          globalThis.setTimeout(() => {
            activeRequests -= 1;
            complete({ data: [value], error: null });
          }, 5);
        }).then(resolve, reject);
      },
    });

    const rows = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        loadSupabaseRows<number>(
          "test",
          createQuery(index) as unknown as PromiseLike<{ data: number[]; error: null }>,
        ),
      ),
    );

    expect(peakActiveRequests).toBe(4);
    expect(rows).toEqual(Array.from({ length: 8 }, (_, index) => [index]));
  });
});
