import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeFairyStockfishPosition } from "../lib/practice/fairyStockfish";
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
    );
    expect(result.current.source).toBe("engine");
    expect(result.current.engine).toBe("atomic-stockfish");
    expect(result.current.result?.position?.moves[0]).toMatchObject({
      uci: "g1f3",
      score: 85,
    });
  });

  it("falls back to Fairy-Stockfish only after AtomicDB returns no analyzed moves", async () => {
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
    expect(analyzeWithEngineMock).toHaveBeenCalledOnce();
    expect(result.current.source).toBe("engine");
    expect(result.current.result?.position?.moves[0]).toMatchObject({
      uci: "e2e4",
      score: 82,
      nodeBackedPlies: null,
      searchDepth: 18,
    });
    expect(result.current.principalVariations.e2e4).toEqual(["e2e4", "e7e5", "g1f3"]);
  });

  it("fills missing requested AtomicDB lines with distinct Fairy-Stockfish moves", async () => {
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

  it("uses Atomic-Stockfish when AtomicDB's sole evaluation is a forced mate loss", async () => {
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
        principalVariation: ["e2e4"],
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
    );
    expect(result.current.source).toBe("mixed");
    expect(result.current.engine).toBe("atomic-stockfish");
    expect(result.current.result?.position?.moves).toEqual([
      expect.objectContaining({ uci: "e2e4", score: -10_000 }),
      expect.objectContaining({ uci: "d2d4", origin: "engine", score: -850 }),
    ]);
  });

  it("does not replace unknown AtomicDB rows when the sole evaluation is not a forced loss", async () => {
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

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, {
        debounceMs: 0,
        fallbackToEngine: true,
        lineCount: 2,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(analyzeWithEngineMock).not.toHaveBeenCalled();
    expect(result.current.source).toBe("atomicdb");
    expect(result.current.result?.position?.moves.map((move) => move.uci)).toEqual([
      "e2e4",
      "d2d4",
    ]);
  });

  it("publishes live Fairy-Stockfish lines before the timed search finishes", async () => {
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
    const startingFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
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
