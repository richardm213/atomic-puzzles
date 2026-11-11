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
    blindFen?: string;
    autoplayIntro?: boolean;
    onIntroEnd?: (durationMs: number, completed: boolean) => void;
    analysisMode?: boolean;
    showSolution?: boolean;
    solutionNavigation?: SolutionNavigation | null;
    onAttemptResolved?: (attempt: AttemptResolved) => void;
    onStateChange?: (state: unknown) => void;
  }>,
  attemptedPuzzleIds: new Set(["1369"]),
  excludeOwnPuzzles: false,
  blindPuzzles: { enabled: false, plies: 5 },
  fetchPuzzleProgressRowsForUsername: vi.fn(),
  fetchPuzzleRatingExclusions: vi.fn(),
  setOwnPuzzlePermanentlyUnrated: vi.fn(),
  fetchPuzzleGradingState: vi.fn(),
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

vi.mock("../../context/AppSettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../context/AppSettings")>()),
  useAppSettings: () => ({
    showPuzzleTimer: true,
    excludeOwnPuzzles: mocks.excludeOwnPuzzles,
    puzzleAnalysisTarget: "atomic-puzzles",
    blindPuzzles: mocks.blindPuzzles,
  }),
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
  fetchPuzzleRatingExclusions: mocks.fetchPuzzleRatingExclusions,
  setOwnPuzzlePermanentlyUnrated: mocks.setOwnPuzzlePermanentlyUnrated,
  fetchPuzzleGradingState: mocks.fetchPuzzleGradingState,
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
          playback: {
            start: lineIndexPly > 0,
            previous: lineIndexPly > 0,
            next: Boolean(showSolution && lineIndexPly < lineMoves.length),
            end: Boolean(showSolution && lineIndexPly < lineMoves.length),
          },
          fen,
          turn: "black",
          status: "black to move",
          winner: undefined,
          error: "",
          lineMoves,
          solutionLines,
          view: {
            line:
              (showSolution ?? false)
                ? { source: "solution", index: lineIndex }
                : { source: "history" },
            position: lineIndexPly,
          },
          solved: false,
        });
      }, [fen, onStateChange, showSolution, solutionNavigation]);

      return React.createElement("div", { "data-testid": "mock-board" });
    },
  };
});

import { castlingRightsFromFen } from "./castlingRights";
import { PuzzleSolverPage, PuzzleTestPage } from "./PuzzleSolver";

