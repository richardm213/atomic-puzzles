import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { DEFAULT_PRACTICE_MOVE_SETTINGS } from "../lib/practice/moveSource";
import { usePracticeOpponent } from "./usePracticeOpponent";

const mocks = vi.hoisted(() => ({
  database: { moves: [] as Array<{ uci: string; games: number }>, status: "ready", error: "" },
  engine: vi.fn(),
}));
vi.mock("./useOpeningExplorer", () => ({ useOpeningExplorer: () => mocks.database }));
vi.mock("./useAtomicDbAnalysis", () => ({
  useAtomicDbAnalysis: (_fen: string, options: unknown) => {
    mocks.engine(options);
    return { status: "loading", result: null, error: "", principalVariations: {} };
  },
}));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it("keeps engine handoff on its branch, restores the database on another branch, and stays dormant during quizzes", () => {
  vi.useFakeTimers();
  const navigate = vi.fn();
  const initial = {
    available: true,
    blocked: false,
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    moves: ["e4"],
    turn: "black" as const,
    side: "white" as const,
    source: "general" as const,
    username: "",
    settings: DEFAULT_PRACTICE_MOVE_SETTINGS,
    onNavigate: navigate,
  };
  mocks.database.moves = [];
  const { result, rerender } = renderHook((props) => usePracticeOpponent(props), {
    initialProps: initial,
  });
  act(() => result.current.toggle());
  expect(mocks.engine).toHaveBeenLastCalledWith(
    expect.objectContaining({
      enabled: true,
      fallbackToEngine: true,
      engineThinkTimeMs: 700,
      engineMaxDepth: 10,
      candidateLimit: 64,
    }),
  );
  mocks.database.moves = [{ uci: "d7d5", games: 100 }];
  rerender({
    ...initial,
    moves: ["e4", "e5", "Nf3"],
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
  });
  expect(mocks.engine).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }));
  rerender({
    ...initial,
    moves: ["d4"],
    fen: "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1",
  });
  expect(mocks.engine).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  act(() => vi.advanceTimersByTime(240));
  expect(navigate).toHaveBeenCalledWith({ type: "play", uci: "d7d5" });
  rerender({ ...initial, available: false });
  expect(result.current.running).toBe(false);
  expect(mocks.engine).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
});
