import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearPreloadedAtomicDbGamePositions,
  replacePreloadedAtomicDbGamePositions,
} from "../lib/atomicDb/analysisRepository";
import { useAtomicDbBoardAnalysis } from "./useAtomicDbBoardAnalysis";

const FEN = "8/8/8/8/8/8/8/K6k w - - 0 201";

describe("useAtomicDbBoardAnalysis", () => {
  afterEach(() => {
    clearPreloadedAtomicDbGamePositions();
    vi.unstubAllGlobals();
  });

  it("does not spend an AtomicDB request while position analysis is disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useAtomicDbBoardAnalysis({
        currentFen: FEN,
        enabled: false,
        navigation: null,
        lineCount: 5,
      }),
    );

    await waitFor(() => expect(result.current.analysis.status).toBe("idle"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a complete stored game analysis without refreshing AtomicDB", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    replacePreloadedAtomicDbGamePositions([
      {
        fen: FEN,
        complete: true,
        position: {
          key: "stored-position",
          outcome: "UNKNOWN",
          closure: null,
          score: 320,
          point: 300,
          bestMove: "a1a2",
          moves: [
            {
              uci: "a1a2",
              outcome: "UNKNOWN",
              closure: null,
              score: 320,
              point: 300,
              mate: null,
              nodeBackedPlies: 12,
            },
          ],
        },
        principalVariations: { a1a2: ["a1a2", "h1h2"] },
      },
    ]);

    const { result } = renderHook(() =>
      useAtomicDbBoardAnalysis({
        currentFen: FEN,
        enabled: true,
        navigation: null,
        lineCount: 1,
      }),
    );

    await waitFor(() => expect(result.current.analysis.status).toBe("ready"));
    expect(result.current.analysis.result?.position?.key).toBe("stored-position");
    expect(result.current.analysis.principalVariations.a1a2).toEqual(["a1a2", "h1h2"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
