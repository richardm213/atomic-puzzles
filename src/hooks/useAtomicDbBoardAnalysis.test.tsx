import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearPreloadedAtomicDbGamePositions,
  replacePreloadedAtomicDbGamePositions,
} from "../lib/atomicDb/analysisRepository";
import { analyzeFairyStockfishPosition } from "../lib/practice/fairyStockfish";
import { useAtomicDbBoardAnalysis } from "./useAtomicDbBoardAnalysis";

vi.mock("../lib/practice/fairyStockfish", () => ({
  analyzeFairyStockfishPosition: vi.fn(),
}));
const analyzeWithEngineMock = vi.mocked(analyzeFairyStockfishPosition);

const FEN = "8/8/8/8/3k4/2ppp3/1K3P1P/6NR w - - 0 201";
const TABLEBASE_FEN = "8/8/8/8/3k4/8/1K3P1P/6N1 w - - 3 71";

describe("useAtomicDbBoardAnalysis", () => {
  afterEach(() => {
    clearPreloadedAtomicDbGamePositions();
    vi.unstubAllGlobals();
    analyzeWithEngineMock.mockReset();
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

  it("fills missing evaluations in complete stored game analysis with Atomic-Stockfish", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    analyzeWithEngineMock.mockResolvedValue([
      {
        move: "a1a2",
        multipv: 1,
        scoreType: "cp",
        score: 315,
        depth: 18,
        principalVariation: ["a1a2", "d4e5"],
      },
      {
        move: "b2b3",
        multipv: 2,
        scoreType: "cp",
        score: 180,
        depth: 18,
        principalVariation: ["b2b3", "d4e5"],
      },
    ]);
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
            {
              uci: "b2b3",
              outcome: "UNKNOWN",
              closure: null,
              score: null,
              point: null,
              mate: null,
              nodeBackedPlies: null,
            },
          ],
        },
        principalVariations: { a1a2: ["a1a2", "d4e5"], b2b3: ["b2b3"] },
      },
    ]);

    const { result } = renderHook(() =>
      useAtomicDbBoardAnalysis({
        currentFen: FEN,
        enabled: true,
        navigation: null,
        lineCount: 2,
      }),
    );

    await waitFor(() => expect(result.current.analysis.status).toBe("ready"));
    expect(result.current.analysis.source).toBe("mixed");
    expect(result.current.analysis.engine).toBe("atomic-stockfish");
    expect(result.current.analysis.result?.position?.moves).toEqual([
      expect.objectContaining({ uci: "a1a2", score: 320 }),
      expect.objectContaining({ uci: "b2b3", origin: "engine", score: 180 }),
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Atomic-Stockfish instead of stored game analysis for tablebase positions", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    analyzeWithEngineMock.mockResolvedValue([
      {
        move: "g1f3",
        multipv: 1,
        scoreType: "cp",
        score: 85,
        depth: 18,
      },
    ]);
    replacePreloadedAtomicDbGamePositions([
      {
        fen: TABLEBASE_FEN,
        complete: true,
        position: {
          key: "stored-tablebase-position",
          outcome: "UNKNOWN",
          closure: null,
          score: 320,
          point: 300,
          bestMove: "g1f3",
          moves: [],
        },
        principalVariations: {},
      },
    ]);

    const { result } = renderHook(() =>
      useAtomicDbBoardAnalysis({
        currentFen: TABLEBASE_FEN,
        enabled: true,
        navigation: null,
        lineCount: 1,
      }),
    );

    await waitFor(() => expect(result.current.analysis.status).toBe("ready"));
    expect(result.current.analysis.source).toBe("engine");
    expect(result.current.analysis.engine).toBe("atomic-stockfish");
    expect(result.current.analysis.result?.position?.key).toBeNull();
    expect(analyzeWithEngineMock).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
