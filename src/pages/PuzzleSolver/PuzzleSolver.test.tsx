import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render as testingLibraryRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AttemptResolved, SolutionNavigation } from "../../types/chessboard";

const mocks = vi.hoisted(() => ({
  chessboardProps: [] as Array<{
    showSolution?: boolean;
    solutionNavigation?: SolutionNavigation | null;
    onAttemptResolved?: (attempt: AttemptResolved) => void;
    onStateChange?: (state: unknown) => void;
  }>,
  attemptedPuzzleIds: new Set(["1369"]),
  fetchCustomPuzzleSet: vi.fn(),
  fetchPuzzleAttemptsForPuzzle: vi.fn(),
  loadPuzzleCatalog: vi.fn(),
  loadPuzzlesById: vi.fn(),
  login: vi.fn(),
  navigate: vi.fn(),
  puzzleAuthor: "admin",
  puzzleExplanation: "Castling avoids the atomic mating net and creates the decisive rook threat.",
  recordCustomPuzzleSetProgress: vi.fn(),
  recordPuzzleProgress: vi.fn(),
  reportPuzzleIssue: vi.fn(),
  refreshCustomPuzzleSet: vi.fn(),
  routeParams: { puzzleId: "1369", setKey: "", setId: "" } as {
    puzzleId: string;
    setKey?: string;
    setId?: string;
  },
  scrollIntoView: vi.fn(),
  updatePuzzleTags: vi.fn(),
  updatePuzzleExplanation: vi.fn(),
  username: "solver",
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
  useAuth: () => ({
    isAuthenticated: true,
    login: mocks.login,
    user: { username: mocks.username },
  }),
}));

vi.mock("../../context/AppSettings", () => ({
  useAppSettings: () => ({ showPuzzleTimer: true }),
}));

vi.mock("../../lib/puzzles/puzzleLibrary", () => ({
  loadPuzzleCatalog: mocks.loadPuzzleCatalog,
  loadPuzzlesById: mocks.loadPuzzlesById,
}));

vi.mock("../../lib/puzzles/customPuzzleSets", () => ({
  fetchCustomPuzzleSet: mocks.fetchCustomPuzzleSet,
  getOrderedPuzzleIndexesForCustomSet: (
    puzzles: Array<{ puzzleId: number }>,
    customSet: { puzzleIds: number[] } | null,
  ) =>
    customSet
      ? customSet.puzzleIds.flatMap((puzzleId) => {
          const index = puzzles.findIndex((puzzle) => puzzle.puzzleId === puzzleId);
          return index < 0 ? [] : [index];
        })
      : [],
  recordCustomPuzzleSetProgress: mocks.recordCustomPuzzleSetProgress,
  refreshCustomPuzzleSet: mocks.refreshCustomPuzzleSet,
}));

vi.mock("../../lib/puzzles/puzzleTags", () => ({
  updatePuzzleTags: mocks.updatePuzzleTags,
}));

vi.mock("../../lib/puzzles/puzzleExplanation", () => ({
  updatePuzzleExplanation: mocks.updatePuzzleExplanation,
}));

vi.mock("../../lib/puzzles/puzzleIssues", () => ({
  reportPuzzleIssue: mocks.reportPuzzleIssue,
}));

vi.mock("../../lib/supabase/puzzleProgress", () => ({
  fetchAttemptedPuzzleIds: vi.fn(async () => new Set(mocks.attemptedPuzzleIds)),
  fetchPuzzleAttemptsForPuzzle: mocks.fetchPuzzleAttemptsForPuzzle,
  recordPuzzleProgress: mocks.recordPuzzleProgress,
}));

