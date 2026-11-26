import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeFairyStockfishPosition } from "../lib/practice/fairyStockfish";
import { getAtomicDbPositionEvaluation } from "../utils/atomicDb";
import { useAtomicDbAnalysis } from "./useAtomicDbAnalysis";

vi.mock("../lib/practice/fairyStockfish", () => ({
  analyzeFairyStockfishPosition: vi.fn(),
}));
const analyzeWithEngineMock = vi.mocked(analyzeFairyStockfishPosition);

const FIRST_FEN = "8/8/8/8/8/8/8/K6k w - - 0 101";
const SECOND_FEN = "8/8/8/8/8/8/8/K6k b - - 0 102";

const bundleResponse = (
  position: Record<string, unknown>,
  lines: Record<string, string[]> = {},
  positions: Record<string, unknown> = {},
) =>
  new Response(
    JSON.stringify({
      position,
      lines,
      positions,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const responseFor = (score: number) =>
  bundleResponse({ status: "UNKNOWN", score, best_move: null, moves: [] });

describe("useAtomicDbAnalysis", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    analyzeWithEngineMock.mockReset();
    vi.useRealTimers();
  });

  it("uses the fallback engine without requesting AtomicDB when AtomicDB is disabled", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    analyzeWithEngineMock.mockResolvedValue([
      {
        move: "e2e4",
        multipv: 1,
        scoreType: "cp",
        score: 72,
        depth: 16,
      },
    ]);

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, {
        atomicDbEnabled: false,
        debounceMs: 0,
        fallbackToEngine: true,
        lineCount: 20,
        candidateLimit: 64,
        engineThinkTimeMs: 150,
        engineMaxDepth: 4,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(analyzeWithEngineMock).toHaveBeenCalledOnce();
    expect(analyzeWithEngineMock).toHaveBeenCalledWith(
      fen,
      20,
      expect.any(AbortSignal),
      expect.any(Function),
      "atomic-stockfish",
      { candidateLimit: 64, thinkTimeMs: 150, maxDepth: 4 },
    );
    expect(result.current.source).toBe("engine");
  });

  it("uses Atomic-Stockfish directly for five-piece endgames", async () => {
    const fen = "8/8/8/8/3k4/8/1K3P1P/6N1 w - - 3 71";
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

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, { debounceMs: 0, fallbackToEngine: true, lineCount: 1 }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(analyzeWithEngineMock).toHaveBeenCalledWith(
      fen,
      1,
      expect.any(AbortSignal),
      expect.any(Function),
      "atomic-stockfish",
      expect.objectContaining({ candidateLimit: 5 }),
    );
    expect(result.current.source).toBe("engine");
    expect(result.current.engine).toBe("atomic-stockfish");
    expect(result.current.result?.position?.moves[0]).toMatchObject({
      uci: "g1f3",
      score: 85,
    });
  });

  it("falls back to Atomic-Stockfish when AtomicDB returns no analyzed moves", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 13 31";
    const fetchMock = vi.fn().mockResolvedValue(responseFor(0));
    vi.stubGlobal("fetch", fetchMock);
    analyzeWithEngineMock.mockResolvedValue([
      {
        move: "e2e4",
        multipv: 1,
        scoreType: "cp",
        score: 82,
        depth: 18,
        principalVariation: ["e2e4", "e7e5", "g1f3"],
      },
    ]);

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, {
        debounceMs: 0,
        fallbackToEngine: true,
        lineCount: 1,
        plyCount: 3,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(analyzeWithEngineMock).toHaveBeenCalledWith(
      fen,
      1,
      expect.any(AbortSignal),
      expect.any(Function),
      "atomic-stockfish",
      expect.objectContaining({ candidateLimit: 5 }),
    );
    expect(result.current.source).toBe("engine");
    expect(result.current.result?.position?.moves[0]).toMatchObject({
      uci: "e2e4",
      score: 82,
      nodeBackedPlies: null,
      searchDepth: 18,
    });
    expect(result.current.principalVariations.e2e4).toEqual(["e2e4", "e7e5", "g1f3"]);
  });

  it("falls back to Atomic-Stockfish when AtomicDB is unavailable", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 14 32";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("AtomicDB unavailable")));
    analyzeWithEngineMock.mockResolvedValue([
      {
        move: "d2d4",
        multipv: 1,
        scoreType: "cp",
        score: 64,
        depth: 17,
      },
    ]);

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, {
        debounceMs: 0,
        fallbackToEngine: true,
        lineCount: 1,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(analyzeWithEngineMock).toHaveBeenCalledWith(
      fen,
      1,
      expect.any(AbortSignal),
      expect.any(Function),
      "atomic-stockfish",
      expect.objectContaining({ candidateLimit: 5 }),
    );
    expect(result.current.source).toBe("engine");
    expect(result.current.result?.position?.moves[0]?.uci).toBe("d2d4");
  });

  it("requests only the number of legal moves when fewer than the line setting exist", async () => {
    const fen = "rn1r4/pp2kR1p/2p5/5P1P/1P6/4P3/P1P5/2K5 b - - 8 27";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFor(0)));
    analyzeWithEngineMock.mockResolvedValue([
      {
        move: "e7d6",
        multipv: 1,
        scoreType: "cp",
        score: 0,
        depth: 18,
        principalVariation: ["e7d6", "f7f6"],
      },
      {
        move: "e7e8",
        multipv: 2,
        scoreType: "mate",
        score: -2,
        depth: 18,
        principalVariation: ["e7e8", "f7f8"],
      },
    ]);

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, {
        debounceMs: 0,
        fallbackToEngine: true,
        lineCount: 5,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(analyzeWithEngineMock).toHaveBeenCalledWith(
      fen,
      2,
      expect.any(AbortSignal),
      expect.any(Function),
      "atomic-stockfish",
      expect.objectContaining({ candidateLimit: 5 }),
    );
    expect(result.current.result?.position?.moves).toHaveLength(2);
  });

  it("fills missing requested AtomicDB lines with distinct Atomic-Stockfish moves", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 12 30";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        bundleResponse(
          {
            key: "partial-position",
            status: "UNKNOWN",
            score: 90,
            best_move: "g1f3",
            moves: [{ uci: "g1f3", status: "UNKNOWN", score: 90 }],
          },
          { g1f3: ["g1f3", "g8f6"] },
        ),
      ),
    );
    analyzeWithEngineMock.mockResolvedValue([
      {
        move: "g1f3",
        multipv: 1,
        scoreType: "cp",
        score: 80,
        depth: 18,
        principalVariation: ["g1f3", "g8f6"],
      },
      {
        move: "e2e4",
        multipv: 2,
        scoreType: "cp",
        score: 65,
        depth: 18,
        principalVariation: ["e2e4", "e7e5"],
      },
      {
        move: "d2d4",
        multipv: 3,
        scoreType: "cp",
        score: 50,
        depth: 18,
        principalVariation: ["d2d4", "d7d5"],
      },
    ]);

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, {
        debounceMs: 0,
        fallbackToEngine: true,
        lineCount: 3,
        plyCount: 2,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(analyzeWithEngineMock).toHaveBeenCalledWith(
      fen,
      3,
      expect.any(AbortSignal),
      expect.any(Function),
      "atomic-stockfish",
      expect.objectContaining({ candidateLimit: 5 }),
    );
    expect(result.current.source).toBe("mixed");
    expect(result.current.result?.position?.key).toBe("partial-position");
    expect(result.current.result?.position?.moves.map((move) => move.uci)).toEqual([
      "g1f3",
      "e2e4",
      "d2d4",
    ]);
    expect(result.current.principalVariations.g1f3).toEqual(["g1f3", "g8f6"]);
    expect(result.current.principalVariations.e2e4).toEqual(["e2e4", "e7e5"]);
  });

  it("merges both encodings of castling into one row and keeps its engine continuation", async () => {
    const fen = "r3k2r/pp6/8/8/8/8/PP6/R3K2R w KQkq - 0 1";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        bundleResponse(
          {
            best_move: "e1a1",
            moves: [{ uci: "e1c1", score: 82 }, { uci: "e1a1" }],
          },
          { e1c1: ["e1c1"] },
        ),
      ),
    );
    analyzeWithEngineMock.mockResolvedValue([
      {
        move: "e1a1",
        multipv: 1,
        scoreType: "cp",
        score: 72,
        principalVariation: ["e1a1", "a7a6"],
      },
      { move: "a2a3", multipv: 2, scoreType: "cp", score: 52 },
      { move: "a2a3", multipv: 3, scoreType: "cp", score: 51 },
      { move: "b2b3", multipv: 4, scoreType: "cp", score: 33 },
    ]);
    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, { debounceMs: 0, fallbackToEngine: true, lineCount: 3 }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.result?.position).toMatchObject({
      bestMove: "e1c1",
      moves: [
        { uci: "e1c1", score: 82 },
        { uci: "a2a3", score: 52 },
        { uci: "b2b3", score: 33 },
      ],
    });
    expect(result.current.principalVariations.e1c1).toEqual(["e1c1", "a7a6"]);
  });

  it("merges a Chess960 castling alias while preserving an independent king move", async () => {
    const fen = "r2k3r/pp6/8/8/8/8/PP6/R3K2R b KQkq - 0 991";
    const nextFen = fen.replace("991", "992");
    const position = {
      best_move: "d8a8",
      moves: [
        { uci: "d8a8", score: 82 },
        { uci: "d8c8", score: 53 },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(bundleResponse(position, { d8c8: ["d8c8", "a2a3", "d8d7"] }))
        .mockResolvedValueOnce(bundleResponse(position, { d8c8: ["d8c8", "a2a3", "c8b8"] })),
    );
    const { result, rerender } = renderHook(
      ({ currentFen }) => useAtomicDbAnalysis(currentFen, { debounceMs: 0, lineCount: 2 }),
      { initialProps: { currentFen: fen } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.result?.position?.moves.map(({ uci }) => uci)).toEqual(["d8a8"]);
    expect(result.current.principalVariations.d8a8).toEqual(["d8a8", "a2a3", "d8d7"]);

    rerender({ currentFen: nextFen });
    await waitFor(() => expect(result.current.result?.fen).toBe(nextFen));
    expect(result.current.result?.position?.moves.map(({ uci }) => uci)).toEqual(["d8a8", "d8c8"]);
  });

  it("uses an unrestricted mate for the position and checks extreme candidates at their own roots", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 993";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        bundleResponse({
          best_move: "e2e4",
          score: 10_000,
          moves: [
            { uci: "e2e4", score: 10_000 },
            { uci: "g1f3", score: -4_000 },
            { uci: "a2a3", score: 4_000 },
            { uci: "c2c4", score: 3_999 },
          ],
        }),
      ),
    );
    analyzeWithEngineMock
      .mockResolvedValueOnce([{ move: "d2d4", multipv: 1, scoreType: "mate", score: 5 }])
      .mockResolvedValueOnce([
        { move: "e2e4", multipv: 1, scoreType: "mate", score: 8 },
        { move: "a2a3", multipv: 2, scoreType: "cp", score: 4_100 },
        {
          move: "g1f3",
          multipv: 3,
          scoreType: "mate",
          score: -3,
          principalVariation: ["g1f3", "d7d5"],
        },
      ]);
    const { result } = renderHook(() => useAtomicDbAnalysis(fen, { lineCount: 5 }));
    await waitFor(() => expect(result.current.result?.position?.bestMove).toBe("d2d4"));
    expect(analyzeWithEngineMock).toHaveBeenCalledTimes(2);
    expect(analyzeWithEngineMock.mock.calls[1]?.[5]?.searchMoves).toEqual(["e2e4", "g1f3", "a2a3"]);
    expect(result.current.result?.position?.moves).toMatchObject([
      { uci: "d2d4", mate: 5, origin: "engine" },
      { uci: "e2e4", mate: 8 },
      { uci: "g1f3", mate: -3 },
      { uci: "a2a3", score: 4_000, mate: null },
      { uci: "c2c4", score: 3_999, mate: null },
    ]);
    expect(result.current.principalVariations.g1f3).toEqual(["g1f3", "d7d5"]);
  });

  it("does not use a forced loss on one move as proof that the position is lost", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 994";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        bundleResponse({
          best_move: "e2e4",
          score: -10_000,
          moves: [{ uci: "e2e4", score: -10_000 }],
        }),
      ),
    );
    analyzeWithEngineMock
      .mockResolvedValueOnce([{ move: "d2d4", multipv: 1, scoreType: "cp", score: 52 }])
      .mockResolvedValueOnce([{ move: "e2e4", multipv: 1, scoreType: "mate", score: -3 }]);
    const { result } = renderHook(() => useAtomicDbAnalysis(fen, { lineCount: 1 }));
    await waitFor(() => expect(result.current.result?.position?.moves[0]?.mate).toBe(-3));
    expect(getAtomicDbPositionEvaluation(result.current.result?.position ?? null, fen)).toEqual({
      type: "centipawns",
      value: -10_000,
    });
  });

  it("uses Stockfish after two seconds and discards its search when AtomicDB wins or the board changes", async () => {
    vi.useFakeTimers();
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 625";
    const nextFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 625";
    const fetches: Array<(response: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => fetches.push(resolve))),
    );
    const searches: Array<{
      signal: AbortSignal | undefined;
      progress: Parameters<typeof analyzeFairyStockfishPosition>[3];
    }> = [];
    analyzeWithEngineMock.mockImplementation((_fen, _lineCount, signal, progress) => {
      searches.push({ signal, progress });
      return new Promise(() => {});
    });
    const { result, rerender, unmount } = renderHook(
      ({ position }) =>
        useAtomicDbAnalysis(position, { debounceMs: 0, fallbackToEngine: true, lineCount: 1 }),
      { initialProps: { position: fen } },
    );
    await act(() => vi.advanceTimersByTimeAsync(1_999));
    expect(searches).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(searches).toHaveLength(1);
    act(() => searches[0]?.progress?.([{ move: "e2e4", multipv: 1, scoreType: "cp", score: 72 }]));
    expect(result.current.source).toBe("engine");
    await act(async () => fetches[0]?.(bundleResponse({ moves: [{ uci: "d2d4", score: 100 }] })));
    expect(searches[0]?.signal?.aborted).toBe(true);
    expect(result.current.source).toBe("atomicdb");

    rerender({ position: nextFen });
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(searches).toHaveLength(2);
    rerender({ position: fen });
    expect(searches[1]?.signal?.aborted).toBe(true);
    act(() => searches[1]?.progress?.([{ move: "e7e5", multipv: 1, scoreType: "cp", score: 80 }]));
    expect(result.current.result?.fen).toBe(fen);
    unmount();
  });

  it("merges a late partial AtomicDB result into the running Stockfish search", async () => {
    vi.useFakeTimers();
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 627";
    let resolveDatabase!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveDatabase = resolve;
          }),
      ),
    );
    let finishEngine!: (
      candidates: Awaited<ReturnType<typeof analyzeFairyStockfishPosition>>,
    ) => void;
    let signal: AbortSignal | undefined;
    const candidates = [
      { move: "e2e4", multipv: 1, scoreType: "cp", score: 75 },
      { move: "g1f3", multipv: 2, scoreType: "cp", score: 60 },
    ] as const;
    analyzeWithEngineMock.mockImplementation((_fen, _count, searchSignal, progress) => {
      signal = searchSignal;
      progress?.([...candidates]);
      return new Promise((resolve) => {
        finishEngine = resolve;
      });
    });
    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, { debounceMs: 0, fallbackToEngine: true, lineCount: 2 }),
    );
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(result.current.source).toBe("engine");
    await act(async () =>
      resolveDatabase(bundleResponse({ moves: [{ uci: "d2d4", score: 100 }] })),
    );
    expect(result.current.source).toBe("mixed");
    expect(result.current.result?.position?.moves.map((move) => move.uci)).toEqual([
      "d2d4",
      "e2e4",
    ]);
    expect(analyzeWithEngineMock).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(false);
    await act(async () => finishEngine([{ ...candidates[0], score: 82 }, candidates[1]]));
    expect(result.current.status).toBe("ready");
    expect(result.current.result?.position?.moves[1]?.score).toBe(82);
  });

  it("fills and extends an AtomicDB mate row that has missing evaluations", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        bundleResponse({
          key: "partially-analyzed-position",
          status: "BLACK_WIN",
          score: -10_000,
          best_move: "e2e4",
          moves: [
            {
              uci: "e2e4",
              status: "BLACK_WIN",
              closure: "MATE_PV",
              score: -10_000,
              point: -9_993,
            },
            { uci: "d2d4", status: "UNKNOWN" },
          ],
        }),
      ),
    );
    analyzeWithEngineMock.mockResolvedValue([
      {
        move: "e2e4",
        multipv: 1,
        scoreType: "mate",
        score: -4,
        depth: 20,
        principalVariation: ["e2e4", "e7e5"],
      },
      {
        move: "d2d4",
        multipv: 2,
        scoreType: "cp",
        score: -850,
        depth: 20,
        principalVariation: ["d2d4", "d7d5"],
      },
    ]);

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, {
        debounceMs: 0,
        fallbackToEngine: true,
        lineCount: 2,
        plyCount: 2,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(analyzeWithEngineMock).toHaveBeenCalledWith(
      fen,
      2,
      expect.any(AbortSignal),
      expect.any(Function),
      "atomic-stockfish",
      expect.objectContaining({ candidateLimit: 5 }),
    );
    expect(result.current.source).toBe("mixed");
    expect(result.current.engine).toBe("atomic-stockfish");
    expect(result.current.result?.position?.moves).toEqual([
      expect.objectContaining({ uci: "e2e4", score: -10_000 }),
      expect.objectContaining({ uci: "d2d4", origin: "engine", score: -850 }),
    ]);
    expect(result.current.principalVariations.e2e4).toEqual(["e2e4", "e7e5"]);
  });

  it("replaces unknown non-mating AtomicDB rows with Atomic-Stockfish evaluations", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        bundleResponse({
          key: "partially-analyzed-position",
          status: "UNKNOWN",
          score: 80,
          best_move: "e2e4",
          moves: [
            { uci: "e2e4", status: "UNKNOWN", score: 80 },
            { uci: "d2d4", status: "UNKNOWN" },
          ],
        }),
      ),
    );
    analyzeWithEngineMock.mockResolvedValue([
      {
        move: "e2e4",
        multipv: 1,
        scoreType: "cp",
        score: 75,
        depth: 18,
        principalVariation: ["e2e4", "e7e5"],
      },
      {
        move: "d2d4",
        multipv: 2,
        scoreType: "cp",
        score: 60,
        depth: 18,
        principalVariation: ["d2d4", "d7d5"],
      },
    ]);

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, {
        debounceMs: 0,
        fallbackToEngine: true,
        lineCount: 2,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(analyzeWithEngineMock).toHaveBeenCalledWith(
      fen,
      2,
      expect.any(AbortSignal),
      expect.any(Function),
      "atomic-stockfish",
      expect.objectContaining({ candidateLimit: 5 }),
    );
    expect(result.current.source).toBe("mixed");
    expect(result.current.result?.position?.moves).toEqual([
      expect.objectContaining({ uci: "e2e4", score: 80 }),
      expect.objectContaining({ uci: "d2d4", origin: "engine", score: 60 }),
    ]);
  });

  it("publishes live Atomic-Stockfish lines before the timed search finishes", async () => {
    const fen = "8/8/8/8/3k4/8/1K6/7R w - - 3 71";
    let publishProgress: Parameters<typeof analyzeFairyStockfishPosition>[3];
    let finishAnalysis:
      ((value: Awaited<ReturnType<typeof analyzeFairyStockfishPosition>>) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseFor(0)));
    analyzeWithEngineMock.mockImplementation((_fen, _lineCount, _signal, onProgress) => {
      publishProgress = onProgress;
      return new Promise((resolve) => {
        finishAnalysis = resolve;
      });
    });

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, {
        debounceMs: 0,
        fallbackToEngine: true,
        lineCount: 1,
        plyCount: 3,
      }),
    );
    await waitFor(() => expect(analyzeWithEngineMock).toHaveBeenCalledOnce());

    act(() => {
      publishProgress?.([
        {
          move: "h1h4",
          multipv: 1,
          scoreType: "cp",
          score: 125,
          depth: 7,
          principalVariation: ["h1h4", "d4e5", "h4h5"],
        },
      ]);
    });

    await waitFor(() => expect(result.current.result?.fen).toBe(fen));
    expect(result.current.status).toBe("loading");
    expect(result.current.source).toBe("engine");
    expect(result.current.result?.position?.moves[0]).toMatchObject({
      uci: "h1h4",
      nodeBackedPlies: null,
      searchDepth: 7,
    });

    await act(async () => {
      finishAnalysis?.([
        {
          move: "h1h4",
          multipv: 1,
          scoreType: "cp",
          score: 180,
          depth: 16,
          principalVariation: ["h1h4", "d4e5", "h4h5"],
        },
      ]);
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.result?.position?.score).toBe(180);
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

    const { result, rerender } = renderHook(
      ({ fen }) => useAtomicDbAnalysis(fen, { debounceMs: 0 }),
      { initialProps: { fen: FIRST_FEN } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.result?.fen).toBe(FIRST_FEN);

    rerender({ fen: SECOND_FEN });
    expect(result.current.status).toBe("loading");
    expect(result.current.result?.fen).toBe(FIRST_FEN);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveSecondRequest?.(responseFor(-300));
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.result?.fen).toBe(SECOND_FEN);
  });

  it("keeps the next position labeled AtomicDB until an engine fallback is needed", async () => {
    const firstFen = "8/8/8/8/8/8/1KPP2pp/7k w - - 4 71";
    const secondFen = "8/8/8/8/8/8/1KPP2pp/7k b - - 5 71";
    let resolveSecondAtomicDbRequest: ((response: Response) => void) | undefined;
    let resolveSecondAnalysis:
      ((value: Awaited<ReturnType<typeof analyzeFairyStockfishPosition>>) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseFor(0))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecondAtomicDbRequest = resolve;
          }),
      );
    vi.stubGlobal("fetch", fetchMock);
    analyzeWithEngineMock
      .mockResolvedValueOnce([
        {
          move: "b2c3",
          multipv: 1,
          scoreType: "cp",
          score: 510,
          depth: 16,
          principalVariation: ["b2c3"],
        },
      ])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondAnalysis = resolve;
          }),
      );

    const { result, rerender } = renderHook(
      ({ fen }) =>
        useAtomicDbAnalysis(fen, {
          debounceMs: 0,
          fallbackToEngine: true,
          lineCount: 1,
        }),
      { initialProps: { fen: firstFen } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.result?.fen).toBe(firstFen);
    expect(result.current.result?.position?.score).toBe(510);

    rerender({ fen: secondFen });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe("loading");
    expect(result.current.source).toBe("atomicdb");
    expect(result.current.result?.fen).toBe(firstFen);
    expect(result.current.result?.position?.score).toBe(510);
    expect(analyzeWithEngineMock).toHaveBeenCalledOnce();

    await act(async () => {
      resolveSecondAtomicDbRequest?.(responseFor(0));
    });
    await waitFor(() => expect(analyzeWithEngineMock).toHaveBeenCalledTimes(2));
    expect(result.current.source).toBe("engine");

    await act(async () => {
      resolveSecondAnalysis?.([
        {
          move: "h1g2",
          multipv: 1,
          scoreType: "cp",
          score: -240,
          depth: 15,
          principalVariation: ["h1g2"],
        },
      ]);
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.result?.fen).toBe(secondFen);
    expect(result.current.result?.position?.score).toBe(-240);
  });

  it("builds the top line from each child position's current best move", async () => {
    const startingFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 631";
    const fetchMock = vi.fn().mockResolvedValue(
      bundleResponse(
        {
          status: "UNKNOWN",
          best_move: "g1f3",
          moves: [
            { uci: "g1f3", status: "UNKNOWN", score: 1100 },
            { uci: "g1h3", status: "UNKNOWN", score: 786 },
          ],
        },
        {
          g1f3: ["g1f3", "f7f6", "b1c3"],
          g1h3: ["g1h3", "e7e6", "e2e4"],
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(startingFen, { debounceMs: 0, lineCount: 2, plyCount: 3 }),
    );

    await waitFor(() => {
      expect(result.current.principalVariations.g1f3).toEqual(["g1f3", "f7f6", "b1c3"]);
      expect(result.current.principalVariations.g1h3).toEqual(["g1h3", "e7e6", "e2e4"]);
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]![0]), "https://example.test");
    expect(requestedUrl.searchParams.get("line_count")).toBe("2");
    expect(requestedUrl.searchParams.get("ply_count")).toBe("3");
  });

  it("keeps AtomicDB root evaluations while replacing its follow-ups with engine lines", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 17 37";
    const position = {
      status: "UNKNOWN",
      score: 110,
      best_move: "e2e4",
      moves: [{ uci: "e2e4", status: "UNKNOWN", score: 110 }],
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(bundleResponse(position, { e2e4: ["e2e4", "f7f6"] })),
      );
    vi.stubGlobal("fetch", fetchMock);
    analyzeWithEngineMock.mockResolvedValue([
      {
        move: "e2e4",
        multipv: 1,
        scoreType: "cp",
        score: 25,
        principalVariation: ["e2e4", "e7e5", "g1f3"],
      },
    ]);

    const { result, rerender } = renderHook(
      ({ atomicDbFollowUps }) =>
        useAtomicDbAnalysis(fen, {
          atomicDbFollowUps,
          debounceMs: 0,
          fallbackToEngine: true,
          lineCount: 1,
        }),
      { initialProps: { atomicDbFollowUps: false } },
    );

    await waitFor(() => {
      expect(result.current.principalVariations.e2e4).toEqual(["e2e4", "e7e5", "g1f3"]);
    });
    expect(result.current.result?.position?.moves[0]).toMatchObject({
      uci: "e2e4",
      score: 110,
      variationSource: "engine",
    });
    expect(analyzeWithEngineMock).toHaveBeenCalledExactlyOnceWith(
      fen,
      1,
      expect.any(AbortSignal),
      undefined,
      "atomic-stockfish",
      { searchMoves: ["e2e4"], candidateLimit: 1 },
    );
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]![0]), "https://example.test");
    expect(requestedUrl.searchParams.get("ply_count")).toBe("1");

    rerender({ atomicDbFollowUps: true });
    await waitFor(() => {
      expect(result.current.principalVariations.e2e4).toEqual(["e2e4", "f7f6"]);
    });
    expect(analyzeWithEngineMock).toHaveBeenCalledOnce();
  });

  it("keeps bundled follow-up moves visible while refreshing a child position", async () => {
    const parentFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 21 40";
    const childFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 40";
    let resolveChildRefresh: ((response: Response) => void) | undefined;
    const jsonResponse = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = new URL(String(input), "https://example.test");
      const requestedFen = url.searchParams.get("fen");
      if (requestedFen === parentFen) {
        return Promise.resolve(
          jsonResponse({
            position: {
              status: "UNKNOWN",
              best_move: "e2e4",
              moves: [{ uci: "e2e4", status: "UNKNOWN", score: 80 }],
            },
            lines: { e2e4: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"] },
            positions: {
              [childFen]: {
                status: "WHITE_WIN",
                closure: "MATE_PV",
                best_move: "e7e5",
                score: -10_000,
              },
            },
          }),
        );
      }
      if (requestedFen === childFen) {
        return new Promise<Response>((resolve) => {
          resolveChildRefresh = resolve;
        });
      }
      throw new Error(`Unexpected AtomicDB request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ fen }) => useAtomicDbAnalysis(fen, { debounceMs: 0, lineCount: 1, plyCount: 5 }),
      { initialProps: { fen: parentFen } },
    );
    await waitFor(() =>
      expect(result.current.principalVariations.e2e4).toEqual([
        "e2e4",
        "e7e5",
        "g1f3",
        "b8c6",
        "f1c4",
      ]),
    );

    rerender({ fen: childFen });
    await waitFor(() => expect(resolveChildRefresh).toBeTypeOf("function"));
    expect(result.current.status).toBe("loading");
    expect(result.current.result?.fen).toBe(childFen);
    expect(result.current.result?.position?.moves.map((move) => move.uci)).toEqual(["e7e5"]);
    expect(result.current.result?.position).toMatchObject({ outcome: "UNKNOWN", score: null });
    expect(result.current.principalVariations.e7e5).toEqual(["e7e5", "g1f3", "b8c6", "f1c4"]);

    await act(async () => {
      resolveChildRefresh?.(
        jsonResponse({
          position: {
            status: "UNKNOWN",
            best_move: "e7e5",
            moves: [
              { uci: "e7e5", status: "UNKNOWN", score: 70 },
              { uci: "c7c5", status: "UNKNOWN", score: 60 },
            ],
          },
          lines: { e7e5: ["e7e5", "g1f3"] },
          positions: {},
        }),
      );
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.result?.position?.moves.map((move) => move.uci)).toEqual([
      "e7e5",
      "c7c5",
    ]);
    expect(result.current.principalVariations.e7e5).toEqual(["e7e5", "g1f3"]);
  });

  it("refreshes the bundled analysis when the visible line count increases", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 10 20";
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = new URL(String(input), "https://example.test");
      const lineCount = Number(url.searchParams.get("line_count"));
      const moves = ["g1f3", "g1h3", "e2e3"].slice(0, lineCount);
      return Promise.resolve(
        bundleResponse(
          {
            status: "UNKNOWN",
            best_move: "g1f3",
            moves: ["g1f3", "g1h3", "e2e3"].map((uci) => ({
              uci,
              status: "UNKNOWN",
              score: 500,
            })),
          },
          Object.fromEntries(moves.map((move) => [move, [move, "f7f6"]])),
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ lineCount }) => useAtomicDbAnalysis(fen, { debounceMs: 0, lineCount }),
      { initialProps: { lineCount: 2 } },
    );
    await waitFor(() => expect(result.current.principalVariations.g1h3).toEqual(["g1h3", "f7f6"]));

    rerender({ lineCount: 3 });
    await waitFor(() => expect(result.current.principalVariations.e2e3).toEqual(["e2e3", "f7f6"]));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const expandedUrl = new URL(String(fetchMock.mock.calls[1]![0]), "https://example.test");
    expect(expandedUrl.searchParams.get("line_count")).toBe("3");

    rerender({ lineCount: 1 });
    await waitFor(() => expect(Object.keys(result.current.principalVariations)).toEqual(["g1f3"]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancels obsolete AtomicDB requests and only fetches the settled position during rapid navigation", async () => {
    vi.useFakeTimers();
    const initial = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 651";
    const intermediate = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 651";
    const settled = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 652";
    const requests: Array<{ fen: string | null; signal: AbortSignal | null | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, options?: RequestInit) => {
        requests.push({
          fen: new URL(input, "https://example.test").searchParams.get("fen"),
          signal: options?.signal,
        });
        return new Promise<Response>(() => {});
      }),
    );
    const { rerender } = renderHook(({ fen }) => useAtomicDbAnalysis(fen), {
      initialProps: { fen: initial },
    });
    expect(requests.map((request) => request.fen)).toEqual([initial]);
    rerender({ fen: intermediate });
    await act(() => vi.advanceTimersByTimeAsync(80));
    expect(requests[0]?.signal?.aborted).toBe(true);
    rerender({ fen: settled });
    await act(() => vi.advanceTimersByTimeAsync(159));
    expect(requests.map((request) => request.fen)).toEqual([initial]);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(requests.map((request) => request.fen)).toEqual([initial, settled]);
  });

  it("honors AtomicDB's retry delay on subsequent positions", async () => {
    vi.useFakeTimers();
    const initial = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 661";
    const next = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 661";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 429,
          headers: { "Retry-After": "3" },
        }),
      )
      .mockResolvedValueOnce(responseFor(100));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(
      ({ fen }) => useAtomicDbAnalysis(fen, { debounceMs: 0 }),
      {
        initialProps: { fen: initial },
      },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.status).toBe("error");
    rerender({ fen: next });
    await act(() => vi.advanceTimersByTimeAsync(2_999));
    expect(fetchMock).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1));
    rerender({ fen: initial });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("ready");
  });

  it("makes no position or continuation requests while playback is suspended", async () => {
    const sourceFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 9";
    const destinationFen = "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 5 9";
    const rootResponse = bundleResponse(
      {
        status: "UNKNOWN",
        best_move: "g1f3",
        moves: [{ uci: "g1f3", status: "UNKNOWN", score: 500 }],
      },
      { g1f3: ["g1f3"] },
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rootResponse)
      .mockResolvedValueOnce(responseFor(300));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ fen, suspended }) => useAtomicDbAnalysis(fen, { debounceMs: 0, lineCount: 1, suspended }),
      { initialProps: { fen: sourceFen, suspended: false } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ fen: sourceFen, suspended: true });
    rerender({ fen: destinationFen, suspended: true });
    await act(async () => Promise.resolve());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ fen: destinationFen, suspended: false });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("deduplicates the development StrictMode analysis request", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 8 14";
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAtomicDbAnalysis(fen, { debounceMs: 0, lineCount: 1 }), {
      wrapper: StrictMode,
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () =>
      resolveRequest?.(
        bundleResponse({ status: "UNKNOWN", score: 500, best_move: null, moves: [] }),
      ),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it("invalidates ready moves immediately when speed changes and aborts the superseded search", async () => {
  const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const signals: AbortSignal[] = [];
  const completions: Array<
    (candidates: Awaited<ReturnType<typeof analyzeFairyStockfishPosition>>) => void
  > = [];
  analyzeWithEngineMock.mockImplementation((_fen, _count, signal) => {
    signals.push(signal!);
    return new Promise((resolve) => completions.push(resolve));
  });
  const statuses: string[] = [];
  const { result, rerender, unmount } = renderHook(
    ({ time }) => {
      const state = useAtomicDbAnalysis(fen, {
        atomicDbEnabled: false,
        fallbackToEngine: true,
        engineThinkTimeMs: time,
      });
      statuses.push(state.status);
      return state;
    },
    { initialProps: { time: 150 } },
  );
  await act(async () => {
    completions[0]!([{ move: "e2e4", multipv: 1, scoreType: "cp", score: 10 }]);
  });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  const count = statuses.length;
  rerender({ time: 6000 });
  expect(statuses[count]).toBe("loading");
  expect(signals[0]!.aborted).toBe(true);
  expect(result.current.status).toBe("loading");
  await act(async () => {
    completions[1]!([{ move: "d2d4", multipv: 1, scoreType: "cp", score: 30 }]);
  });
  await waitFor(() => expect(result.current.result?.position?.bestMove).toBe("d2d4"));
  unmount();
  expect(signals[1]!.aborted).toBe(true);
  analyzeWithEngineMock.mockReset();
});
