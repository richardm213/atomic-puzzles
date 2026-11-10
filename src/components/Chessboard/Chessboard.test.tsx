import { act, fireEvent, render, screen } from "@testing-library/react";
import { INITIAL_FEN as STARTING_FEN } from "chessops/fen";
import type { ComponentProps } from "react";

import type { ChessboardState } from "../../types/chessboard";
import { Chessboard } from "./Chessboard";

const mocks = vi.hoisted(() => ({
  config: null as null | {
    coordinatesOnSquares?: boolean;
    movable?: { events?: { after?: (orig: string, dest: string) => void } };
    premovable?: { enabled?: boolean };
  },
  set: vi.fn(),
  setAutoShapes: vi.fn(),
  playPremove: vi.fn(),
  cancelPremove: vi.fn(),
  showBoardCoordinates: true,
  showBestMoveArrow: false,
  setShowBestMoveArrow: vi.fn(),
  enableBoardPremoves: true,
  boardSoundsEnabled: false,
  playBoardMoveSound: vi.fn(),
}));

vi.mock("@lichess-org/chessground", () => ({
  Chessground: vi.fn((_element, config) => {
    mocks.config = config;
    return {
      state: { drawable: { brushes: {} } },
      set: mocks.set,
      setAutoShapes: mocks.setAutoShapes,
      playPremove: mocks.playPremove,
      cancelPremove: mocks.cancelPremove,
      destroy: vi.fn(),
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
      showBoardCoordinates: mocks.showBoardCoordinates,
      showBestMoveArrow: mocks.showBestMoveArrow,
      setShowBestMoveArrow: mocks.setShowBestMoveArrow,
      enableBoardPremoves: mocks.enableBoardPremoves,
      boardSoundsEnabled: mocks.boardSoundsEnabled,
      boardSoundSet: "standard",
    }),
  };
});

vi.mock("../../lib/boardSounds/boardSounds", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/boardSounds/boardSounds")>();
  return { ...actual, playBoardMoveSound: mocks.playBoardMoveSound };
});

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
    mocks.setAutoShapes.mockClear();
    mocks.playPremove.mockClear();
    mocks.cancelPremove.mockClear();
    mocks.showBoardCoordinates = true;
    mocks.showBestMoveArrow = false;
    mocks.enableBoardPremoves = true;
    mocks.boardSoundsEnabled = false;
    mocks.playBoardMoveSound.mockClear();
  });

  it("plays the opponent move before enabling puzzle input without adding a solution ply", () => {
    vi.useFakeTimers();
    try {
      const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
      const onIntroEnd = vi.fn();
      const onAttemptResolved = vi.fn();
      const states = renderBoard({
        fen,
        orientation: "black",
        analysisMode: false,
        intro: { beforeFen: STARTING_FEN, san: "e4", uci: "e2e4" },
        solution: "1... e5",
        onIntroEnd,
        onAttemptResolved,
      });
      expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ fen: STARTING_FEN }));
      play("e7", "e5");
      act(() => vi.advanceTimersByTime(549));
      const replayPosition = expect.objectContaining({ fen, lastMove: ["e2", "e4"] });
      expect(mocks.set).not.toHaveBeenCalledWith(replayPosition);
      act(() => vi.advanceTimersByTime(1));
      expect(mocks.set).toHaveBeenCalledWith(replayPosition);
      expect(states).toHaveLength(0);
      play("e7", "e5");
      expect(onIntroEnd).not.toHaveBeenCalled();
      expect(onAttemptResolved).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(120));
      expect(onIntroEnd).toHaveBeenCalledWith(670, true);
      expect(states.at(-1)?.lineMoves).toEqual([]);
      play("e7", "e5");
      act(() => vi.advanceTimersByTime(250));
      expect(onAttemptResolved).toHaveBeenCalledWith(expect.objectContaining({ puzzleCorrect: true }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the hidden position for blind clicks, including after the opponent moves", () => {
    vi.useFakeTimers();
    try {
      const states = renderBoard({
        blindFen: STARTING_FEN,
        fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
        analysisMode: false,
        solution: "2. e5 c4 3. e6",
      });
      const square = (name: string) => screen.getByRole("button", { name, exact: true });

      fireEvent.click(square("e2"));
      expect(square("e2")).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(square("e4"));
      expect(square("e4")).toHaveAttribute("aria-pressed", "true");
      fireEvent.click(square("e6"));
      expect(states.at(-1)).toMatchObject({ error: "Illegal move", lineMoves: [] });
      fireEvent.click(square("e4"));
      fireEvent.click(square("e5"));
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(states.at(-1)).toMatchObject({ error: "", lineMoves: ["e5", "c4"] });

      fireEvent.click(square("e4"));
      expect(square("e4")).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(square("e5"));
      fireEvent.click(square("e6"));
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(states.at(-1)?.solved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not mutate previously emitted move arrays", () => {
    const states = renderBoard();
    const initialState = states.at(-1)!;

    play("e2", "e4");

    expect(initialState.lineMoves).toEqual([]);
    expect(states.at(-1)?.lineMoves).toEqual(["e4"]);
  });

  it("plays board sounds only after the muted-by-default preference is enabled", () => {
    renderBoard();
    play("e2", "e4");
    expect(mocks.playBoardMoveSound).not.toHaveBeenCalled();

    mocks.boardSoundsEnabled = true;
    renderBoard();
    play("e2", "e4");
    expect(mocks.playBoardMoveSound).toHaveBeenLastCalledWith("standard", {
      san: "e4",
      uci: "e2e4",
      isCheck: false,
    });
  });

  it("keeps ? annotations visible in displayed solution lines", () => {
    const states = renderBoard({ solution: "1. e4 (1. d4?)" });

    expect(states.at(-1)?.solutionLines).toEqual(expect.arrayContaining([["e4"], ["d4?"]]));
  });

  it("configures legal destinations for an analysis board", () => {
    renderBoard();

    const movableCalls = mocks.set.mock.calls.map(([config]) => config?.movable).filter(Boolean);
    const movable = movableCalls.at(-1);

    expect(movable?.color).toBe("white");
    expect(movable?.dests.get("e2")).toEqual(expect.arrayContaining(["e3", "e4"]));
  });

  it("uses the threat arrow instead of the ordinary move preview", () => {
    renderBoard({ threatMove: "e7e5", previewMove: "e2e4" });

    expect(mocks.setAutoShapes).toHaveBeenLastCalledWith([
      expect.objectContaining({ orig: "e7", dest: "e5", brush: "threat" }),
    ]);
  });

  it("only draws ranked engine arrows when enabled and gives previews priority", () => {
    const board = (engineMoves: string[], previewMove?: string) => (
      <Chessboard
        puzzleId="test"
        fen={STARTING_FEN}
        orientation="white"
        coordinates
        solution=""
        showSolution={false}
        engineMoves={engineMoves}
        previewMove={previewMove}
      />
    );
    const { rerender } = render(board(["g1f3"]));
    expect(mocks.setAutoShapes).toHaveBeenLastCalledWith([]);

    mocks.showBestMoveArrow = true;
    rerender(board(["e2e4", "g1f3"]));
    expect(mocks.setAutoShapes).toHaveBeenLastCalledWith([
      expect.objectContaining({ orig: "g1", dest: "f3", brush: "otherEngineMove" }),
      expect.objectContaining({ orig: "e2", dest: "e4", brush: "bestMove" }),
    ]);

    rerender(board(["e2e4", "g1f3"], "d2d4"));
    expect(mocks.setAutoShapes).toHaveBeenLastCalledWith([
      expect.objectContaining({ orig: "d2", dest: "d4", brush: "paleBlue" }),
    ]);
  });

  it("keeps the player color movable and plays a premove after the opponent replies", () => {
    const boardProps: ComponentProps<typeof Chessboard> = {
      puzzleId: "practice",
      fen: STARTING_FEN,
      orientation: "white",
      coordinates: true,
      solution: "",
      showSolution: false,
      analysisMode: true,
      premoveColor: "white",
      premovesEnabled: true,
    };
    const { rerender } = render(<Chessboard {...boardProps} />);

    expect(mocks.config?.premovable?.enabled).toBe(true);
    mocks.playPremove.mockClear();

    rerender(<Chessboard {...boardProps} solutionNavigation={{ type: "play", uci: "e2e4" }} />);
    expect(mocks.playPremove).not.toHaveBeenCalled();

    rerender(<Chessboard {...boardProps} solutionNavigation={{ type: "play", uci: "e7e5" }} />);
    expect(mocks.playPremove).toHaveBeenCalledTimes(1);
  });

  it("disables premoves when the board preference is off", () => {
    mocks.enableBoardPremoves = false;
    renderBoard({ premoveColor: "white", premovesEnabled: true });

    expect(mocks.config?.premovable?.enabled).toBe(false);
  });

  it("only accepts continuations contained in the solution when restricted", () => {
    const states = renderBoard({
      solution: "1. e4 e5",
      restrictMovesToSolution: true,
    });

    const movableCalls = mocks.set.mock.calls.map(([config]) => config?.movable).filter(Boolean);
    expect(movableCalls.at(-1)?.dests.get("e2")).toEqual(["e4"]);
    expect(movableCalls.at(-1)?.dests.has("d2")).toBe(false);

    play("d2", "d4");
    expect(states.at(-1)?.lineMoves).toEqual([]);

    play("e2", "e4");
    expect(states.at(-1)?.lineMoves).toEqual(["e4"]);

    play("e7", "e6");
    expect(states.at(-1)?.lineMoves).toEqual(["e4"]);

    play("e7", "e5");
    expect(states.at(-1)?.lineMoves).toEqual(["e4", "e5"]);
  });

  it("does not reset an analysis move requested through navigation", () => {
    const states: ChessboardState[] = [];
    const boardProps: ComponentProps<typeof Chessboard> = {
      puzzleId: "practice",
      fen: STARTING_FEN,
      orientation: "white",
      coordinates: true,
      solution: "",
      showSolution: false,
      analysisMode: true,
      onStateChange: (state) => states.push(state),
    };
    const { rerender } = render(<Chessboard {...boardProps} />);

    rerender(<Chessboard {...boardProps} solutionNavigation={{ type: "play", uci: "e2e4" }} />);

    expect(states.at(-1)?.lineMoves).toEqual(["e4"]);
    expect(states.at(-1)?.fen).toContain("4P3");
  });

  it("plays an analysis variation through the requested ply", () => {
    vi.useFakeTimers();
    const states: ChessboardState[] = [];
    const boardProps: ComponentProps<typeof Chessboard> = {
      puzzleId: "analysis-line",
      fen: STARTING_FEN,
      orientation: "white",
      coordinates: true,
      solution: "",
      showSolution: false,
      analysisMode: true,
      onStateChange: (state) => states.push(state),
    };
    const { rerender } = render(<Chessboard {...boardProps} />);

    rerender(
      <Chessboard
        {...boardProps}
        solutionNavigation={{ type: "line", ucis: ["g1f3", "f7f6", "e2e3"] }}
      />,
    );

    expect(states.at(-1)?.lineMoves).toEqual(["Nf3"]);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(states.at(-1)?.lineMoves).toEqual(["Nf3", "f6"]);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(states.at(-1)?.lineMoves).toEqual(["Nf3", "f6", "e3"]);
    expect(states.at(-1)?.turn).toBe("black");
    vi.useRealTimers();
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
      correctMove: null,
    });
    vi.useRealTimers();
  });

  it("reports only the first divergent move for a correct alternate solution", () => {
    vi.useFakeTimers();
    const onAttemptResolved = vi.fn();
    renderBoard({
      analysisMode: false,
      solution: "1. e4 (1. d4)",
      onAttemptResolved,
    });

    play("d2", "d4");
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onAttemptResolved).toHaveBeenCalledWith({
      puzzleId: "test",
      puzzleCorrect: true,
      incorrectMove: null,
      correctMove: "1. d4",
    });
    vi.useRealTimers();
  });

  it("accepts an unmarked alternative alongside a questionable alternative", () => {
    vi.useFakeTimers();
    const onAttemptResolved = vi.fn();
    const states = renderBoard({
      analysisMode: false,
      solution: "1. e4 (1. d4) (1. c4?)",
      onAttemptResolved,
    });

    play("d2", "d4");
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(states.at(-1)).toMatchObject({ solved: true, showRetryMove: false });
    expect(onAttemptResolved).toHaveBeenCalledWith({
      puzzleId: "test",
      puzzleCorrect: true,
      incorrectMove: null,
      correctMove: "1. d4",
    });
    vi.useRealTimers();
  });

  it("reserves try-again feedback for an alternative marked with ?", () => {
    vi.useFakeTimers();
    const onAttemptResolved = vi.fn();
    const states = renderBoard({
      analysisMode: false,
      solution: "1. e4 (1. d4) (1. c4?)",
      onAttemptResolved,
    });

    play("c2", "c4");
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(states.at(-1)).toMatchObject({ solved: false, showRetryMove: true });
    expect(onAttemptResolved).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("automatically retries a non-solution move that creates twofold repetition", () => {
    vi.useFakeTimers();
    const onAttemptResolved = vi.fn();
    const states = renderBoard({
      puzzleId: 333,
      fen: "1k1r4/pp1b1Rpp/2ppp3/1B6/1b1P3P/2N5/PPP5/6K1 w - - 3 20",
      analysisMode: false,
      solution: "20. Bxc6 Rd7 21. Nb5 (21. Rf8+ Rd8 22. Nb5 a5 23. Rf7)",
      onAttemptResolved,
    });

    play("b5", "c6");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    play("f7", "f8");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    play("f8", "f7");
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(states.at(-1)).toMatchObject({
      solved: false,
      showRetryMove: true,
      showWrongMove: false,
      status: "Try again",
    });
    expect(onAttemptResolved).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("reports the first move when the main solution is played", () => {
    vi.useFakeTimers();
    const onAttemptResolved = vi.fn();
    renderBoard({
      analysisMode: false,
      solution: "1. e4 (1. d4)",
      onAttemptResolved,
    });

    play("e2", "e4");
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onAttemptResolved).toHaveBeenCalledWith({
      puzzleId: "test",
      puzzleCorrect: true,
      incorrectMove: null,
      correctMove: "1. e4",
    });
    vi.useRealTimers();
  });

  it("does not report a line move when the puzzle has only one solution", () => {
    vi.useFakeTimers();
    const onAttemptResolved = vi.fn();
    renderBoard({
      analysisMode: false,
      solution: "1. e4",
      onAttemptResolved,
    });

    play("e2", "e4");
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onAttemptResolved).toHaveBeenCalledWith({
      puzzleId: "test",
      puzzleCorrect: true,
      incorrectMove: null,
      correctMove: null,
    });
    vi.useRealTimers();
  });

  it("numbers a later correct divergence from its actual solution ply", () => {
    vi.useFakeTimers();
    const onAttemptResolved = vi.fn();
    renderBoard({
      analysisMode: false,
      solution: "1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4)",
      onAttemptResolved,
    });

    play("e2", "e4");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    play("g1", "f3");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    play("f1", "c4");
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onAttemptResolved).toHaveBeenLastCalledWith({
      puzzleId: "test",
      puzzleCorrect: true,
      incorrectMove: null,
      correctMove: "3. Bc4",
    });
    vi.useRealTimers();
  });

  it("reports the main-line move at a later solution branch", () => {
    vi.useFakeTimers();
    const onAttemptResolved = vi.fn();
    renderBoard({
      analysisMode: false,
      solution: "1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4)",
      onAttemptResolved,
    });

    play("e2", "e4");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    play("g1", "f3");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    play("f1", "b5");
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onAttemptResolved).toHaveBeenLastCalledWith({
      puzzleId: "test",
      puzzleCorrect: true,
      incorrectMove: null,
      correctMove: "3. Bb5",
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

  it("allows a new variation to be played from the middle of a solution line", () => {
    const states = renderBoard({
      solution: "1. e4 e5 2. Nf3",
      analysisMode: true,
      preserveAnalysisHistoryOnSolutionChange: true,
      solutionNavigation: { type: "solution", line: 0, ply: 1 },
    });

    play("d7", "d5");

    expect(states.at(-1)).toMatchObject({
      lineIndex: 2,
      lineMoves: ["e4", "d5"],
      customLineIndex: 0,
      viewingSolution: false,
    });
  });

  it("uses Down and Up to navigate to the end and start of a solution", () => {
    const states = renderBoard({ solution: "1. e4 e5 2. Nf3", showSolution: true });

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(states.at(-1)?.lineIndex).toBe(3);

    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(states.at(-1)?.lineIndex).toBe(0);
    expect(states.at(-1)?.viewingSolution).toBe(true);
  });

  it("does not expose hidden solution variations when navigating to the current line end", () => {
    const states = renderBoard({ solution: "1. e4 (1. d4)", showSolution: false });

    fireEvent.keyDown(window, { key: "ArrowDown" });

    expect(states.at(-1)).toMatchObject({
      lineIndex: 0,
      lineMoves: [],
      viewingSolution: false,
    });
  });

  it("uses Down and Up to cycle editor options when continuations are available", () => {
    const states = renderBoard({
      solution: "1. e4 (1. d4)",
      showSolution: false,
      analysisMode: true,
      preserveAnalysisHistoryOnSolutionChange: true,
      solutionNavigation: { type: "solution", line: 1, ply: 0 },
    });

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(states.at(-1)).toMatchObject({
      lineIndex: 0,
      solutionLineIndex: 0,
      viewingSolution: true,
    });

    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(states.at(-1)).toMatchObject({ lineIndex: 0, solutionLineIndex: 1 });
  });

  it("returns to the main solution after backtracking from a custom branch", () => {
    const states = renderBoard({ solution: "1. e4 e5 2. Nf3", showSolution: true });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    play("f1", "c4");
    fireEvent.keyDown(window, { key: "Backspace" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(states.at(-1)?.lineIndex).toBe(3);
    expect(states.at(-1)?.lineMoves?.[2]).toBe("Nf3");
    expect(states.at(-1)?.viewingSolution).toBe(true);

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(states.at(-1)?.lineMoves?.[2]).toBe("Nf3");
    expect(states.at(-1)?.viewingSolution).toBe(true);
  });

  it("returns to the main solution after backtracking from a predefined variation", () => {
    const states = renderBoard({
      solution: "1. e4 e5 (1... c5 2. Nf3) 2. Nf3",
      showSolution: true,
      solutionNavigation: { type: "solution", line: 1, ply: 2 },
    });

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(states.at(-1)).toMatchObject({
      lineMoves: ["e4", "e5", "Nf3"],
      lineIndex: 2,
      solutionLineIndex: 0,
      viewingSolution: true,
    });
  });

  it("cannot revisit a deleted variation after going backward and forward", () => {
    const states: ChessboardState[] = [];
    const props: ComponentProps<typeof Chessboard> = {
      puzzleId: "deleted-variation",
      fen: STARTING_FEN,
      orientation: "white",
      coordinates: true,
      solution: "1. e4 e5 (1... c5 2. Nf3) 2. Nf3",
      showSolution: false,
      analysisMode: true,
      preserveAnalysisHistoryOnSolutionChange: true,
      solutionNavigation: { type: "solution", line: 1, ply: 2 },
      onStateChange: (state) => states.push(state),
    };
    const { rerender } = render(<Chessboard {...props} />);

    rerender(
      <Chessboard
        {...props}
        solution="1. e4 e5 2. Nf3"
        solutionNavigation={{
          type: "loadPgn",
          fen: STARTING_FEN,
          pgn: "1. e4 e5 2. Nf3",
          line: 0,
          ply: 1,
        }}
      />,
    );
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(states.at(-1)).toMatchObject({
      lineMoves: ["e4", "e5", "Nf3"],
      lineIndex: 2,
      solutionLineIndex: 0,
      viewingSolution: true,
    });
    expect(states.at(-1)?.customLines).toEqual([]);
  });

  it("preserves both lines when a move branches from custom analysis history", () => {
    const states = renderBoard();

    play("e2", "e4");
    play("e7", "e5");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    play("c7", "c5");

    expect(states.at(-1)?.customLines).toEqual([
      ["e4", "e5"],
      ["e4", "c5"],
    ]);
    expect(states.at(-1)?.customLineIndex).toBe(1);
  });

  it("returns to the main line after backtracking from a game analysis variation", () => {
    const states = renderBoard({
      solutionNavigation: {
        type: "loadPgn",
        pgn: "1. e4 e5 2. Nf3",
        fen: STARTING_FEN,
      },
    });

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    play("c7", "c5");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(states.at(-1)).toMatchObject({
      lineMoves: ["e4", "e5", "Nf3"],
      lineIndex: 2,
      customLineIndex: 0,
    });

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(states.at(-1)).toMatchObject({
      lineMoves: ["e4", "e5", "Nf3"],
      lineIndex: 2,
      customLineIndex: 0,
    });
  });

  it("preserves the current variation when an analysis line shares its next move before branching", () => {
    vi.useFakeTimers();
    const states: ChessboardState[] = [];
    const boardProps: ComponentProps<typeof Chessboard> = {
      puzzleId: "analysis-shared-prefix",
      fen: STARTING_FEN,
      orientation: "white",
      coordinates: true,
      solution: "",
      showSolution: false,
      analysisMode: true,
      onStateChange: (state) => states.push(state),
    };
    const { rerender } = render(<Chessboard {...boardProps} />);

    play("e2", "e4");
    play("e7", "e5");
    play("g1", "f3");
    play("b8", "c6");
    play("f1", "c4");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });

    rerender(
      <Chessboard
        {...boardProps}
        solutionNavigation={{ type: "line", ucis: ["e7e5", "g1f3", "b8c6", "f1b5"] }}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(750);
    });

    expect(states.at(-1)?.customLines).toEqual([
      ["e4", "e5", "Nf3", "Nc6", "Bc4"],
      ["e4", "e5", "Nf3", "Nc6", "Bb5"],
    ]);
    expect(states.at(-1)?.customLineIndex).toBe(1);
    vi.useRealTimers();
  });

  it("preserves a loaded mainline when an analysis line follows its prefix before branching", () => {
    vi.useFakeTimers();
    const states: ChessboardState[] = [];
    const boardProps: ComponentProps<typeof Chessboard> = {
      puzzleId: "analysis-loaded-mainline",
      fen: STARTING_FEN,
      orientation: "white",
      coordinates: true,
      solution: "",
      showSolution: false,
      analysisMode: true,
      onStateChange: (state) => states.push(state),
    };
    const { rerender } = render(
      <Chessboard
        {...boardProps}
        solutionNavigation={{
          type: "loadPgn",
          pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4",
          fen: STARTING_FEN,
        }}
      />,
    );

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    rerender(
      <Chessboard
        {...boardProps}
        solutionNavigation={{ type: "line", ucis: ["e7e5", "g1f3", "b8c6", "f1b5"] }}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(750);
    });

    expect(states.at(-1)?.customLines).toEqual([
      ["e4", "e5", "Nf3", "Nc6", "Bc4"],
      ["e4", "e5", "Nf3", "Nc6", "Bb5"],
    ]);
    expect(states.at(-1)?.customLineIndex).toBe(1);
    vi.useRealTimers();
  });

  it("loads PGN variations as navigable analysis branches", () => {
    const states = renderBoard({
      solutionNavigation: {
        type: "loadPgn",
        pgn: "1. e4 e5 (1... c5 2. Nf3) 2. Nf3",
        fen: STARTING_FEN,
      },
    });

    expect(states.at(-1)?.customLines).toEqual([
      ["e4", "e5", "Nf3"],
      ["e4", "c5", "Nf3"],
    ]);
    expect(states.at(-1)).toMatchObject({ customLineIndex: 0, lineIndex: 3 });

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(states.at(-1)).toMatchObject({
      lineMoves: ["e4", "c5", "Nf3"],
      lineIndex: 2,
      customLineIndex: 1,
    });
  });

  it("loads a requested PGN branch at the requested ply", () => {
    const states = renderBoard({
      solutionNavigation: {
        type: "loadPgn",
        pgn: "1. e4 e5 (1... c5 2. Nf3) 2. Nf3",
        fen: STARTING_FEN,
        line: 1,
        ply: 2,
      },
    });

    expect(states.at(-1)).toMatchObject({
      lineMoves: ["e4", "c5", "Nf3"],
      lineIndex: 2,
      customLineIndex: 1,
    });
    expect(states.at(-1)?.customLines).toEqual([
      ["e4", "e5", "Nf3"],
      ["e4", "c5", "Nf3"],
    ]);
  });

  it("keeps puzzle annotations when loading an analysis handoff PGN", () => {
    const states = renderBoard({
      solutionNavigation: {
        type: "loadPgn",
        pgn: "1. e4? e5 (1... c5? 2. Nf3) 2. Nf3!",
        fen: STARTING_FEN,
      },
    });

    expect(states.at(-1)?.customLines).toEqual([
      ["e4?", "e5", "Nf3!"],
      ["e4?", "c5?", "Nf3"],
    ]);
  });

  it("updates a move annotation in analysis history", () => {
    const states: ChessboardState[] = [];
    const props: ComponentProps<typeof Chessboard> = {
      puzzleId: "annotated-analysis",
      fen: STARTING_FEN,
      orientation: "white",
      coordinates: true,
      solution: "",
      showSolution: false,
      analysisMode: true,
      onStateChange: (state) => states.push(state),
    };
    const { rerender } = render(
      <Chessboard
        {...props}
        solutionNavigation={{
          type: "loadPgn",
          pgn: "1. e4 e5",
          fen: STARTING_FEN,
        }}
      />,
    );
    rerender(
      <Chessboard
        {...props}
        solutionNavigation={{
          type: "annotate",
          source: "history",
          ply: 1,
          annotation: "?",
        }}
      />,
    );

    expect(states.at(-1)?.lineMoves).toEqual(["e4?", "e5"]);
  });

  it("preserves a custom branch for explicit continuation selection after backtracking", () => {
    const states = renderBoard({ solution: "1. e4 e5 2. Nf3", showSolution: true });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    play("f1", "c4");
    fireEvent.keyDown(window, { key: "Backspace" });

    expect(states.at(-1)?.viewingSolution).toBe(true);
    expect(states.at(-1)?.lineIndex).toBe(2);
    expect(states.at(-1)?.solutionLines?.[0]?.[2]).toBe("Nf3");
    expect(states.at(-1)?.customLines?.[0]?.[2]).toBe("Bc4");

    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(states.at(-1)?.viewingSolution).toBe(false);

    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(states.at(-1)?.lineIndex).toBe(3);
    expect(states.at(-1)?.lineMoves?.[2]).toBe("Bc4");
    expect(states.at(-1)?.viewingSolution).toBe(false);
  });
});
