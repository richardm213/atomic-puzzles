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
    disabled?: boolean;
    analysisMode?: boolean;
    showSolution?: boolean;
    solutionNavigation?: SolutionNavigation | null;
    onAttemptResolved?: (attempt: AttemptResolved) => void;
    onStateChange?: (state: unknown) => void;
  }>,
  attemptedPuzzleIds: new Set(["1369"]),
  fetchPuzzleProgressRowsForUsername: vi.fn(),
  fetchCustomPuzzleSet: vi.fn(),
  fetchPuzzleAttemptsForPuzzle: vi.fn(),
  loadPuzzleCatalog: vi.fn(),
  loadPuzzleSolverIndex: vi.fn(),
  loadPuzzlesById: vi.fn(),
  fetchPrimaryPlayerNicknames: vi.fn(),
  fetchPuzzleUserRating: vi.fn(),
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
  loadPuzzleTagVotes: vi.fn(),
  voteOnPuzzleTag: vi.fn(),
  updatePuzzleExplanation: vi.fn(),
  username: "solver",
}));

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");

  return {
    Link: ({
      children,
      className,
      title,
      to,
    }: {
      children: React.ReactNode;
      className?: string;
      title?: string;
      to?: string;
    }) => React.createElement("a", { className, href: to ?? "#", title }, children),
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
  useAppSettings: () => ({ showPuzzleTimer: true, puzzleAnalysisTarget: "atomic-puzzles" }),
}));

vi.mock("../../lib/puzzles/puzzleLibrary", () => ({
  loadPuzzleCatalog: mocks.loadPuzzleCatalog,
  loadPuzzlesById: mocks.loadPuzzlesById,
  loadPuzzleSolverIndex: mocks.loadPuzzleSolverIndex,
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
  loadPuzzleTagVotes: mocks.loadPuzzleTagVotes,
  voteOnPuzzleTag: mocks.voteOnPuzzleTag,
}));

vi.mock("../../lib/puzzles/puzzleExplanation", () => ({
  updatePuzzleExplanation: mocks.updatePuzzleExplanation,
}));

vi.mock("../../lib/puzzles/puzzleIssues", () => ({
  reportPuzzleIssue: mocks.reportPuzzleIssue,
}));

vi.mock("../../lib/supabase/puzzleProgress", () => ({
  fetchPuzzleProgressRowsForUsername: mocks.fetchPuzzleProgressRowsForUsername,
  fetchPuzzleAttemptsForPuzzle: mocks.fetchPuzzleAttemptsForPuzzle,
  recordPuzzleProgress: mocks.recordPuzzleProgress,
}));

vi.mock("../../lib/supabase/playerNicknames", () => ({
  fetchPrimaryPlayerNicknames: mocks.fetchPrimaryPlayerNicknames,
}));

