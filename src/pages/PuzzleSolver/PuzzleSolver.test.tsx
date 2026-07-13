import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SolutionNavigation } from "../../types/chessboard";

const mocks = vi.hoisted(() => ({
  chessboardProps: [] as Array<{
    showSolution?: boolean;
    solutionNavigation?: SolutionNavigation | null;
    onStateChange?: (state: unknown) => void;
  }>,
  attemptedPuzzleIds: new Set(["1369"]),
  fetchPuzzleAttemptsForPuzzle: vi.fn(),
  navigate: vi.fn(),
  routeParams: { puzzleId: "1369", setKey: "" },
}));

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");

  return {
    Link: ({
      children,
      className,
      to,
    }: {
      children: React.ReactNode;
      className?: string;
      to?: string;
    }) => React.createElement("a", { className, href: to ?? "#" }, children),
    useNavigate: () => mocks.navigate,
    useParams: () => mocks.routeParams,
  };
});

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { username: "solver" } }),
}));

vi.mock("../../context/AppSettings", () => ({
  useAppSettings: () => ({ showPuzzleTimer: true }),
}));

vi.mock("../../lib/puzzles/puzzleLibrary", () => ({
  loadPuzzleLibrary: vi.fn(async () => [
    {
      id: 1369,
      fen: "rn2k2r/pp5p/1qpp2p1/2Q5/1b2P3/2N5/PPP3PP/R3KB1R b KQkq - 1 12",
      solution:
        "12... O-O (12... Rf8 13. O-O-O Rf2 (13... Ba3) 14. Be2 Ba3) 13. O-O-O Rf2 (13... Ba3) 14. Be2 Ba3",
      puzzleId: 1369,
      author: "admin",
      event: "ACL 2024",
    },
  ]),
}));

vi.mock("../../lib/supabase/supabasePuzzleProgress", () => ({
  fetchAttemptedPuzzleIds: vi.fn(async () => new Set(mocks.attemptedPuzzleIds)),
  fetchPuzzleAttemptsForPuzzle: mocks.fetchPuzzleAttemptsForPuzzle,
  recordPuzzleProgress: vi.fn(async () => undefined),
}));

vi.mock("../../lib/supabase/supabaseUsers", () => ({
  isRegisteredSiteUser: vi.fn(async () => false),
}));

vi.mock("../../components/Chessboard/Chessboard", async () => {
  const React = await import("react");
  const solutionLines = [
    ["O-O", "O-O-O", "Rf2", "Be2", "Ba3"],
    ["Rf8", "O-O-O", "Rf2", "Be2", "Ba3"],
  ];

  return {
    Chessboard: (props: {
      fen: string;
      showSolution?: boolean;
      solutionNavigation?: SolutionNavigation | null;
      onStateChange?: (state: unknown) => void;
    }) => {
      mocks.chessboardProps.push(props);
      const { fen, onStateChange, showSolution, solutionNavigation } = props;

      React.useEffect(() => {
        const lineIndex = solutionNavigation?.type === "solution" ? solutionNavigation.line : 0;
        const lineIndexPly = solutionNavigation?.type === "solution" ? solutionNavigation.ply : 0;
        const lineMoves = solutionLines[lineIndex] ?? solutionLines[0] ?? [];

        onStateChange?.({
          fen,
          turn: "black",
          status: "black to move",
          winner: undefined,
          error: "",
          lineMoves,
          solutionLines,
          solutionLineIndex: lineIndex,
          lineIndex: lineIndexPly,
          viewingSolution: showSolution ?? false,
          showWrongMove: false,
          showRetryMove: false,
          solved: false,
        });
      }, [fen, onStateChange, showSolution, solutionNavigation]);

      return React.createElement("div", { "data-testid": "mock-board" });
    },
  };
});

import { castlingRightsFromFen } from "./castlingRights";
import { PuzzleSolverPage } from "./PuzzleSolver";

describe("castlingRightsFromFen", () => {
  it("formats king- and queenside rights for both colors", () => {
    expect(castlingRightsFromFen("8/8/8/8/8/8/8/8 w KQkq - 0 1")).toEqual({
      white: ["O-O", "O-O-O"],
      black: ["O-O", "O-O-O"],
    });
    expect(castlingRightsFromFen("8/8/8/8/8/8/8/8 w Kq - 0 1")).toEqual({
      white: ["O-O"],
      black: ["O-O-O"],
    });
  });

  it("returns no rights for an empty or incomplete FEN", () => {
    expect(castlingRightsFromFen("8/8/8/8/8/8/8/8 w - - 0 1")).toEqual({
      white: [],
      black: [],
    });
    expect(castlingRightsFromFen(undefined)).toEqual({ white: [], black: [] });
  });
});