vi.mock("../../lib/supabase/users", () => ({
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
      onAttemptResolved?: (attempt: AttemptResolved) => void;
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

const render = (element: ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return testingLibraryRender(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  );
};

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
        correct_move: null,
      },
      {
        username: "alpha",
        puzzle_id: "1369",
        first_attempt_at: "2026-07-09T07:00:00.000Z",
        puzzle_correct: true,
        incorrect_move: null,
        correct_move: "1. Rf8",
      },
      {
        username: "beta",
        puzzle_id: "1369",
        first_attempt_at: "2026-07-09T07:10:00.000Z",
        puzzle_correct: false,
        incorrect_move: "2. Nf3+",
        correct_move: null,
      },
    ]);
    mocks.fetchCustomPuzzleSet.mockReset().mockResolvedValue({
      id: "4b648b2a-e2bf-49dc-aaed-235c05615d1b",
      label: "Review set",
      puzzleIds: [1369],
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T00:00:00.000Z",
      tags: ["fork"],
      untaggedOnly: false,
      authors: [],
      resultFilter: "all",
      completedCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      nextPuzzleId: 1369,
    });
    mocks.recordCustomPuzzleSetProgress.mockReset().mockResolvedValue(undefined);
    mocks.reportPuzzleIssue.mockReset().mockResolvedValue({ issue: { id: 1 } });
    mocks.recordPuzzleProgress.mockReset().mockResolvedValue(undefined);
    mocks.refreshCustomPuzzleSet.mockReset().mockResolvedValue({
      set: {
        id: "4b648b2a-e2bf-49dc-aaed-235c05615d1b",
        label: "Review set",
        puzzleIds: [1369, 1370],
        createdAt: "2026-09-21T00:00:00.000Z",
        updatedAt: "2026-09-21T02:00:00.000Z",
        tags: ["fork"],
        untaggedOnly: false,
        authors: [],
        resultFilter: "all",
        completedCount: 1,
        correctCount: 1,
        incorrectCount: 0,
        nextPuzzleId: 1370,
      },
      addedPuzzleIds: [1370],
    });
    mocks.navigate.mockReset();
    mocks.username = "solver";
    mocks.updatePuzzleTags
      .mockReset()
      .mockImplementation(async (_puzzleId: number, tags: string[]) => tags);
    mocks.updatePuzzleExplanation
      .mockReset()
      .mockImplementation(async (_puzzleId: number, explanation: string) => explanation.trim());
    mocks.puzzleAuthor = "admin";
    mocks.loadPuzzleCatalog.mockReset().mockResolvedValue([
      {
        id: 1369,
        fen: "",
        solution: "",
        puzzleId: 1369,
        puzzle_set_id: 1,
        author: mocks.puzzleAuthor,
        event: "ACL 2024",
        explanation: "",
      },
    ]);
    mocks.loadPuzzlesById.mockReset().mockImplementation(async (puzzleIds: number[]) =>
      puzzleIds.map((puzzleId) => ({
        id: puzzleId,
        fen: "rn2k2r/pp5p/1qpp2p1/2Q5/1b2P3/2N5/PPP3PP/R3KB1R b KQkq - 1 12",
        solution:
          "12... O-O (12... Rf8 13. O-O-O Rf2 (13... Ba3) 14. Be2 Ba3) 13. O-O-O Rf2 (13... Ba3) 14. Be2 Ba3",
        puzzleId,
        puzzle_set_id: 1,
        author: mocks.puzzleAuthor,
        event: "ACL 2024",
        explanation: mocks.puzzleExplanation,
        tags: ["fork"],
      })),
    );
    mocks.puzzleExplanation =
      "Castling avoids the atomic mating net and creates the decisive rook threat.";
    mocks.routeParams = { puzzleId: "1369", setKey: "", setId: "" };
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        addEventListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
      })),
    });
    mocks.scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = mocks.scrollIntoView;
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
  });

  it("loads only the active puzzle and a three-puzzle lookahead from the catalog", async () => {
    mocks.routeParams = { puzzleId: "", setKey: "" };
    mocks.attemptedPuzzleIds = new Set();
    mocks.loadPuzzleCatalog.mockResolvedValueOnce(
      Array.from({ length: 8 }, (_, index) => ({
        id: index + 1,
        fen: "",
        solution: "",
        puzzleId: index + 1,
        author: mocks.puzzleAuthor,
        event: "ACL 2024",
        explanation: "",
      })),
    );

    render(<PuzzleSolverPage />);

    await waitFor(() => expect(screen.getByTestId("mock-board")).toBeInTheDocument());
    expect(mocks.loadPuzzleCatalog).toHaveBeenCalledOnce();
    expect(mocks.loadPuzzlesById).toHaveBeenCalled();
    expect(mocks.loadPuzzlesById.mock.calls[0]?.[0]).toHaveLength(4);
    for (const [puzzleIds] of mocks.loadPuzzlesById.mock.calls) {
      expect(puzzleIds.length).toBeLessThanOrEqual(4);
    }
  });

  it("uses an in-flight prefetch when Next selects that puzzle", async () => {
    mocks.routeParams = { puzzleId: "1", setKey: "" };
    mocks.attemptedPuzzleIds = new Set();
    mocks.loadPuzzleCatalog.mockResolvedValueOnce(
      Array.from({ length: 4 }, (_, index) => ({
        id: index + 1,
        fen: "",
        solution: "",
        puzzleId: index + 1,
        author: "admin",
        event: "ACL 2024",
        explanation: "",
      })),
    );

    const puzzleDetails = (puzzleId: number) => ({
      id: puzzleId,
      fen: "rn2k2r/pp5p/1qpp2p1/2Q5/1b2P3/2N5/PPP3PP/R3KB1R b KQkq - 1 12",
      solution: "12... O-O 13. O-O-O Rf2 14. Be2 Ba3",
      puzzleId,
      author: "admin",
      event: "ACL 2024",
      explanation: "",
    });
    let prefetchedIds: number[] = [];
    let resolvePrefetch: (puzzles: ReturnType<typeof puzzleDetails>[]) => void = () => undefined;
    mocks.loadPuzzlesById.mockImplementation((puzzleIds: number[]) => {
      if (puzzleIds.length === 1 && puzzleIds[0] === 1) {
        return Promise.resolve([puzzleDetails(1)]);
      }

      prefetchedIds = puzzleIds;
      return new Promise((resolve) => {
        resolvePrefetch = resolve;
      });
    });
    mocks.navigate.mockImplementation((options: { params?: { puzzleId?: string } }) => {
      if (options.params?.puzzleId) {
        mocks.routeParams = { ...mocks.routeParams, puzzleId: options.params.puzzleId };
      }
    });

    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    await screen.findByTestId("mock-board");
    await waitFor(() => expect(prefetchedIds).toHaveLength(3));

    const nextButton = screen.getAllByRole("button", { name: "Next" })[0]!;
    await user.click(nextButton);
    expect(screen.getByText("Waiting for puzzle data...")).toBeInTheDocument();

    resolvePrefetch(prefetchedIds.map(puzzleDetails));

    await waitFor(() => expect(screen.getByTestId("mock-board")).toBeInTheDocument());
    expect(screen.queryByText("Waiting for puzzle data...")).not.toBeInTheDocument();
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

  it("copies the puzzle PGN with Atomic variant and starting FEN headers", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<PuzzleSolverPage />);

    const solutionTab = await screen.findByRole("tab", { name: "Solution" });
    await waitFor(() => expect(solutionTab).toBeEnabled());
    await user.click(solutionTab);
    await user.click(await screen.findByRole("button", { name: "Copy PGN" }));

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[Variant "Atomic"\]\n\[FEN "rn2k2r\/pp5p\/1qpp2p1\/2Q5\/1b2P3\/2N5\/PPP3PP\/R3KB1R b KQkq - 1 12"\]\n\n12\.\.\./,
      ),
    );
  });

  it("keeps original solution lines when board analysis adds a variation", async () => {
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    const solutionTab = await screen.findByRole("tab", { name: "Solution" });
    await waitFor(() => expect(solutionTab).toBeEnabled());
    await user.click(solutionTab);

    act(() => {
      mocks.chessboardProps.at(-1)?.onStateChange?.({
        fen: "rn2k2r/pp5p/1qpp2p1/2Q5/1b2P3/2N5/PPP3PP/R3KB1R b KQkq - 1 12",
        turn: "black",
        status: "black to move",
        error: "",
        lineMoves: ["O-O", "Kd7"],
        solutionLines: [
          ["O-O", "O-O-O", "Rf2", "Be2", "Ba3"],
          ["Rf8", "O-O-O", "Rf2", "Be2", "Ba3"],
        ],
        customLines: [["O-O", "Kd7"]],
        solutionLineIndex: 0,
        customLineIndex: 0,
        lineIndex: 2,
        viewingSolution: false,
        showWrongMove: false,
        showRetryMove: false,
        solved: false,
      });
    });

    const variations = await screen.findByRole("list", { name: "Solution variations" });
    expect(within(variations).getByRole("button", { name: "1. O-O" })).toBeVisible();
    expect(within(variations).getByRole("button", { name: "1. Rf8" })).toBeVisible();
    expect(within(variations).getByRole("button", { name: "1... Kd7" })).toBeVisible();
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
    expect(within(attempts).getByLabelText("Played 1. Rf8")).toHaveTextContent("1. Rf8");
    expect(within(attempts).getByRole("link", { name: "beta" })).toBeInTheDocument();
    expect(within(attempts).getByText("Incorrect")).toBeInTheDocument();
    const wrongMove = within(attempts).getByLabelText("Played 2. Nf3+");
    expect(wrongMove).toHaveTextContent("2. Nf3+");
    expect(mocks.fetchPuzzleAttemptsForPuzzle).toHaveBeenCalledWith("1369", { limit: 30 });
  });

  it("shows puzzle motifs after the puzzle has been attempted", async () => {
    render(<PuzzleSolverPage />);

    const motifList = await screen.findByLabelText("Tags on this puzzle");
    expect(within(motifList).getByText("Fork")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add tag" })).not.toBeInTheDocument();
  });

  it("shows the issue report only after an attempt and submits the selected category", async () => {
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    await user.click(await screen.findByRole("button", { name: "Report issue" }));
    const dialog = screen.getByRole("dialog", { name: "Report puzzle issue" });
    await user.click(within(dialog).getByRole("radio", { name: "Incorrect solution" }));
    await user.type(
      within(dialog).getByRole("textbox", { name: /Details/ }),
      "Line fails after Qf7",
    );
    await user.click(within(dialog).getByRole("button", { name: "Send report" }));

    await waitFor(() =>
      expect(mocks.reportPuzzleIssue).toHaveBeenCalledWith(
        1369,
        "incorrect_solution",
        "Line fails after Qf7",
      ),
    );
    expect(await within(dialog).findByText("Report sent")).toBeInTheDocument();
  });

  it("hides the issue report before the puzzle has been attempted", async () => {
    mocks.attemptedPuzzleIds = new Set();
    render(<PuzzleSolverPage />);

    await screen.findByTestId("mock-board");
    expect(screen.queryByRole("button", { name: "Report issue" })).not.toBeInTheDocument();
  });

  it("keeps puzzle motifs hidden before a regular user attempts the puzzle", async () => {
    mocks.attemptedPuzzleIds = new Set();
    render(<PuzzleSolverPage />);

    await screen.findByTestId("mock-board");
    expect(screen.queryByLabelText("Puzzle tags")).not.toBeInTheDocument();
  });

  it("lets seaside_tiramisu add and remove any number of motifs", async () => {
    mocks.username = "seaside_tiramisu";
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    await user.click(await screen.findByRole("button", { name: "Add tag" }));
    await user.click(screen.getByRole("button", { name: "Add pin" }));
    await waitFor(() =>
      expect(mocks.updatePuzzleTags).toHaveBeenLastCalledWith(1369, ["fork", "pin"]),
    );

    await user.click(screen.getByRole("button", { name: "Add tempo" }));
    await waitFor(() =>
      expect(mocks.updatePuzzleTags).toHaveBeenLastCalledWith(1369, ["fork", "pin", "tempo"]),
    );

    await user.click(screen.getByRole("button", { name: "Remove fork" }));

    await waitFor(() =>
      expect(mocks.updatePuzzleTags).toHaveBeenLastCalledWith(1369, ["pin", "tempo"]),
    );
    expect(await screen.findByText("Tags updated.")).toBeInTheDocument();
  });

  it("keeps the motif editor hidden from seaside_tiramisu until the puzzle is attempted", async () => {
    mocks.username = "seaside_tiramisu";
    mocks.attemptedPuzzleIds = new Set();
    render(<PuzzleSolverPage />);

    await screen.findByTestId("mock-board");
    expect(screen.queryByLabelText("Puzzle tags")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add tag" })).not.toBeInTheDocument();
  });

  it("collapses solution and attempts panels when their active tab is selected again", async () => {
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    const solutionTab = await screen.findByRole("tab", { name: "Solution" });
    await waitFor(() => expect(solutionTab).toBeEnabled());
    await user.click(solutionTab);
    expect(screen.getByRole("list", { name: "Solution variations" })).toBeInTheDocument();

    await user.click(solutionTab);
    expect(screen.queryByRole("list", { name: "Solution variations" })).not.toBeInTheDocument();

    const attemptsTab = screen.getByRole("tab", { name: "Other attempts" });
    await user.click(attemptsTab);
    expect(await screen.findByRole("list", { name: "Other puzzle attempts" })).toBeInTheDocument();

    await user.click(attemptsTab);
    expect(screen.queryByRole("list", { name: "Other puzzle attempts" })).not.toBeInTheDocument();
    expect(mocks.fetchPuzzleAttemptsForPuzzle).toHaveBeenCalledTimes(1);
  });

  it("lets mobile users jump between comments and the board tools", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        addEventListener: vi.fn(),
        matches: true,
        removeEventListener: vi.fn(),
      })),
    });
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    const commentsTab = await screen.findByRole("tab", { name: "Comments" });
    await waitFor(() => expect(screen.queryByLabelText(/^Elapsed time /)).not.toBeInTheDocument());
    await waitFor(() => expect(commentsTab).toBeEnabled());
    await user.click(commentsTab);

    expect(commentsTab).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById("puzzle-community")).toBeInTheDocument();
    await waitFor(() => expect(mocks.scrollIntoView).toHaveBeenCalled());

    const solutionTab = screen.getByRole("tab", { name: "Solution" });
    await user.click(solutionTab);
    expect(await screen.findByRole("list", { name: "Solution variations" })).toBeInTheDocument();
    expect(solutionTab).toHaveAttribute("aria-selected", "true");
  });

  it("unlocks and opens the explanation tab after a wrong move", async () => {
    mocks.attemptedPuzzleIds = new Set();
    render(<PuzzleSolverPage />);

    const explanationTab = await screen.findByRole("tab", { name: "Explanation" });
    expect(explanationTab).toBeDisabled();

    await waitFor(() => expect(mocks.chessboardProps.at(-1)?.onStateChange).toBeTypeOf("function"));
    act(() => {
      mocks.chessboardProps.at(-1)?.onStateChange?.({
        fen: "rn2k2r/pp5p/1qpp2p1/2Q5/1b2P3/2N5/PPP3PP/R3KB1R b KQkq - 1 12",
        turn: "black",
        status: "Incorrect",
        error: "",
        lineMoves: ["Kd7"],
        solutionLines: [],
        solutionLineIndex: 0,
        lineIndex: 1,
        viewingSolution: false,
        showWrongMove: true,
        showRetryMove: false,
        solved: false,
      });
    });

    expect(explanationTab).toBeEnabled();
    expect(explanationTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText(
        "Castling avoids the atomic mating net and creates the decisive rook threat.",
      ),
    ).toBeInTheDocument();
  });

  it("unlocks the explanation when the puzzle was attempted before", async () => {
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    const explanationTab = await screen.findByRole("tab", { name: "Explanation" });
    await waitFor(() => expect(explanationTab).toBeEnabled());
    expect(explanationTab).toHaveAttribute("aria-selected", "false");

    await user.click(explanationTab);
    expect(
      screen.getByText(
        "Castling avoids the atomic mating net and creates the decisive rook threat.",
      ),
    ).toBeInTheDocument();
  });

  it("does not show the explanation tab when the puzzle has no explanation", async () => {
    mocks.puzzleExplanation = "";
    render(<PuzzleSolverPage />);

    await screen.findByRole("tab", { name: "Solution" });
    expect(screen.queryByRole("tab", { name: "Explanation" })).not.toBeInTheDocument();
  });

  it("hides castling and material summaries when neither applies", async () => {
    mocks.loadPuzzlesById.mockResolvedValueOnce([
      {
        id: 1369,
        fen: "8/8/8/3k4/8/4K3/8/8 w - - 0 1",
        solution: "",
        puzzleId: 1369,
        author: mocks.puzzleAuthor,
        event: "ACL 2024",
        explanation: mocks.puzzleExplanation,
        tags: [],
      },
    ]);

    render(<PuzzleSolverPage />);

    await screen.findByRole("heading", { name: "Puzzle 1369" });
    await waitFor(() => expect(mocks.chessboardProps.length).toBeGreaterThan(0));
    expect(screen.queryByLabelText(/^Castling rights\./)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Material difference")).not.toBeInTheDocument();
  });

  it("shows the author an explanation editor only after attempting the puzzle", async () => {
    mocks.username = "admin";
    mocks.attemptedPuzzleIds = new Set();
    mocks.puzzleExplanation = "";
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    const explanationTab = await screen.findByRole("tab", { name: "Explanation" });
    expect(explanationTab).toBeDisabled();

    act(() => {
      mocks.chessboardProps.at(-1)?.onAttemptResolved?.({
        puzzleId: 1369,
        puzzleCorrect: false,
        incorrectMove: "1... Kd7",
        correctMove: null,
      });
    });

    await waitFor(() => expect(explanationTab).toBeEnabled());
    await user.click(explanationTab);
    await user.click(screen.getByRole("button", { name: "Add explanation" }));
    await user.type(
      screen.getByRole("textbox", { name: "Puzzle explanation" }),
      "The king move escapes the atomic threat.",
    );
    await user.click(screen.getByRole("button", { name: "Save explanation" }));

    await waitFor(() =>
      expect(mocks.updatePuzzleExplanation).toHaveBeenCalledWith(
        1369,
        "The king move escapes the atomic threat.",
      ),
    );
    expect(await screen.findByText("Explanation saved.")).toBeInTheDocument();
    expect(screen.getByText("The king move escapes the atomic threat.")).toBeInTheDocument();
  });

  it("lets seaside_tiramisu edit explanations on legacy admin puzzles", async () => {
    mocks.username = "seaside_tiramisu";
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    await user.click(await screen.findByRole("tab", { name: "Explanation" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const explanationInput = screen.getByRole("textbox", { name: "Puzzle explanation" });
    await user.clear(explanationInput);
    await user.type(explanationInput, "Updated by the puzzle admin.");
    await user.click(screen.getByRole("button", { name: "Save explanation" }));

    await waitFor(() =>
      expect(mocks.updatePuzzleExplanation).toHaveBeenCalledWith(
        1369,
        "Updated by the puzzle admin.",
      ),
    );
  });

  it("does not let seaside_tiramisu edit another player's explanation", async () => {
    mocks.username = "seaside_tiramisu";
    mocks.puzzleAuthor = "randoomplayer";
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    await user.click(await screen.findByRole("tab", { name: "Explanation" }));
    expect(screen.getByText(mocks.puzzleExplanation)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add explanation" })).not.toBeInTheDocument();
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

  it("treats a custom-set puzzle as fresh while preserving the solved-before badge", async () => {
    mocks.routeParams = {
      puzzleId: "1369",
      setId: "4b648b2a-e2bf-49dc-aaed-235c05615d1b",
    };

    render(<PuzzleSolverPage />);

    await screen.findByTestId("mock-board");
    expect(
      screen.getByRole("img", { name: "You've solved this puzzle before" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Solution" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Explanation" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Other attempts" })).toBeDisabled();
    expect(screen.queryByLabelText("Puzzle tags")).not.toBeInTheDocument();

    act(() => {
      mocks.chessboardProps.at(-1)?.onAttemptResolved?.({
        puzzleId: 1369,
        puzzleCorrect: true,
        incorrectMove: null,
        correctMove: "1. O-O",
      });
    });

    await waitFor(() => expect(screen.getByRole("tab", { name: "Solution" })).toBeEnabled());
    expect(screen.getByRole("tab", { name: "Explanation" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "Other attempts" })).toBeEnabled();
    expect(screen.getByLabelText("Puzzle tags")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.recordCustomPuzzleSetProgress).toHaveBeenCalledWith(
        "4b648b2a-e2bf-49dc-aaed-235c05615d1b",
        "1369",
        true,
      ),
    );
    expect(mocks.recordPuzzleProgress).not.toHaveBeenCalled();
  });

  it("records both progress sources when a custom-set solve is the first attempt", async () => {
    mocks.attemptedPuzzleIds = new Set();
    mocks.routeParams = {
      puzzleId: "1369",
      setId: "4b648b2a-e2bf-49dc-aaed-235c05615d1b",
    };

    render(<PuzzleSolverPage />);

    await screen.findByTestId("mock-board");
    expect(
      screen.queryByRole("img", { name: "You've solved this puzzle before" }),
    ).not.toBeInTheDocument();

    act(() => {
      mocks.chessboardProps.at(-1)?.onAttemptResolved?.({
        puzzleId: 1369,
        puzzleCorrect: false,
        incorrectMove: "1... Kd7",
        correctMove: null,
      });
    });

    await waitFor(() =>
      expect(mocks.recordPuzzleProgress).toHaveBeenCalledWith({
        username: "solver",
        puzzleId: "1369",
        puzzleCorrect: false,
        incorrectMove: "1... Kd7",
        correctMove: null,
      }),
    );
    expect(mocks.recordCustomPuzzleSetProgress).toHaveBeenCalledWith(
      "4b648b2a-e2bf-49dc-aaed-235c05615d1b",
      "1369",
      false,
    );
  });

  it("shows AWC puzzle-set metadata on a regular puzzle URL without repeating its date", async () => {
    const puzzleSet = {
      id: 8,
      event_name: "AWC 2026",
      event_date: "2026-07-09",
      players: ["Alpha", "Beta"],
    };
    mocks.routeParams = { puzzleId: "1369", setKey: "", setId: "" };
    mocks.loadPuzzleCatalog.mockResolvedValueOnce([
      {
        id: 1369,
        fen: "",
        solution: "",
        puzzleId: 1369,
        puzzle_set_id: 8,
        puzzle_set: puzzleSet,
        author: mocks.puzzleAuthor,
        explanation: "",
      },
    ]);
    mocks.loadPuzzlesById.mockResolvedValueOnce([
      {
        id: 1369,
        fen: "rn2k2r/pp5p/1qpp2p1/2Q5/1b2P3/2N5/PPP3PP/R3KB1R b KQkq - 1 12",
        solution: "12... O-O 13. O-O-O Rf2 14. Be2 Ba3",
        puzzleId: 1369,
        puzzle_set_id: 8,
        puzzle_set: puzzleSet,
        author: mocks.puzzleAuthor,
        explanation: "",
        tags: [],
      },
    ]);

    render(<PuzzleSolverPage />);

    const setDetails = await screen.findByRole("region", { name: "Puzzle set details" });
    expect(within(setDetails).getByText("AWC 2026")).toBeInTheDocument();
    expect(within(setDetails).queryByText("Jul 2026")).not.toBeInTheDocument();
    expect(within(setDetails).getByText("alpha vs beta")).toBeInTheDocument();
  });

  it("offers exits when the final puzzle in an ordered set is solved", async () => {
    mocks.routeParams = {
      puzzleId: "1369",
      setKey: "1",
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

  it("can append newly matching puzzles after a custom set is completed", async () => {
    mocks.routeParams = {
      puzzleId: "1369",
      setId: "4b648b2a-e2bf-49dc-aaed-235c05615d1b",
    };
    const user = userEvent.setup();
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

    await user.click(await screen.findByRole("button", { name: "Add new matching puzzles" }));

    await waitFor(() =>
      expect(mocks.refreshCustomPuzzleSet).toHaveBeenCalledWith(
        "4b648b2a-e2bf-49dc-aaed-235c05615d1b",
      ),
    );
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/solve/custom/$setId/$puzzleId",
      params: {
        setId: "4b648b2a-e2bf-49dc-aaed-235c05615d1b",
        puzzleId: "1370",
      },
      replace: true,
    });
  });
});
