import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAtomicDbAnalysis } from "./useAtomicDbAnalysis";

const FIRST_FEN = "8/8/8/8/8/8/8/K6k w - - 0 101";
const SECOND_FEN = "8/8/8/8/8/8/8/K6k b - - 0 102";

const responseFor = (score: number) =>
  new Response(
    JSON.stringify({
      status: "UNKNOWN",
      score,
      best_move: "a1a2",
      moves: [{ uci: "a1a2", status: "UNKNOWN", score }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

describe("useAtomicDbAnalysis", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retains the settled position while the next FEN is loading", async () => {
    let resolveSecondRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseFor(500))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecondRequest = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(({ fen }) => useAtomicDbAnalysis(fen, true, 0), {
      initialProps: { fen: FIRST_FEN },
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.result?.fen).toBe(FIRST_FEN);

    rerender({ fen: SECOND_FEN });
    expect(result.current.status).toBe("loading");
    expect(result.current.result?.fen).toBe(FIRST_FEN);

    await act(async () => {
      resolveSecondRequest?.(responseFor(-300));
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.result?.fen).toBe(SECOND_FEN);
  });
});