const render = (element: ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return testingLibraryRender(element, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
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
    mocks.blindPuzzles = { enabled: false, plies: 5 };
    mocks.fetchPuzzleRatingExclusions.mockReset().mockResolvedValue([]);
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
    mocks.excludeOwnPuzzles = false;
    mocks.setOwnPuzzlePermanentlyUnrated.mockReset().mockResolvedValue(undefined);
    mocks.fetchPuzzleGradingState.mockReset().mockImplementation(async (puzzleId: string) => ({
      runId: mocks.attemptedPuzzleIds.has(puzzleId) ? "bf6cd63f-c399-4d3c-905c-04ab563e8949" : null,
      graded: true,
      availableAt: null,
      permanent: false,
      hasAttempted: mocks.attemptedPuzzleIds.has(puzzleId),
      hasSolved: false,
      misses: mocks.attemptedPuzzleIds.has(puzzleId) ? 1 : 0,
      color: "red",
    }));
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

  it.each(["solver", ""])(
    "blocks puzzle tests for non-admin identity %j before loading puzzles",
    (username) => {
      mocks.username = username;
      render(<PuzzleTestPage />);
      expect(screen.getByText("This page is restricted.")).toBeVisible();
      expect(screen.queryByTestId("mock-board")).not.toBeInTheDocument();
      expect(mocks.loadPuzzlesById).not.toHaveBeenCalled();
      expect(mocks.loadPuzzleCatalog).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    "unlocks test puzzle details without saving an attempt (correct: %s)",
    async (puzzleCorrect) => {
      mocks.username = "seaside_tiramisu";
      const user = userEvent.setup();
      render(<PuzzleTestPage />);

      await screen.findByTestId("mock-board");
      expect(mocks.loadPuzzlesById).toHaveBeenCalledWith([1369], {
        activePuzzleId: 1369,
        testMode: true,
      });
      expect(await screen.findByRole("region", { name: "Puzzle tags" })).toBeVisible();
      if (puzzleCorrect) {
        mocks.voteOnPuzzleTag.mockResolvedValue([{ tag: "endgame", up: 3, down: 0, vote: 1 }]);
        await user.click(screen.getByRole("button", { name: "Add tag" }));
        await user.type(screen.getByRole("searchbox", { name: "Search tags" }), "endgame");
        await user.click(screen.getByRole("button", { name: /^Upvote Endgame \(/ }));
        expect(mocks.voteOnPuzzleTag).toHaveBeenCalledWith(1369, "endgame", 1);
        await user.click(screen.getByRole("button", { name: "Close tag picker" }));
      }
      const explanationTab = screen.getByRole("tab", { name: "Explanation" });
      const attemptsTab = screen.getByRole("tab", { name: "Other attempts" });
      expect(explanationTab).toBeDisabled();
      expect(attemptsTab).toBeDisabled();

      act(() => {
        mocks.chessboardProps.at(-1)?.onAttemptResolved?.({
          puzzleId: 1369,
          puzzleCorrect,
          incorrectMove: puzzleCorrect ? null : "12... Kd7",
          correctMove: puzzleCorrect ? "12... O-O" : null,
        });
      });

      if (!puzzleCorrect) {
        expect(explanationTab).toBeDisabled();
        expect(attemptsTab).toBeDisabled();
        expect(mocks.fetchPuzzleAttemptsForPuzzle).not.toHaveBeenCalled();
        await user.click(
          await screen.findByRole("button", { name: "Resign and reveal the solution" }),
        );
        fireEvent.click(await screen.findByRole("button", { name: "Confirm resignation" }));
      }

      await user.click(explanationTab);
      expect(screen.getByText(mocks.puzzleExplanation)).toBeVisible();
      await user.click(attemptsTab);
      expect(await screen.findByRole("list", { name: "Other puzzle attempts" })).toHaveTextContent(
        "alpha",
      );

      expect(mocks.fetchPuzzleProgressRowsForUsername).not.toHaveBeenCalled();
      expect(mocks.recordPuzzleProgress).not.toHaveBeenCalled();
      expect(
        window.localStorage.getItem("atomic-puzzles.puzzle-attempt-started-at.v1:1369"),
      ).toBeNull();
    },
  );

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

  it.each([
    { visit: "an unrated first attempt", ownPuzzle: true, hasAttempt: false, blind: true },
    {
      visit: "an author's retry after an unrated attempt",
      ownPuzzle: true,
      hasAttempt: true,
      blind: true,
    },
    { visit: "a rated first attempt", ownPuzzle: false, hasAttempt: false, blind: false },
  ])("applies the Blind mode setting on $visit", async ({ ownPuzzle, hasAttempt, blind }) => {
    const earliestFen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    mocks.blindPuzzles = { enabled: true, plies: 50 };
    mocks.fetchPuzzleProgressRowsForUsername.mockResolvedValueOnce(
      hasAttempt
        ? [
            {
              puzzle_id: "1369",
              first_attempt_at: "2026-10-02T00:00:00.000Z",
              puzzle_correct: true,
              rated: false,
            },
          ]
        : [],
    );
    mocks.loadPuzzlesById.mockResolvedValueOnce([
      {
        id: 1369,
        puzzleId: 1369,
        fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
        solution: "2. e5",
        author: ownPuzzle ? mocks.username : "other-creator",
        created_at: new Date(Date.now() - 60_000).toISOString(),
        explanation: "",
        tags: [],
        leadIn: { beforeFen: earliestFen, moves: ["c5"] },
      },
    ]);

    render(<PuzzleSolverPage />);

    await screen.findByTestId("mock-board");
    expect(mocks.chessboardProps.at(-1)?.blindFen).toBe(blind ? earliestFen : undefined);
    if (blind) {
      const panel = screen.getByRole("region", { name: "Blind mode" });
      expect(within(panel).getByRole("list")).toHaveTextContent("1... c5");
      expect(screen.queryByText("Unrated")).not.toBeInTheDocument();
    } else {
      expect(screen.queryByRole("region", { name: "Blind mode" })).not.toBeInTheDocument();
    }
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

  it("keeps set order at the daily limit and only advances to an attempted puzzle", async () => {
    mocks.routeParams = { puzzleId: "1369", setKey: "1" };
    mocks.loadPuzzleCatalog.mockResolvedValueOnce(await mocks.loadPuzzlesById([1371, 1369, 1370]));
    mocks.fetchPuzzleProgressRowsForUsername.mockResolvedValueOnce(
      Array.from({ length: 200 }, (_, index) => ({
        puzzle_id: String(index < 2 ? 1369 + index : 2000 + index),
        first_attempt_at: new Date().toISOString(),
        puzzle_correct: true,
        rated: true,
      })),
    );

    const view = render(<PuzzleSolverPage />);
    await screen.findByText("No more puzzles today");
    fireEvent.click(screen.getAllByRole("button", { name: "Next" })[0]!);
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/solve/set/$setKey/$puzzleId",
      params: { setKey: "1", puzzleId: "1370" },
      replace: true,
    });

    mocks.routeParams = { puzzleId: "1370", setKey: "1" };
    view.rerender(<PuzzleSolverPage />);
    expect(screen.getAllByRole("button", { name: "Next" })[0]).toBeDisabled();
  });

  it("waits for eligibility and skips attempted puzzles, active or permanent exclusions, and creator cooldowns", async () => {
    mocks.routeParams = { puzzleId: "", setKey: "" };
    mocks.loadPuzzleCatalog.mockResolvedValueOnce(
      [1, 2, 3, 4, 5, 6].map((puzzleId) => ({
        id: puzzleId,
        fen: "",
        solution: "",
        puzzleId,
        author: puzzleId === 4 ? mocks.username : mocks.puzzleAuthor,
        created_at: new Date().toISOString(),
        event: "ACL 2024",
        explanation: "",
      })),
    );

    mocks.fetchPuzzleRatingExclusions.mockResolvedValueOnce([
      { puzzle_id: "3", expires_at: "2099-01-01T00:00:00Z" },
      { puzzle_id: "5", expires_at: "2020-01-01T00:00:00Z" },
      { puzzle_id: "6", expires_at: "2020-01-01T00:00:00Z", permanent: true },
    ]);

    let resolveProgress: (
      rows: Array<{ puzzle_id: string; rated: boolean; grading_available_at?: string }>,
    ) => void = () => undefined;
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
      { puzzle_id: "5", rated: false, grading_available_at: "2020-01-01T00:00:00Z" },
    ]);

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/solve/$puzzleId",
        params: { puzzleId: "5" },
        replace: true,
      }),
    );
  });

  it("lets an author permanently opt out before attempting and restores the checked state", async () => {
    mocks.puzzleAuthor = mocks.username;
    mocks.fetchPuzzleProgressRowsForUsername.mockResolvedValue([]);
    const view = render(<PuzzleSolverPage />);
    const checkbox = await screen.findByRole("checkbox", { name: "Permanently unrated" });
    expect(checkbox).not.toBeChecked();
    expect(checkbox.closest("label")).toHaveAttribute(
      "title",
      expect.stringContaining("remember this puzzle"),
    );
    await userEvent.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    await waitFor(() => expect(checkbox).toBeEnabled());
    await userEvent.click(checkbox);
    await waitFor(() => expect(checkbox).not.toBeChecked());
    expect(mocks.setOwnPuzzlePermanentlyUnrated).toHaveBeenLastCalledWith("1369", false);
    await userEvent.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(mocks.setOwnPuzzlePermanentlyUnrated).toHaveBeenCalledWith("1369", true);
    view.unmount();
    mocks.fetchPuzzleRatingExclusions.mockResolvedValue([
      { puzzle_id: "1369", expires_at: "2020-01-01T00:00:00Z", permanent: true },
    ]);
    render(<PuzzleSolverPage />);
    const restored = await screen.findByRole("checkbox", { name: "Permanently unrated" });
    expect(restored).toBeChecked();
    expect(restored).toBeEnabled();
  });

  it("includes own puzzles by default and rebuilds the prepared queue when the setting changes", async () => {
    const [active] = await mocks.loadPuzzlesById([1369]);
    mocks.loadPuzzleCatalog.mockResolvedValueOnce([
      active,
      { ...active, id: 2, puzzleId: 2, author: "SoLvEr", created_at: "2020-01-01T00:00:00Z" },
    ]);
    const view = render(<PuzzleSolverPage />);
    const next = screen.getAllByRole("button", { name: "Next" })[0]!;
    await waitFor(() => expect(next).toBeEnabled());

    mocks.excludeOwnPuzzles = true;
    view.rerender(<PuzzleSolverPage />);
    expect(next).toBeDisabled();

    mocks.excludeOwnPuzzles = false;
    view.rerender(<PuzzleSolverPage />);
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/solve/$puzzleId",
      params: { puzzleId: "2" },
      replace: true,
    });
  });

  it("allows practice while grading is on cooldown", async () => {
    mocks.blindPuzzles = { enabled: true, plies: 1 };
    mocks.fetchPuzzleRatingExclusions.mockResolvedValueOnce([
      { puzzle_id: "1369", expires_at: "2099-01-01T00:00:00Z" },
    ]);
    mocks.fetchPuzzleGradingState.mockResolvedValue({
      runId: null,
      graded: false,
      availableAt: "2099-01-01T00:00:00Z",
      permanent: false,
      hasAttempted: true,
      hasSolved: false,
      misses: 0,
      color: "red",
    });
    render(<PuzzleSolverPage />);
    await waitFor(() => expect(mocks.chessboardProps.at(-1)?.disabled).toBe(false));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-board")).toBeInTheDocument();
  });

  it("starts a fresh solve after an earlier unrated solve expires", async () => {
    mocks.fetchPuzzleProgressRowsForUsername.mockResolvedValueOnce([
      { puzzle_id: "1369", rated: false, puzzle_correct: true },
    ]);
    mocks.fetchPuzzleRatingExclusions.mockResolvedValueOnce([
      { puzzle_id: "1369", expires_at: "2020-01-01T00:00:00Z" },
    ]);
    render(<PuzzleSolverPage />);
    await waitFor(() => expect(mocks.fetchPuzzleRatingExclusions).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.chessboardProps.at(-1)?.analysisMode).toBe(false));
    expect(mocks.chessboardProps.at(-1)?.showSolution).toBe(false);
    expect(screen.getByRole("tab", { name: "Other attempts" })).toBeDisabled();
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
    const commitNavigation = () => {
      const puzzleId = mocks.navigate.mock.calls.at(-1)?.[0].params?.puzzleId;
      expect(puzzleId).toBeTruthy();
      mocks.routeParams = { ...mocks.routeParams, puzzleId };
      rerender(<PuzzleSolverPage />);
    };
    vi.spyOn(window.crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint32Array)[0] = 0;
      return array;
    });

    const user = userEvent.setup();
    const { rerender } = render(<PuzzleSolverPage />);

    const initialBoard = await screen.findByTestId("mock-board");
    await waitFor(() => expect(prefetchedIds).toHaveLength(3));
    expect(mocks.loadPuzzlesById).toHaveBeenCalledWith(prefetchedIds, { activePuzzleId: null });

    const nextButton = screen.getAllByRole("button", { name: "Next" })[0]!;
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(screen.getByTestId("mock-board")).toBe(initialBoard);
    commitNavigation();
    expect(screen.getByText("Waiting for puzzle data...")).toBeInTheDocument();

    resolvePrefetch(prefetchedIds.map(puzzleDetails));

    await waitFor(() => expect(screen.getByTestId("mock-board")).toBeInTheDocument());
    expect(screen.queryByText("Waiting for puzzle data...")).not.toBeInTheDocument();

    await user.click(nextButton);
    commitNavigation();
    const navigatedPuzzleIds = mocks.navigate.mock.calls.map(
      ([options]) => options.params?.puzzleId,
    );
    expect(navigatedPuzzleIds.slice(-2)).toHaveLength(2);
    expect(new Set(navigatedPuzzleIds.slice(-2))).toHaveLength(2);
    expect(navigatedPuzzleIds.slice(-2)).not.toContain("1");
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(mocks.navigate.mock.calls.at(-1)?.[0].params?.puzzleId).toBe(navigatedPuzzleIds.at(-2));
    commitNavigation();
    expect(screen.getByTestId("mock-board")).toBeInTheDocument();
    expect(mocks.loadPuzzlesById).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["12... O-O", 0],
    ["12... Rf8", 1],
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
    expect(mocks.chessboardProps.at(-1)?.showSolution).toBe(true);
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
        view: { line: { source: "custom", index: 0 }, position: 2 },
        solved: false,
      });
    });

    const variations = await screen.findByRole("list", { name: "Analysis variations" });
    expect(within(variations).getByRole("button", { name: "12... O-O" })).toBeVisible();
    expect(within(variations).getByRole("button", { name: "12... Rf8" })).toBeVisible();
    expect(within(variations).getByRole("button", { name: "13. Kd7" })).toBeVisible();
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
    const optionButtons = await within(analysis).findAllByRole("button", { name: "12... O-O" });
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
    fireEvent.click(await screen.findByRole("button", { name: "Resign and reveal the solution" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm resignation" }));

    const motifList = await screen.findByLabelText("Tags on this puzzle");
    expect(within(motifList).getByText("Fork")).toBeInTheDocument();
    expect(
      within(motifList).getByRole("button", { name: /View definition for Fork/ }),
    ).toBeInTheDocument();
    expect(
      within(motifList).queryByRole("button", { name: "Remove fork" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add tag" })).toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: "Resign and reveal the solution" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm resignation" }));

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

  it("shows specific positive tags and restores the parent when a child loses its positive score", async () => {
    const fork = { tag: "fork", up: 3, down: 0, vote: 0 };
    const epaulette = { tag: "epaulette_fork", up: 1, down: 0, vote: 0 };
    const endgame = { tag: "endgame", up: 2, down: 0, vote: 0 };
    mocks.loadPuzzleTagVotes.mockResolvedValue([fork, epaulette, endgame]);
    mocks.voteOnPuzzleTag
      .mockResolvedValueOnce([fork, { ...epaulette, down: 1, vote: -1 }])
      .mockResolvedValueOnce([fork, epaulette]);
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);
    await user.click(await screen.findByRole("button", { name: "Resign and reveal the solution" }));
    await user.click(await screen.findByRole("button", { name: "Confirm resignation" }));

    const motifs = await screen.findByLabelText("Tags on this puzzle");
    const forkButton = { name: /^View definition for Fork\b/ };
    const subtagButton = { name: /^View definition for Epaulette fork\b/ };
    await within(motifs).findByRole("button", subtagButton);
    expect(within(motifs).queryByRole("button", forkButton)).not.toBeInTheDocument();
    expect(
      within(motifs).getByRole("button", { name: /^View definition for Endgame\b/ }),
    ).toBeVisible();
    const addTag = screen.getByRole("button", { name: "Add tag" });

    await user.click(within(motifs).getByRole("button", { name: /^Downvote Epaulette fork\b/ }));
    await waitFor(() =>
      expect(within(motifs).queryByRole("button", subtagButton)).not.toBeInTheDocument(),
    );
    expect(within(motifs).getByRole("button", forkButton)).toBeVisible();
    expect(addTag).toHaveFocus();

    await user.click(addTag);
    const picker = screen.getByRole("region", { name: "Tag picker" });
    await user.type(within(picker).getByRole("searchbox"), "epaulette");
    await user.click(
      within(picker).getByRole("button", { name: /^Undo downvote for Epaulette fork\b/ }),
    );
    const restored = await within(motifs).findByRole("button", subtagButton);
    expect(
      restored.compareDocumentPosition(addTag) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(mocks.voteOnPuzzleTag).toHaveBeenLastCalledWith(1369, "epaulette_fork", 0);
  });

  it("keeps the confirmed tag vote when a save fails and lets the player retry", async () => {
    const fork = { tag: "fork", up: 3, down: 0, vote: 0 };
    mocks.loadPuzzleTagVotes.mockResolvedValue([fork]);
    mocks.voteOnPuzzleTag
      .mockRejectedValueOnce(new Error("Tag vote unavailable"))
      .mockResolvedValueOnce([{ ...fork, up: 4, vote: 1 }]);
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);
    await user.click(await screen.findByRole("button", { name: "Resign and reveal the solution" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm resignation" }));

    const motifs = await screen.findByLabelText("Tags on this puzzle");
    const upvote = await within(motifs).findByRole("button", { name: /^Upvote Fork\b/ });
    await user.click(upvote);

    expect(await screen.findByText("Tag vote unavailable")).toBeVisible();
    expect(upvote).toBeEnabled();
    expect(
      within(motifs).queryByRole("button", { name: /^Undo upvote for Fork\b/ }),
    ).not.toBeInTheDocument();

    await user.click(upvote);
    expect(
      await within(motifs).findByRole("button", { name: /^Undo upvote for Fork\b/ }),
    ).toBeVisible();
    expect(screen.queryByText("Tag vote unavailable")).not.toBeInTheDocument();
    expect(mocks.voteOnPuzzleTag.mock.calls).toEqual([
      [1369, "fork", 1],
      [1369, "fork", 1],
    ]);
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
      mocks.chessboardProps.at(-1)?.onAttemptResolved?.({
        puzzleId: 1369,
        puzzleCorrect: false,
        incorrectMove: "1... Kd7",
        correctMove: null,
      });
      mocks.chessboardProps.at(-1)?.onStateChange?.({
        fen: "rn2k2r/pp5p/1qpp2p1/2Q5/1b2P3/2N5/PPP3PP/R3KB1R b KQkq - 1 12",
        turn: "black",
        status: "Incorrect",
        error: "",
        lineMoves: ["Kd7"],
        solutionLines: [],
        view: { line: { source: "history" }, position: 1 },
        feedback: "wrong",
        solved: false,
      });
    });

    expect(explanationTab).toBeDisabled();
    expect(explanationTab).toHaveAttribute("aria-selected", "false");
    expect(mocks.chessboardProps.at(-1)?.showSolution).toBe(false);
    const moveNavigation = screen.getByLabelText("Move navigation");
    expect(within(moveNavigation).getByRole("button", { name: "Previous move" })).toBeVisible();
    expect(within(moveNavigation).getByRole("button", { name: "Next move" })).toBeVisible();
    expect(within(moveNavigation).queryByTitle("Opening explorer")).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Resign and reveal the solution" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm resignation" }));

    await waitFor(() => {
      expect(mocks.chessboardProps.at(-1)?.showSolution).toBe(true);
      expect(mocks.chessboardProps.at(-1)?.analysisMode).toBe(true);
    });
    expect(
      screen.queryByRole("button", { name: "Resign and reveal the solution" }),
    ).not.toBeInTheDocument();
    expect(activeIntervals.size).toBe(0);

    now = 4_000;
    act(() => activeIntervals.forEach((tick) => tick()));
    expect(screen.getByLabelText("Elapsed time 0:01")).toBeInTheDocument();
    clearInterval.mockRestore();
    setInterval.mockRestore();
    performanceNow.mockRestore();
  });

  it.each([true, false])(
    "lets an author add an explanation in analysis after an attempt (correct: %s)",
    async (puzzleCorrect) => {
      mocks.username = "puzzle_author";
      mocks.puzzleAuthor = "Puzzle_Author";
      mocks.attemptedPuzzleIds = new Set();
      mocks.puzzleExplanation = "";
      const user = userEvent.setup();
      render(<PuzzleSolverPage />);

      const explanationTab = await screen.findByRole("tab", { name: "Explanation" });
      expect(explanationTab).toBeDisabled();

      act(() => {
        mocks.chessboardProps.at(-1)?.onAttemptResolved?.({
          puzzleId: 1369,
          puzzleCorrect,
          incorrectMove: puzzleCorrect ? null : "12... Kd7",
          correctMove: puzzleCorrect ? "12... O-O" : null,
        });
      });

      if (!puzzleCorrect) {
        expect(explanationTab).toBeDisabled();
        expect(screen.queryByRole("button", { name: "Add explanation" })).not.toBeInTheDocument();
        await user.click(
          await screen.findByRole("button", { name: "Resign and reveal the solution" }),
        );
        fireEvent.click(await screen.findByRole("button", { name: "Confirm resignation" }));
      }
      await waitFor(() => expect(mocks.chessboardProps.at(-1)?.analysisMode).toBe(true));
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
    },
  );

  it("lets an author edit an explanation after resigning a replay on mobile", async () => {
    mocks.username = "puzzle_author";
    mocks.puzzleAuthor = "puzzle_author";
    mocks.fetchPuzzleProgressRowsForUsername.mockResolvedValue([
      {
        puzzle_id: "1369",
        first_attempt_at: "2026-01-01T00:00:00.000Z",
        puzzle_correct: true,
        rated: false,
      },
    ]);
    const refreshedUntil = "2099-01-01T00:00:00Z";
    mocks.fetchPuzzleGradingState.mockResolvedValue({
      runId: null,
      graded: false,
      availableAt: refreshedUntil,
      permanent: false,
      hasAttempted: true,
      hasSolved: true,
      misses: 0,
      color: "green",
    });
    vi.mocked(window.matchMedia).mockImplementation(
      (media) =>
        ({
          media,
          matches: media.includes("max-width"),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);

    await screen.findByTestId("mock-board");
    expect(await screen.findByRole("tab", { name: "Explain" })).toBeDisabled();
    expect(await screen.findByRole("tab", { name: "Resign" })).toBeEnabled();
    expect(mocks.chessboardProps.at(-1)?.analysisMode).toBe(false);
    expect(mocks.chessboardProps.at(-1)?.showSolution).toBe(false);

    await user.click(await screen.findByRole("tab", { name: "Resign" }));
    expect(mocks.chessboardProps.at(-1)?.showSolution).toBe(false);
    expect(mocks.recordPuzzleProgress).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("tab", { name: "Confirm resignation" }));

    expect(mocks.chessboardProps.at(-1)?.showSolution).toBe(true);
    await waitFor(() => expect(mocks.recordPuzzleProgress).toHaveBeenCalledOnce());
    expect((await screen.findAllByLabelText(/Grading returns in/)).length).toBeGreaterThan(0);
    const explanationTab = await screen.findByRole("tab", { name: "Explain" });
    expect(explanationTab).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Permanently unrated" })).toBeDisabled();
    await user.click(explanationTab);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("textbox", { name: "Puzzle explanation" })).toHaveValue(
      mocks.puzzleExplanation,
    );
  });

  it.each([true, false])(
    "locks puzzle details again when revisiting your own puzzle (correct: %s)",
    async (puzzleCorrect) => {
      mocks.puzzleAuthor = mocks.username;
      mocks.fetchPuzzleProgressRowsForUsername.mockResolvedValue([]);
      mocks.fetchPuzzleRatingExclusions.mockResolvedValue([
        { puzzle_id: "1369", expires_at: "2020-01-01T00:00:00Z", permanent: true },
      ]);
      mocks.recordPuzzleProgress.mockResolvedValue({ rated: false, ratingEvent: null });
      const user = userEvent.setup();
      const view = render(<PuzzleSolverPage />);
      const tab = await screen.findByRole("tab", { name: "Other attempts" });
      await waitFor(() => expect(mocks.chessboardProps.at(-1)?.onAttemptResolved).toBeDefined());
      expect(tab).toBeDisabled();
      act(() =>
        mocks.chessboardProps.at(-1)?.onAttemptResolved?.({
          puzzleId: "1369",
          puzzleCorrect,
          incorrectMove: puzzleCorrect ? null : "12... Rf8",
          correctMove: puzzleCorrect ? "12... O-O" : null,
        }),
      );
      if (!puzzleCorrect) {
        expect(tab).toBeDisabled();
        await user.click(
          await screen.findByRole("button", { name: "Resign and reveal the solution" }),
        );
        await user.click(await screen.findByRole("button", { name: "Confirm resignation" }));
      }
      await waitFor(() => expect(tab).toBeEnabled());
      expect(screen.getByRole("checkbox", { name: "Permanently unrated" })).toBeDisabled();
      await user.click(tab);
      expect(await screen.findByRole("list", { name: "Other puzzle attempts" })).toBeVisible();
      await waitFor(() =>
        expect(mocks.recordPuzzleProgress).toHaveBeenCalledTimes(puzzleCorrect ? 1 : 2),
      );
      view.unmount();

      mocks.fetchPuzzleProgressRowsForUsername.mockResolvedValue([
        {
          puzzle_id: "1369",
          rated: false,
          puzzle_correct: puzzleCorrect,
          first_attempt_at: "2026-01-01T00:00:00Z",
        },
      ]);
      render(<PuzzleSolverPage />);
      const restored = await screen.findByRole("tab", { name: "Other attempts" });
      await screen.findByTestId("mock-board");
      expect(restored).toBeDisabled();
      expect(screen.getByRole("tab", { name: "Explanation" })).toBeDisabled();
      expect(screen.queryByRole("region", { name: "Puzzle tags" })).not.toBeInTheDocument();

      act(() =>
        mocks.chessboardProps.at(-1)?.onAttemptResolved?.({
          puzzleId: "1369",
          puzzleCorrect,
          incorrectMove: puzzleCorrect ? null : "12... Rf8",
          correctMove: puzzleCorrect ? "12... O-O" : null,
        }),
      );
      if (!puzzleCorrect) {
        expect(restored).toBeDisabled();
        await user.click(
          await screen.findByRole("button", { name: "Resign and reveal the solution" }),
        );
        await user.click(await screen.findByRole("button", { name: "Confirm resignation" }));
      }
      await waitFor(() => expect(restored).toBeEnabled());
      await user.click(restored);
      expect(await screen.findByRole("list", { name: "Other puzzle attempts" })).toBeVisible();
    },
  );

  it("locks other attempts until the current user has attempted the puzzle", async () => {
    mocks.attemptedPuzzleIds = new Set();

    render(<PuzzleSolverPage />);

    const otherAttemptsTab = await screen.findByRole("tab", { name: "Other attempts" });
    await waitFor(() => expect(otherAttemptsTab).toBeDisabled());
  });

  it("shows an attempt time when one was recorded", async () => {
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);
    await user.click(await screen.findByRole("button", { name: "Resign and reveal the solution" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm resignation" }));

    await user.click(await screen.findByRole("tab", { name: "Other attempts" }));

    expect(await screen.findByLabelText("Attempt time 1:05")).toHaveTextContent("1:05");
  });

  it("can hide attempt answers for sharing", async () => {
    const user = userEvent.setup();
    render(<PuzzleSolverPage />);
    await user.click(await screen.findByRole("button", { name: "Resign and reveal the solution" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm resignation" }));

    await user.click(await screen.findByRole("tab", { name: "Other attempts" }));
    expect(await screen.findByLabelText("Played 1. Rf8")).toBeInTheDocument();
    expect(screen.getByLabelText("Played 2. Nf3+")).toBeInTheDocument();
    const attempts = within(screen.getByRole("list", { name: "Other puzzle attempts" }));
    expect(attempts.queryByText("Correct")).not.toBeInTheDocument();
    expect(attempts.queryByText("Incorrect")).not.toBeInTheDocument();
    expect(attempts.getAllByRole("img", { name: "Correct" })[0]).toBeInTheDocument();
    expect(attempts.getByRole("img", { name: "Incorrect" })).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Hide answers" }));

    expect(screen.queryByLabelText("Played 1. Rf8")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Played 2. Nf3+")).not.toBeInTheDocument();
    expect(attempts.queryByText("Correct")).not.toBeInTheDocument();
    expect(attempts.queryByText("Incorrect")).not.toBeInTheDocument();
    expect(attempts.getAllByLabelText("Solved on the first try").length).toBe(2);
  });

  it("retries loading other attempts after a request fails", async () => {
    const user = userEvent.setup();
    mocks.fetchPuzzleAttemptsForPuzzle
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockRejectedValueOnce(new Error("Network unavailable"));

    render(<PuzzleSolverPage />);
    await user.click(await screen.findByRole("button", { name: "Resign and reveal the solution" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm resignation" }));

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
    expect(mocks.chessboardProps.at(-1)?.showSolution).toBe(true);
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
    expect(mocks.recordPuzzleProgress).toHaveBeenCalledOnce();
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
        view: { line: { source: "history" }, position: 1 },
        feedback: "wrong",
        solved: false,
      });
    });

    await waitFor(() =>
      expect(mocks.recordPuzzleProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          username: "solver",
          puzzleId: "1369",
          puzzleCorrect: false,
          attemptDurationMs: expect.any(Number),
          incorrectMove: "1... Kd7",
          correctMove: null,
        }),
      ),
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
      expect(mocks.recordPuzzleProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          username: "solver",
          puzzleId: "1369",
          puzzleCorrect: false,
          attemptDurationMs: null,
          incorrectMove: "1... Kd7",
          correctMove: null,
        }),
      ),
    );
    performanceNow.mockRestore();
  });

  it.each([
    { correctBefore: false, old: false },
    { correctBefore: false, old: true },
    { correctBefore: true, old: false },
    { correctBefore: true, old: true },
  ])(
    "keeps a returning run interactive and saves each result ($correctBefore, $old)",
    async ({ correctBefore, old }) => {
      const runId = "bf6cd63f-c399-4d3c-905c-04ab563e8949";
      const availableAt = old ? "2020-01-01T00:00:00Z" : "2099-01-01T00:00:00Z";
      const state = {
        runId: null,
        graded: old,
        availableAt,
        permanent: false,
        hasAttempted: true,
        hasSolved: correctBefore,
        misses: 0,
        color: correctBefore ? "green" : "red",
      };
      mocks.fetchPuzzleProgressRowsForUsername.mockResolvedValue([
        {
          puzzle_id: "1369",
          first_attempt_at: old ? "2020-01-01T00:00:00Z" : new Date().toISOString(),
          puzzle_correct: correctBefore,
          rated: true,
          has_solved: correctBefore,
          incorrect_move: correctBefore ? null : "12... Kd7",
          correct_move: correctBefore ? "12... O-O" : null,
          grading_available_at: availableAt,
        },
      ]);
      mocks.fetchPuzzleGradingState.mockResolvedValue(state);
      mocks.recordPuzzleProgress
        .mockResolvedValueOnce({
          rated: false,
          ratingEvent: null,
          grading: { ...state, runId, misses: 1 },
        })
        .mockResolvedValueOnce({
          rated: false,
          ratingEvent: null,
          grading: {
            ...state,
            runId: null,
            graded: false,
            hasSolved: true,
            availableAt: "2099-01-01T00:00:00Z",
          },
        });
      render(<PuzzleSolverPage />);
      await waitFor(() => expect(mocks.chessboardProps.at(-1)?.disabled).toBe(false));
      if (correctBefore) {
        expect(
          screen.getByRole("button", { name: "Resign and reveal the solution" }),
        ).toBeEnabled();
      } else {
        expect(
          screen.queryByRole("button", { name: "Resign and reveal the solution" }),
        ).not.toBeInTheDocument();
      }
      const otherAttempts = screen.getByRole("tab", { name: "Other attempts" });
      expect(otherAttempts).toBeDisabled();
      if (old) expect(screen.getByText("Graded", { exact: true })).toBeVisible();
      else expect(screen.getByText(/^Grading returns in/)).toBeVisible();
      act(() =>
        mocks.chessboardProps.at(-1)?.onAttemptResolved?.({
          puzzleId: "1369",
          puzzleCorrect: false,
          incorrectMove: "12... Kd7",
          correctMove: null,
          attemptPgn: "12... Kd7 *",
        }),
      );
      await waitFor(() => expect(mocks.recordPuzzleProgress).toHaveBeenCalledOnce());
      expect(mocks.chessboardProps.at(-1)?.analysisMode).toBe(false);
      expect(otherAttempts).toBeDisabled();
      expect(screen.getByRole("tab", { name: "Explanation" })).toBeDisabled();
      await waitFor(() => expect(mocks.chessboardProps.at(-1)?.disabled).toBe(false));
      act(() =>
        mocks.chessboardProps.at(-1)?.onAttemptResolved?.({
          puzzleId: "1369",
          puzzleCorrect: true,
          incorrectMove: null,
          correctMove: "12... O-O",
          attemptPgn: "12... O-O *",
        }),
      );
      await waitFor(() => expect(mocks.recordPuzzleProgress).toHaveBeenCalledTimes(2));
      expect(mocks.recordPuzzleProgress.mock.calls[1]?.[0].attempt.runId).toBe(runId);
      expect(mocks.chessboardProps.at(-1)?.analysisMode).toBe(true);
      expect(otherAttempts).toBeEnabled();
    },
  );

  it("logs a replayed attempt without replacing the saved solve", async () => {
    render(<PuzzleSolverPage />);

    await screen.findByRole("button", { name: "Resign and reveal the solution" });
    const board = mocks.chessboardProps.at(-1);
    expect(board?.analysisMode).toBe(false);
    expect(board?.showSolution).toBe(false);
    expect(screen.queryByLabelText(/^Elapsed time/)).not.toBeInTheDocument();

    act(() => {
      board?.onAttemptResolved?.({
        puzzleId: 1369,
        puzzleCorrect: false,
        incorrectMove: "12... Kd7",
        attemptPgn: '[Variant "Atomic"]\n\n12... Kd7 *',
        correctMove: null,
      });
      board?.onStateChange?.({
        fen: "rn2k2r/pp5p/1qpp2p1/2Q5/1b2P3/2N5/PPP3PP/R3KB1R b KQkq - 1 12",
        turn: "black",
        status: "Incorrect",
        error: "",
        lineMoves: ["Kd7"],
        solutionLines: [["O-O"]],
        view: { line: { source: "history" }, position: 1 },
        feedback: "wrong",
        solved: false,
      });
    });

    expect(mocks.chessboardProps.at(-1)?.analysisMode).toBe(false);
    expect(mocks.chessboardProps.at(-1)?.showSolution).toBe(false);
    await waitFor(() =>
      expect(mocks.recordPuzzleProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          puzzleId: "1369",
          attempt: {
            id: expect.any(String),
            pgn: '[Variant "Atomic"]\n\n12... Kd7 *',
            runId: "bf6cd63f-c399-4d3c-905c-04ab563e8949",
            resigned: false,
          },
        }),
      ),
    );
  });

  it.each(["fresh", "replay"])("plays the opening move on a %s visit", async (visit) => {
    if (visit === "fresh") mocks.attemptedPuzzleIds = new Set();
    const loadDetails = mocks.loadPuzzlesById.getMockImplementation()!;
    mocks.loadPuzzlesById.mockImplementation(async (puzzleIds: number[]) =>
      (await loadDetails(puzzleIds)).map((puzzle: object) => ({
        ...puzzle,
        intro: {
          beforeFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          san: "e4",
          uci: "e2e4",
        },
      })),
    );
    let now = 1_000_000;
    const dateNow = vi.spyOn(Date, "now").mockImplementation(() => now);
    const performanceNow = vi.spyOn(window.performance, "now").mockImplementation(() => now);
    try {
      render(<PuzzleSolverPage />);
      await screen.findByTestId("mock-board");
      expect(mocks.chessboardProps.at(-1)?.autoplayIntro).toBe(true);
      const analysis = within(screen.getByRole("region", { name: "Puzzle analysis" }));
      expect(analysis.queryByText("Opponent’s previous move:")).not.toBeInTheDocument();
      now += 1_250;
      act(() => mocks.chessboardProps.at(-1)?.onIntroEnd?.(1_250, true));
      const previousMove = analysis.getByText("Opponent’s previous move:").parentElement;
      expect(previousMove).toHaveTextContent("1. e4");
      const previousMoveButton = analysis.getByRole("button", { name: "1. e4" });
      expect(previousMoveButton).toHaveAttribute("aria-current", "step");
      fireEvent.click(previousMoveButton);
      expect(mocks.chessboardProps.at(-1)?.solutionNavigation).toEqual({
        type: "history",
        ply: 0,
      });
      now += 2_000;
      act(() =>
        mocks.chessboardProps.at(-1)?.onAttemptResolved?.({
          puzzleId: 1369,
          puzzleCorrect: false,
          incorrectMove: "12... Kd7",
          correctMove: null,
        }),
      );
      if (visit === "fresh") {
        await waitFor(() =>
          expect(mocks.recordPuzzleProgress).toHaveBeenCalledWith(
            expect.objectContaining({ attemptDurationMs: 2_000 }),
          ),
        );
      } else {
        expect(mocks.recordPuzzleProgress).not.toHaveBeenCalled();
      }
    } finally {
      dateNow.mockRestore();
      performanceNow.mockRestore();
    }
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
        view: { line: { source: "history" }, position: 0 },
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
        view: { line: { source: "history" }, position: 0 },
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