vi.mock("../../lib/supabase/puzzleUserRatings", () => ({
  fetchPuzzleUserRating: mocks.fetchPuzzleUserRating,
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
      disabled?: boolean;
      fen: string;
      analysisMode?: boolean;
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
    window.localStorage.clear();
    mocks.chessboardProps.length = 0;
    mocks.attemptedPuzzleIds = new Set(["1369"]);
    mocks.fetchPuzzleProgressRowsForUsername.mockReset().mockImplementation(async () =>
      [...mocks.attemptedPuzzleIds].map((puzzleId) => ({
        puzzle_id: puzzleId,
        first_attempt_at: "2026-01-01T00:00:00.000Z",
        puzzle_correct: true,
        rated: true,
        incorrect_move: null,
      })),
    );
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
        first_attempt_duration_ms: 65_000,
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
    mocks.fetchPrimaryPlayerNicknames.mockReset().mockResolvedValue([]);
    mocks.fetchPuzzleUserRating.mockReset().mockResolvedValue({
      username: "solver",
      rating: 2000,
      ratingDeviation: 350,
      attempts: 0,
      successes: 0,
      updatedAt: null,
      lastAttemptAt: null,
    });
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
    mocks.loadPuzzleTagVotes
      .mockReset()
      .mockResolvedValue([{ tag: "fork", up: 3, down: 0, vote: 0 }]);
    mocks.voteOnPuzzleTag.mockReset();
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
    mocks.loadPuzzleSolverIndex.mockReset().mockImplementation(() => mocks.loadPuzzleCatalog());
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
        white_player: "white-user",
        black_player: "black-user",
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
    expect(mocks.loadPuzzleSolverIndex).toHaveBeenCalledOnce();
    expect(mocks.loadPuzzlesById).toHaveBeenCalled();
    expect(mocks.loadPuzzlesById.mock.calls[0]?.[0]).toHaveLength(4);
    for (const [puzzleIds] of mocks.loadPuzzlesById.mock.calls) {
      expect(puzzleIds.length).toBeLessThanOrEqual(4);
    }
  });

  it("labels a puzzle when the user's current attempt is unrated", async () => {
    mocks.fetchPuzzleProgressRowsForUsername.mockResolvedValueOnce([
      {
        puzzle_id: "1369",
        first_attempt_at: "2026-10-02T00:00:00.000Z",
        puzzle_correct: true,
        rated: false,
        incorrect_move: null,
      },
    ]);

    render(<PuzzleSolverPage />);

    expect((await screen.findAllByText("Unrated")).length).toBeGreaterThan(0);
  });

  it("locks the board and explains the UTC reset after 200 attempts today", async () => {
    const attemptedAt = new Date().toISOString();
    mocks.fetchPuzzleProgressRowsForUsername.mockResolvedValueOnce(
      Array.from({ length: 200 }, (_, index) => ({
        puzzle_id: String(index === 0 ? 1369 : index + 2000),
        first_attempt_at: attemptedAt,
        puzzle_correct: true,
        rated: true,
        incorrect_move: null,
      })),
    );

    render(<PuzzleSolverPage />);

    expect(await screen.findByText("No more puzzles today")).toBeInTheDocument();
    await waitFor(() => expect(mocks.chessboardProps.at(-1)?.disabled).toBe(true));
    expect(screen.getByText(/come back after 00:00 UTC/i)).toBeInTheDocument();
  });

  it("waits for progress and skips rated and unrated attempted puzzles", async () => {
    mocks.routeParams = { puzzleId: "", setKey: "" };
    mocks.loadPuzzleCatalog.mockResolvedValueOnce(
      [1, 2, 3].map((puzzleId) => ({
        id: puzzleId,
        fen: "",
        solution: "",
        puzzleId,
        author: mocks.puzzleAuthor,
        event: "ACL 2024",
        explanation: "",
      })),
    );

    let resolveProgress: (rows: Array<{ puzzle_id: string; rated: boolean }>) => void = () =>
      undefined;
    mocks.fetchPuzzleProgressRowsForUsername.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProgress = resolve;
      }),
    );

    render(<PuzzleSolverPage />);

    await waitFor(() => expect(mocks.loadPuzzleSolverIndex).toHaveBeenCalledOnce());
    expect(mocks.navigate).not.toHaveBeenCalled();

    resolveProgress([
      { puzzle_id: "1", rated: true },
      { puzzle_id: "2", rated: false },
    ]);

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/solve/$puzzleId",
        params: { puzzleId: "3" },
        replace: true,
      }),
    );
  });

  it("does not fall back to a previously attempted puzzle when none remain", async () => {
    mocks.routeParams = { puzzleId: "", setKey: "" };
    mocks.attemptedPuzzleIds = new Set(["1"]);
    mocks.loadPuzzleCatalog.mockResolvedValueOnce([
      {
        id: 1,
        fen: "",
        solution: "",
        puzzleId: 1,
        author: mocks.puzzleAuthor,
        event: "ACL 2024",
        explanation: "",
      },
    ]);

    render(<PuzzleSolverPage />);

    await waitFor(() => expect(mocks.fetchPuzzleProgressRowsForUsername).toHaveBeenCalledOnce());
    await act(async () => Promise.resolve());
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("mock-board")).not.toBeInTheDocument();
  });

  it("uses an in-flight prefetch and does not loop back to a seen puzzle", async () => {
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
    vi.spyOn(window.crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint32Array)[0] = 0;
      return array;
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

    await user.click(nextButton);
    const navigatedPuzzleIds = mocks.navigate.mock.calls.map(
      ([options]) => options.params?.puzzleId,
    );
    expect(navigatedPuzzleIds.slice(-2)).toHaveLength(2);
    expect(new Set(navigatedPuzzleIds.slice(-2))).toHaveLength(2);
    expect(navigatedPuzzleIds.slice(-2)).not.toContain("1");
  });

  it.each([
    ["1. O-O", 0],
    ["1. Rf8", 1],
  ])("advances into the %s option line", async (optionName, lineIndex) => {
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    await screen.findByTestId("mock-board");
    act(() => {
      mocks.chessboardProps.at(-1)?.onAttemptResolved?.({
        puzzleId: 1369,
        puzzleCorrect: true,
        incorrectMove: null,
        correctMove: "1. O-O",
      });
    });
    const analysis = await screen.findByLabelText("Puzzle analysis");
    const optionButtons = await within(analysis).findAllByRole("button", { name: optionName });
    await user.click(optionButtons.at(-1)!);

    await waitFor(() => {
      expect(mocks.chessboardProps.at(-1)?.solutionNavigation).toEqual({
        type: "solution",
        line: lineIndex,
        ply: 1,
      });
    });
  });

  it("keeps original solution lines when board analysis adds a variation", async () => {
    render(<PuzzleSolverPage />);

    await screen.findByTestId("mock-board");
    act(() => {
      mocks.chessboardProps.at(-1)?.onAttemptResolved?.({
        puzzleId: 1369,
        puzzleCorrect: true,
        incorrectMove: null,
        correctMove: "1. O-O",
      });
    });
    await screen.findByRole("button", { name: "Toggle position analysis" });

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

    const variations = await screen.findByRole("list", { name: "Analysis variations" });
    expect(within(variations).getByRole("button", { name: "1. O-O" })).toBeVisible();
    expect(within(variations).getByRole("button", { name: "1. Rf8" })).toBeVisible();
    expect(within(variations).getByRole("button", { name: "1... Kd7" })).toBeVisible();
  });

  it("uses the mouse wheel for moves only after a solution move is selected", async () => {
    const user = userEvent.setup();
    const { container } = render(<PuzzleSolverPage />);
    await screen.findByTestId("mock-board");
    const boardFrame = container.querySelector(".boardFrame")!;

    fireEvent.wheel(boardFrame, { deltaY: 12 });
    const navigationBeforeReveal = mocks.chessboardProps.at(-1)?.solutionNavigation;
    expect(navigationBeforeReveal === null || navigationBeforeReveal === undefined).toBe(true);

    act(() => {
      mocks.chessboardProps.at(-1)?.onAttemptResolved?.({
        puzzleId: 1369,
        puzzleCorrect: true,
        incorrectMove: null,
        correctMove: "1. O-O",
      });
    });
    const analysis = await screen.findByLabelText("Puzzle analysis");
    const optionButtons = await within(analysis).findAllByRole("button", { name: "1. O-O" });
    await user.click(optionButtons.at(-1)!);
    fireEvent.wheel(boardFrame, { deltaY: 12 });

    await waitFor(() =>
      expect(mocks.chessboardProps.at(-1)?.solutionNavigation).toEqual({
        type: "command",
        command: "next",
      }),
    );
  });

  it("shows puzzle motifs after the puzzle has been attempted", async () => {
    render(<PuzzleSolverPage />);

    const motifList = await screen.findByLabelText("Tags on this puzzle");
    expect(within(motifList).getByText("Fork")).toBeInTheDocument();
    expect(
      within(motifList).getByRole("button", { name: /View definition for Fork/ }),
    ).toBeInTheDocument();
    expect(
      within(motifList).queryByRole("button", { name: "Remove fork" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add tag" })).not.toBeInTheDocument();
  });

  it("uses the player's primary nickname for the puzzle author link", async () => {
    mocks.fetchPrimaryPlayerNicknames.mockResolvedValueOnce([
      { username: "admin", nickname: "Puzzle Curator", is_primary: true },
    ]);

    render(<PuzzleSolverPage />);

    expect(await screen.findByRole("link", { name: "Puzzle Curator" })).toBeInTheDocument();
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

  it("keeps puzzle motifs hidden before a regular user attempts the puzzle", async () => {
    mocks.attemptedPuzzleIds = new Set();
    render(<PuzzleSolverPage />);

    await screen.findByTestId("mock-board");
    expect(screen.queryByLabelText("Puzzle tags")).not.toBeInTheDocument();
  });

  it("shows a positive subtag instead of its parent and keeps hidden tags votable", async () => {
    const fork = { tag: "fork", up: 3, down: 0, vote: 0 };
    const epaulette = { tag: "epaulette_fork", up: 1, down: 0, vote: 0 };
    mocks.loadPuzzleTagVotes.mockResolvedValue([fork, epaulette]);
    mocks.voteOnPuzzleTag
      .mockResolvedValueOnce([fork, { ...epaulette, down: 1, vote: -1 }])
      .mockResolvedValueOnce([fork, epaulette]);
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    const motifs = await screen.findByLabelText("Tags on this puzzle");
    const parentButton = { name: /^View definition for Fork\b/ };
    const subtagButton = { name: /^View definition for Epaulette fork\b/ };
    const subtag = await within(motifs).findByRole("button", subtagButton);
    expect(within(motifs).queryByRole("button", parentButton)).not.toBeInTheDocument();
    await user.click(subtag);
    const dialog = screen.getByRole("dialog", { name: "Epaulette fork" });
    expect(await within(dialog).findByText("Unconfirmed")).toBeInTheDocument();
    const downvote = { name: /Downvote Epaulette fork/ };
    await user.click(within(dialog).getByRole("button", downvote));
    expect(await within(dialog).findByText("Hidden")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close tag definition" }));
    expect(within(motifs).queryByRole("button", subtagButton)).not.toBeInTheDocument();
    expect(within(motifs).getByRole("button", parentButton)).toBeInTheDocument();

    await user.click(within(motifs).getByRole("button", { name: "Vote on tags" }));
    const picker = screen.getByRole("region", { name: "Vote on any tag" });
    await user.type(within(picker).getByRole("searchbox"), "fork");
    await user.click(within(picker).getByRole("button", { ...downvote, pressed: true }));
    expect(mocks.voteOnPuzzleTag).toHaveBeenLastCalledWith(1369, "epaulette_fork", 0);
    expect(await within(motifs).findByRole("button", subtagButton)).toBeInTheDocument();
    expect(within(motifs).queryByRole("button", parentButton)).not.toBeInTheDocument();
    expect(within(picker).getByRole("button", { name: /^Upvote Fork\b/ })).toBeInTheDocument();
  });

  it("keeps the solution hidden after a wrong move until the player gives up", async () => {
    mocks.attemptedPuzzleIds = new Set();
    let now = 0;
    let nextIntervalId = 0;
    const activeIntervals = new Map<number, () => void>();
    const performanceNow = vi.spyOn(window.performance, "now").mockImplementation(() => now);
    const setInterval = vi.spyOn(window, "setInterval").mockImplementation((callback) => {
      nextIntervalId += 1;
      activeIntervals.set(nextIntervalId, callback as () => void);
      return nextIntervalId as unknown as ReturnType<typeof window.setInterval>;
    });
    const clearInterval = vi.spyOn(window, "clearInterval").mockImplementation((intervalId) => {
      activeIntervals.delete(intervalId as unknown as number);
    });
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    const explanationTab = await screen.findByRole("tab", { name: "Explanation" });
    expect(explanationTab).toBeDisabled();
    expect(screen.getByLabelText("Elapsed time 0:00")).toBeInTheDocument();

    now = 1_250;
    act(() => activeIntervals.forEach((tick) => tick()));
    expect(screen.getByLabelText("Elapsed time 0:01")).toBeInTheDocument();

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
    expect(explanationTab).toHaveAttribute("aria-selected", "false");
    expect(mocks.chessboardProps.at(-1)?.showSolution).toBe(false);
    const moveNavigation = screen.getByLabelText("Move navigation");
    expect(within(moveNavigation).getByRole("button", { name: "Previous move" })).toBeVisible();
    expect(within(moveNavigation).getByRole("button", { name: "Next move" })).toBeVisible();
    expect(within(moveNavigation).queryByTitle("Opening explorer")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Give up and reveal the solution" }));

    await waitFor(() => {
      expect(mocks.chessboardProps.at(-1)?.showSolution).toBe(true);
      expect(mocks.chessboardProps.at(-1)?.analysisMode).toBe(true);
    });
    expect(
      screen.queryByRole("button", { name: "Give up and reveal the solution" }),
    ).not.toBeInTheDocument();
    expect(activeIntervals.size).toBe(0);

    now = 4_000;
    act(() => activeIntervals.forEach((tick) => tick()));
    expect(screen.getByLabelText("Elapsed time 0:01")).toBeInTheDocument();
    clearInterval.mockRestore();
    setInterval.mockRestore();
    performanceNow.mockRestore();
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

  it("locks other attempts until the current user has attempted the puzzle", async () => {
    mocks.attemptedPuzzleIds = new Set();

    render(<PuzzleSolverPage />);

    const otherAttemptsTab = await screen.findByRole("tab", { name: "Other attempts" });
    await waitFor(() => expect(otherAttemptsTab).toBeDisabled());
  });

  it("shows an attempt time when one was recorded", async () => {
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    await user.click(await screen.findByRole("tab", { name: "Other attempts" }));

    expect(await screen.findByLabelText("Attempt time 1:05")).toHaveTextContent("1:05");
  });

  it("can hide attempt answers for sharing", async () => {
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    await user.click(await screen.findByRole("tab", { name: "Other attempts" }));
    expect(await screen.findByLabelText("Played 1. Rf8")).toBeInTheDocument();
    expect(screen.getByLabelText("Played 2. Nf3+")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Hide answers" }));

    expect(screen.queryByLabelText("Played 1. Rf8")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Played 2. Nf3+")).not.toBeInTheDocument();
  });

  it("retries loading other attempts after a request fails", async () => {
    const user = userEvent.setup();
    mocks.fetchPuzzleAttemptsForPuzzle
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockRejectedValueOnce(new Error("Network unavailable"));

    render(<PuzzleSolverPage />);

    await user.click(await screen.findByRole("tab", { name: "Other attempts" }));
    expect(await screen.findByText("Could not load attempts.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByLabelText("Attempt time 1:05")).toHaveTextContent("1:05");
    expect(mocks.fetchPuzzleAttemptsForPuzzle).toHaveBeenCalledTimes(3);
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
    expect(screen.queryByRole("tab", { name: "Solution" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Toggle position analysis" }),
    ).not.toBeInTheDocument();
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

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Toggle position analysis" })).toBeInTheDocument(),
    );
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
    mocks.recordPuzzleProgress.mockResolvedValueOnce({
      rated: true,
      ratingEvent: {
        username: "solver",
        puzzleId: "1369",
        attemptedAt: "2026-09-29T00:00:00.000Z",
        puzzleCorrect: false,
        userRatingBefore: 2000,
        userRatingAfter: 1978,
        userRatingChange: -22,
        userRatingDeviationBefore: 350,
        userRatingDeviationAfter: 290,
        puzzleRatingBefore: 2100,
        puzzleRatingAfter: 2117,
        puzzleRatingChange: 17,
      },
    });
    mocks.routeParams = {
      puzzleId: "1369",
      setId: "4b648b2a-e2bf-49dc-aaed-235c05615d1b",
    };

    render(<PuzzleSolverPage />);

    await screen.findByTestId("mock-board");
    expect(await screen.findByLabelText("Your puzzle rating is 2000")).toBeVisible();
    expect(screen.queryByLabelText(/V3, 2100 Elo/)).not.toBeInTheDocument();
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
      mocks.chessboardProps.at(-1)?.onStateChange?.({
        fen: "rn2k2r/pp5p/1qpp2p1/2Q5/1b2P3/2N5/PPP3PP/R3KB1R b KQkq - 1 12",
        turn: "white",
        status: "Incorrect",
        error: "",
        lineMoves: ["Kd7"],
        solutionLines: [["O-O"]],
        solutionLineIndex: 0,
        lineIndex: 1,
        viewingSolution: false,
        showWrongMove: true,
        showRetryMove: false,
        solved: false,
      });
    });

    await waitFor(() =>
      expect(mocks.recordPuzzleProgress).toHaveBeenCalledWith({
        username: "solver",
        puzzleId: "1369",
        puzzleCorrect: false,
        attemptDurationMs: expect.any(Number),
        incorrectMove: "1... Kd7",
        correctMove: null,
      }),
    );
    expect(mocks.recordCustomPuzzleSetProgress).toHaveBeenCalledWith(
      "4b648b2a-e2bf-49dc-aaed-235c05615d1b",
      "1369",
      false,
    );
    const updatedPuzzleRating = await screen.findByLabelText(/V3, 2100 Elo, increased by 17/);
    expect(updatedPuzzleRating).toHaveClass("positive");
    expect(updatedPuzzleRating).toHaveTextContent("V32100+17");
    const updatedRating = await screen.findByLabelText(
      "Your puzzle rating is 1978, decreased by 22",
    );
    expect(updatedRating).toHaveClass("negative");
    expect(updatedRating).toHaveTextContent("1978-22");
    expect(
      screen.queryByLabelText("Puzzle rating was 2100 and increased by 17"),
    ).not.toBeInTheDocument();
  });

  it("omits attempt time after the timer reaches 60 minutes", async () => {
    mocks.attemptedPuzzleIds = new Set();
    let now = 0;
    const performanceNow = vi.spyOn(window.performance, "now").mockImplementation(() => now);

    render(<PuzzleSolverPage />);
    await screen.findByTestId("mock-board");
    now = 3_600_001;

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
        attemptDurationMs: null,
        incorrectMove: "1... Kd7",
        correctMove: null,
      }),
    );
    performanceNow.mockRestore();
  });

  it("does not track elapsed time for a previously solved puzzle", async () => {
    render(<PuzzleSolverPage />);

    await screen.findByRole("button", { name: "Toggle position analysis" });
    expect(screen.queryByLabelText(/^Elapsed time/)).not.toBeInTheDocument();
  });

  it("keeps the original puzzle start time after the solver remounts", async () => {
    mocks.attemptedPuzzleIds = new Set();
    let now = 1_000_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => now);

    const firstRender = render(<PuzzleSolverPage />);
    await screen.findByTestId("mock-board");
    firstRender.unmount();

    now += 65_000;
    render(<PuzzleSolverPage />);

    expect(await screen.findByLabelText("Elapsed time 1:05")).toBeInTheDocument();
    dateNow.mockRestore();
  });

  it("starts a fresh timer when the stored attempt is more than 30 minutes old", async () => {
    mocks.attemptedPuzzleIds = new Set();
    let now = 1_000_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => now);

    const firstRender = render(<PuzzleSolverPage />);
    await screen.findByTestId("mock-board");
    firstRender.unmount();

    now += 30 * 60 * 1000 + 1;
    render(<PuzzleSolverPage />);

    expect(await screen.findByLabelText("Elapsed time 0:00")).toBeInTheDocument();
    dateNow.mockRestore();
  });

  it("updates the elapsed timer without rerendering the chessboard", async () => {
    mocks.attemptedPuzzleIds = new Set();
    let now = 0;
    const timerTicks: Array<() => void> = [];
    const performanceNow = vi.spyOn(window.performance, "now").mockImplementation(() => now);
    const setInterval = vi.spyOn(window, "setInterval").mockImplementation((callback) => {
      timerTicks.push(callback as () => void);
      return 1 as unknown as ReturnType<typeof window.setInterval>;
    });

    render(<PuzzleSolverPage />);
    await screen.findByTestId("mock-board");
    await waitFor(() => expect(timerTicks.length).toBeGreaterThan(0));
    const boardRenderCount = mocks.chessboardProps.length;

    now = 1_250;
    act(() => timerTicks.forEach((tick) => tick()));

    expect(screen.getByLabelText("Elapsed time 0:01")).toBeInTheDocument();
    expect(mocks.chessboardProps).toHaveLength(boardRenderCount);
    setInterval.mockRestore();
    performanceNow.mockRestore();
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
