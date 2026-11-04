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

const responseFor = (score: number) =>
  new Response(
    JSON.stringify({
      status: "UNKNOWN",
      score,
      best_move: null,
      moves: [],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

describe("useAtomicDbAnalysis", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    analyzeWithEngineMock.mockReset();
  });

  it("uses Fairy-Stockfish directly for six-piece endgames without querying AtomicDB", async () => {
    const fen = "8/8/8/8/3k4/8/1K3P1P/6NR w - - 3 71";
    analyzeWithEngineMock.mockResolvedValue([
      {
        move: "h1h4",
        multipv: 1,
        scoreType: "mate",
        score: 9,
        depth: 18,
        principalVariation: ["h1h4", "d4e5"],
      },
    ]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, { debounceMs: 0, fallbackToEngine: true, lineCount: 1 }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(analyzeWithEngineMock).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.source).toBe("engine");
    expect(result.current.result?.position?.moves[0]).toMatchObject({
      uci: "h1h4",
      mate: 9,
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
      backedPlies: 18,
    });
    expect(result.current.principalVariations.e2e4).toEqual(["e2e4", "e7e5", "g1f3"]);
  });

  it("fills missing requested AtomicDB lines with distinct Fairy-Stockfish moves", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 12 30";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = new URL(String(input), "https://example.test");
        return Promise.resolve(
          new Response(
            JSON.stringify(
              url.searchParams.has("line_moves")
                ? { lines: { g1f3: ["g1f3", "g8f6"] }, positions: {} }
                : {
                    key: "partial-position",
                    status: "UNKNOWN",
                    score: 90,
                    best_move: "g1f3",
                    moves: [{ uci: "g1f3", status: "UNKNOWN", score: 90 }],
                  },
            ),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }),
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

  it("can analyze an engine-only position without requesting AtomicDB", async () => {
    const fen = "8/8/8/8/8/8/1K6/7k b - - 1 71";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    analyzeWithEngineMock.mockResolvedValue([
      {
        move: "h1g2",
        multipv: 1,
        scoreType: "cp",
        score: 340,
        depth: 17,
        principalVariation: ["h1g2"],
      },
    ]);

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, { debounceMs: 0, engineOnly: true, lineCount: 1 }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.source).toBe("engine");
    expect(result.current.result?.position?.moves[0]?.uci).toBe("h1g2");
  });

  it("publishes live Fairy-Stockfish lines before the timed search finishes", async () => {
    const fen = "8/8/8/8/3k4/8/1K6/7R w - - 3 71";
    let publishProgress: Parameters<typeof analyzeFairyStockfishPosition>[3];
    let finishAnalysis:
      ((value: Awaited<ReturnType<typeof analyzeFairyStockfishPosition>>) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn());
    analyzeWithEngineMock.mockImplementation((_fen, _lineCount, _signal, onProgress) => {
      publishProgress = onProgress;
      return new Promise((resolve) => {
        finishAnalysis = resolve;
      });
    });

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(fen, { debounceMs: 0, engineOnly: true, lineCount: 1, plyCount: 3 }),
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
      backedPlies: 7,
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

  it("retains the settled engine evaluation while Fairy-Stockfish analyzes the next FEN", async () => {
    const firstFen = "8/8/8/8/8/8/1K6/7k w - - 4 71";
    const secondFen = "8/8/8/8/8/8/1K6/7k b - - 5 71";
    let resolveSecondAnalysis:
      ((value: Awaited<ReturnType<typeof analyzeFairyStockfishPosition>>) => void) | undefined;
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
    await waitFor(() => expect(analyzeWithEngineMock).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe("loading");
    expect(result.current.source).toBe("engine");
    expect(result.current.result?.fen).toBe(firstFen);
    expect(result.current.result?.position?.score).toBe(510);

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
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = new URL(String(input), "https://example.test");
      if (!url.searchParams.has("line_moves")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "UNKNOWN",
              best_move: "g1f3",
              moves: [
                { uci: "g1f3", status: "UNKNOWN", score: 1100 },
                { uci: "g1h3", status: "UNKNOWN", score: 786 },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            lines: {
              g1f3: ["g1f3", "f7f6", "b1c3"],
              g1h3: ["g1h3", "e7e6", "e2e4"],
            },
            positions: {},
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() =>
      useAtomicDbAnalysis(startingFen, { debounceMs: 0, lineCount: 2, plyCount: 3 }),
    );

    await waitFor(() => {
      expect(result.current.principalVariations.g1f3).toEqual(["g1f3", "f7f6", "b1c3"]);
      expect(result.current.principalVariations.g1h3).toEqual(["g1h3", "e7e6", "e2e4"]);
    });
  });

  it("requests only uncached lines when the visible line count increases", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 10 20";
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = new URL(String(input), "https://example.test");
      const requestedMoves = url.searchParams.get("line_moves")?.split(",") ?? [];
      if (requestedMoves.length === 0) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              status: "UNKNOWN",
              best_move: "g1f3",
              moves: ["g1f3", "g1h3", "e2e3"].map((uci) => ({
                uci,
                status: "UNKNOWN",
                score: 500,
              })),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            lines: Object.fromEntries(requestedMoves.map((move) => [move, [move, "f7f6"]])),
            positions: {},
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
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

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const expandedUrl = new URL(String(fetchMock.mock.calls[2]![0]), "https://example.test");
    expect(expandedUrl.searchParams.get("line_moves")).toBe("e2e3");
  });

  it("makes no position or continuation requests while playback is suspended", async () => {
    const sourceFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 9";
    const destinationFen = "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 5 9";
    const rootResponse = new Response(
      JSON.stringify({
        status: "UNKNOWN",
        best_move: "g1f3",
        moves: [{ uci: "g1f3", status: "UNKNOWN", score: 500 }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rootResponse)
      .mockImplementationOnce(
        (_input: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted")));
          }),
      )
      .mockResolvedValueOnce(responseFor(300));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ fen, suspended }) => useAtomicDbAnalysis(fen, { debounceMs: 0, lineCount: 1, suspended }),
      { initialProps: { fen: sourceFen, suspended: false } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    rerender({ fen: sourceFen, suspended: true });
    rerender({ fen: destinationFen, suspended: true });
    await act(async () => Promise.resolve());
    expect(fetchMock).toHaveBeenCalledTimes(2);

    rerender({ fen: destinationFen, suspended: false });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it("does not request continuations when zero lines are displayed", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 6 12";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "UNKNOWN",
          best_move: "g1f3",
          moves: [{ uci: "g1f3", status: "UNKNOWN", score: 500 }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAtomicDbAnalysis(fen, { debounceMs: 0, lineCount: 0 }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates the development StrictMode root request", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 8 14";
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAtomicDbAnalysis(fen, { debounceMs: 0, lineCount: 0 }), {
      wrapper: StrictMode,
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => resolveRequest?.(responseFor(500)));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