describe("PuzzleSolverPage solution options", () => {
  beforeEach(() => {
    mocks.chessboardProps.length = 0;
    mocks.attemptedPuzzleIds = new Set(["1369"]);
    mocks.fetchPuzzleAttemptsForPuzzle.mockReset().mockResolvedValue([
      {
        username: "solver",
        puzzle_id: "1369",
        first_attempt_at: "2026-07-09T06:50:00.000Z",
        puzzle_correct: true,
        incorrect_move: null,
      },
      {
        username: "alpha",
        puzzle_id: "1369",
        first_attempt_at: "2026-07-09T07:00:00.000Z",
        puzzle_correct: true,
        incorrect_move: null,
      },
      {
        username: "beta",
        puzzle_id: "1369",
        first_attempt_at: "2026-07-09T07:10:00.000Z",
        puzzle_correct: false,
        incorrect_move: "2. Nf3+",
      },
    ]);
    mocks.navigate.mockReset();
    mocks.routeParams = { puzzleId: "1369", setKey: "" };
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        addEventListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
      })),
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  it.each([
    ["1. O-O", 0],
    ["1. Rf8", 1],
  ])("advances into the %s option line", async (optionName, lineIndex) => {
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    const solutionTab = await screen.findByRole("tab", { name: "Solution" });
    await waitFor(() => expect(solutionTab).toBeEnabled());
    await user.click(solutionTab);

    const optionList = await screen.findByRole("list", { name: "Solution options" });
    await user.click(within(optionList).getByRole("button", { name: optionName }));

    await waitFor(() => {
      expect(mocks.chessboardProps.at(-1)?.solutionNavigation).toEqual({
        type: "solution",
        line: lineIndex,
        ply: 1,
      });
    });
  });

  it("uses the mouse wheel for moves only after the solution is open", async () => {
    const user = userEvent.setup();
    const { container } = render(<PuzzleSolverPage />);
    const boardFrame = container.querySelector(".boardFrame")!;
    const solutionTab = await screen.findByRole("tab", { name: "Solution" });
    await waitFor(() => expect(solutionTab).toBeEnabled());

    fireEvent.wheel(boardFrame, { deltaY: 12 });
    const navigationBeforeReveal = mocks.chessboardProps.at(-1)?.solutionNavigation;
    expect(navigationBeforeReveal === null || navigationBeforeReveal === undefined).toBe(true);

    await user.click(solutionTab);
    fireEvent.wheel(boardFrame, { deltaY: 12 });

    await waitFor(() =>
      expect(mocks.chessboardProps.at(-1)?.solutionNavigation).toEqual({
        type: "command",
        command: "next",
      }),
    );
  });

  it("shows all players who attempted the puzzle, including the current user", async () => {
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    await user.click(await screen.findByRole("tab", { name: "Other attempts" }));

    const attempts = await screen.findByRole("list", { name: "Other puzzle attempts" });
    expect(within(attempts).getByRole("link", { name: "solver" })).toBeInTheDocument();
    expect(within(attempts).getByRole("link", { name: "alpha" })).toBeInTheDocument();
    expect(within(attempts).getAllByText("Correct")).toHaveLength(2);
    expect(within(attempts).getByRole("link", { name: "beta" })).toBeInTheDocument();
    expect(within(attempts).getByText("Incorrect")).toBeInTheDocument();
    const wrongMove = within(attempts).getByLabelText("Played 2. Nf3+");
    expect(wrongMove).toHaveTextContent("2. Nf3+");
    expect(mocks.fetchPuzzleAttemptsForPuzzle).toHaveBeenCalledWith("1369", { limit: 30 });
  });

  it("keeps the current solution position when opening other attempts", async () => {
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    const solutionTab = await screen.findByRole("tab", { name: "Solution" });
    await waitFor(() => expect(solutionTab).toBeEnabled());
    await user.click(solutionTab);
    const options = await screen.findByRole("list", { name: "Solution options" });
    await user.click(within(options).getByRole("button", { name: "1. Rf8" }));
    await waitFor(() => expect(mocks.chessboardProps.at(-1)?.showSolution).toBe(true));

    await user.click(screen.getByRole("tab", { name: "Other attempts" }));

    expect(mocks.chessboardProps.at(-1)?.showSolution).toBe(true);
    expect(mocks.chessboardProps.at(-1)?.solutionNavigation).toBeNull();
  });

  it("locks other attempts until the current user has attempted the puzzle", async () => {
    mocks.attemptedPuzzleIds = new Set();

    render(<PuzzleSolverPage />);

    const otherAttemptsTab = await screen.findByRole("tab", { name: "Other attempts" });
    await waitFor(() => expect(otherAttemptsTab).toBeDisabled());
  });

  it("offers exits when the final puzzle in an ordered set is solved", async () => {
    mocks.routeParams = {
      puzzleId: "1369",
      setKey: "ACL 2024",
    };
    render(<PuzzleSolverPage />);

    await screen.findByTestId("mock-board");
    act(() => {
      mocks.chessboardProps.at(-1)?.onStateChange?.({
        fen: "8/8/8/8/8/8/8/8 w - - 0 1",
        turn: "white",
        status: "Solved",
        error: "",
        lineMoves: [],
        solutionLines: [],
        solutionLineIndex: 0,
        lineIndex: 0,
        viewingSolution: false,
        showWrongMove: false,
        showRetryMove: false,
        solved: true,
      });
    });

    expect(await screen.findByRole("heading", { name: "Puzzle set complete" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue with regular puzzles" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to puzzle sets" })).toBeInTheDocument();
  });
});
