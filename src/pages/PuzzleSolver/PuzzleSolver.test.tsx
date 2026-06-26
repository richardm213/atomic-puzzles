import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chessboardProps: [] as Array<{
    showSolution?: boolean;
    solutionNavigation?: { lineIndex?: number; plyIndex?: number } | null;
    onStateChange?: (state: unknown) => void;
  }>,
  navigate: vi.fn(),
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
    useParams: () => ({ puzzleId: "1369" }),
  };
});

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, user: { username: "solver" } }),
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
    },
  ]),
}));

vi.mock("../../lib/supabase/supabasePuzzleProgress", () => ({
  fetchAttemptedPuzzleIds: vi.fn(async () => new Set(["1369"])),
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
      solutionNavigation?: { lineIndex?: number; plyIndex?: number } | null;
      onStateChange?: (state: unknown) => void;
    }) => {
      mocks.chessboardProps.push(props);
      const { fen, onStateChange, showSolution, solutionNavigation } = props;

      React.useEffect(() => {
        const lineIndex = solutionNavigation?.lineIndex ?? 0;
        const lineIndexPly = solutionNavigation?.plyIndex ?? 0;
        const lineMoves = solutionLines[lineIndex] ?? solutionLines[0] ?? [];

        onStateChange?.({
          fen,
          turn: "black",
          status: "black to move",
          winner: undefined,
          error: "",
          line: lineMoves.slice(0, lineIndexPly).join(" "),
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

import { PuzzleSolverPage } from "./PuzzleSolver";

describe("PuzzleSolverPage solution options", () => {
  beforeEach(() => {
    mocks.chessboardProps.length = 0;
    mocks.navigate.mockReset();
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

    const showSolution = await screen.findByRole("button", { name: "Show solution" });
    await waitFor(() => expect(showSolution).toBeEnabled());
    await user.click(showSolution);

    const optionList = await screen.findByRole("list", { name: "Solution options" });
    await user.click(within(optionList).getByRole("button", { name: optionName }));

    await waitFor(() => {
      expect(mocks.chessboardProps.at(-1)?.solutionNavigation).toEqual({
        lineIndex,
        plyIndex: 1,
      });
    });
  });
});
