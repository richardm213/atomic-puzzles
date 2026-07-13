import { act, fireEvent, render } from "@testing-library/react";
import type { ComponentProps } from "react";

import type { ChessboardState } from "../../types/chessboard";
import { Chessboard } from "./Chessboard";

const mocks = vi.hoisted(() => ({
  config: null as null | {
    movable?: { events?: { after?: (orig: string, dest: string) => void } };
  },
  set: vi.fn(),
}));

vi.mock("@lichess-org/chessground", () => ({
  Chessground: vi.fn((_element, config) => {
    mocks.config = config;
    return {
      set: mocks.set,
      setAutoShapes: vi.fn(),
    };
  }),
}));

vi.mock("../../context/AppSettings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../context/AppSettings")>();
  return {
    ...actual,
    useAppSettings: () => ({
      pieceSet: "cburnett",
      boardTheme: "brown",
      customLightSquare: "#f0d9b5",
      customDarkSquare: "#b58863",
      boardColorOverrideTheme: "",
      boardOverrideLightSquare: "",
      boardOverrideDarkSquare: "",
    }),
  };
});

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const renderBoard = (
  overrides: Partial<ComponentProps<typeof Chessboard>> = {},
): ChessboardState[] => {
  const states: ChessboardState[] = [];
  render(
    <Chessboard
      puzzleId="test"
      fen={STARTING_FEN}
      orientation="white"
      coordinates
      solution=""
      showSolution={false}
      analysisMode
      onStateChange={(state) => states.push(state)}
      {...overrides}
    />,
  );
  return states;
};

const play = (orig: string, dest: string): void => {
  act(() => mocks.config?.movable?.events?.after?.(orig, dest));
};

describe("Chessboard orchestration", () => {
  beforeEach(() => {
    mocks.config = null;
    mocks.set.mockClear();
  });

  it("does not mutate previously emitted move arrays", () => {
    const states = renderBoard();
    const initialState = states.at(-1)!;

    play("e2", "e4");

    expect(initialState.lineMoves).toEqual([]);
    expect(states.at(-1)?.lineMoves).toEqual(["e4"]);
  });

  it("reports an incorrect move in SAN notation", () => {
    vi.useFakeTimers();
    const onAttemptResolved = vi.fn();
    renderBoard({
      analysisMode: false,
      solution: "1. e4",
      onAttemptResolved,
    });

    play("d2", "d4");
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onAttemptResolved).toHaveBeenCalledWith({
      puzzleId: "test",
      puzzleCorrect: false,
      incorrectMove: "1. d4",
    });
    vi.useRealTimers();
  });

  it("clears the last-move highlight when navigating to the initial position", () => {
    renderBoard();
    play("e2", "e4");

    fireEvent.keyDown(window, { key: "ArrowLeft" });

    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ lastMove: [] }));
  });

  it("does not intercept navigation keys from interactive controls", () => {
    const states = renderBoard();
    play("e2", "e4");
    const button = document.createElement("button");
    document.body.append(button);

    fireEvent.keyDown(button, { key: "ArrowLeft" });

    expect(states.at(-1)?.lineIndex).toBe(1);
    button.remove();
  });

  it("marks a move branching from the displayed solution as personal history", () => {
    const states = renderBoard({ solution: "1. e4", showSolution: true });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    play("e7", "e5");

    expect(states.at(-1)?.viewingSolution).toBe(false);
    expect(states.at(-1)?.lineMoves).toEqual(["e4", "e5"]);
  });

  it("cycles sibling solution moves before advancing the selected option", () => {
    const states = renderBoard({ solution: "1. e4 (1. d4)", showSolution: true });
    const initialLineIndex = states.at(-1)?.solutionLineIndex;

    fireEvent.keyDown(window, { key: "ArrowDown" });
    const selectedState = states.at(-1)!;
    expect(selectedState.solutionLineIndex).not.toBe(initialLineIndex);
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(states.at(-1)?.lineIndex).toBe(1);
    expect(states.at(-1)?.lineMoves?.[0]).toBe(
      selectedState.solutionLines?.[selectedState.solutionLineIndex ?? 0]?.[0],
    );
  });

  it("keeps forward navigation on a custom branch after Backspace", () => {
    const states = renderBoard({ solution: "1. e4 e5 2. Nf3", showSolution: true });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    play("f1", "c4");
    fireEvent.keyDown(window, { key: "Backspace" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(states.at(-1)?.lineIndex).toBe(3);
    expect(states.at(-1)?.lineMoves?.[2]).toBe("Bc4");
    expect(states.at(-1)?.viewingSolution).toBe(false);
  });

  it("preserves a custom branch while switching between it and solution options", () => {
    const states = renderBoard({ solution: "1. e4 e5 2. Nf3", showSolution: true });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    play("f1", "c4");
    fireEvent.keyDown(window, { key: "Backspace" });
    fireEvent.keyDown(window, { key: "ArrowUp" });

    expect(states.at(-1)?.viewingSolution).toBe(true);
    expect(states.at(-1)?.solutionLines?.[0]?.[2]).toBe("Nf3");
    expect(states.at(-1)?.customLines?.[0]?.[2]).toBe("Bc4");

    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(states.at(-1)?.lineMoves?.[2]).toBe("Bc4");
    expect(states.at(-1)?.viewingSolution).toBe(false);
  });
});
