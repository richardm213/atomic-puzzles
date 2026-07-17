import { afterEach, describe, expect, it, vi } from "vitest";

import {
  approveQueuedPuzzle,
  rejectQueuedPuzzle,
  submitPuzzleToQueue,
  updateQueuedPuzzle,
} from "./supabasePuzzleQueue";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("puzzle queue review client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends queue edits to the verified review endpoint", async () => {
    const puzzle = {
      id: 4,
      fen: "fen",
      solution: "1. e4",
      explanation: "idea",
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ puzzle }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateQueuedPuzzle(4, {
        fen: " fen ",
        solution: " 1. e4 ",
        event: " match ",
        explanation: " idea ",
      }),
    ).resolves.toEqual(puzzle);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(request?.body))).toEqual({
      action: "update",
      id: 4,
      fen: "fen",
      solution: "1. e4",
      event: "match",
      explanation: "idea",
    });
    expect(request?.credentials).toBe("same-origin");
    expect(request?.headers).not.toHaveProperty("Authorization");
  });

  it("reports the submission service status when it returns a non-JSON error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Not found", { status: 404 })),
    );

    await expect(
      submitPuzzleToQueue({
        fen: "fen",
        solution: "1. e4",
        event: "",
        explanation: "",
      }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("returns the approved puzzle id from the review endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ puzzleId: 42 })),
    );
    const fetchMock = vi.mocked(fetch);
    await expect(approveQueuedPuzzle(4)).resolves.toBe(42);
    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(request?.body))).toEqual({ action: "approve", id: 4 });
  });

  it("sends rejection to the verified review endpoint", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ rejected: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(rejectQueuedPuzzle(4)).resolves.toBeUndefined();
    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(String(request?.body))).toEqual({ action: "reject", id: 4 });
  });
});
