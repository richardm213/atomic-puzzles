import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PuzzleSubmissionValue } from "../../lib/puzzles/puzzleSubmission";
import {
  convertUciLineToSan,
  parseSolutionUciLines,
  serializeSanLinesToPgn,
} from "../../lib/puzzles/solutionPgn";
import type { ChessboardState, SolutionNavigation } from "../../types/chessboard";
import { PuzzleEditor } from "./PuzzleEditor";
import { PuzzleSubmissionPage } from "./PuzzleSubmission";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const chessboardMocks = vi.hoisted(() => ({
  navigations: [] as SolutionNavigation[],
}));

type MockChessboardProps = {
  solution?: string;
  restrictMovesToSolution?: boolean;
  solutionNavigation?: SolutionNavigation | null;
  onNavigateHandled?: () => void;
  onStateChange?: (state: ChessboardState) => void;
};

const c5NavigationState: ChessboardState = {
  fen: STARTING_FEN,
  turn: "white",
  status: "",
  error: "",
  lineMoves: ["e4", "c5", "Nf3"],
  solutionLines: [],
  lineIndex: 2,
  solutionLineIndex: 1,
  viewingSolution: true,
  showWrongMove: false,
  showRetryMove: false,
  solved: false,
};

vi.mock("../../components/Chessboard/Chessboard", async () => {
  const React = await import("react");

  return {
    Chessboard: (props: MockChessboardProps) => {
      const { onNavigateHandled, onStateChange, solutionNavigation } = props;

      React.useEffect(() => {
        if (solutionNavigation) {
          chessboardMocks.navigations.push(solutionNavigation);
          onNavigateHandled?.();
        }
      }, [onNavigateHandled, solutionNavigation]);

      return (
        <>
          <output data-testid="board-solution">{props.solution}</output>
          <output data-testid="board-restrictions">{String(props.restrictMovesToSolution)}</output>
          <button
            type="button"
            onClick={() =>
              onStateChange?.({
                fen: STARTING_FEN,
                turn: "white",
                status: "",
                error: "",
                lineMoves: ["e4", "c5", "Nf3", "d6"],
                solutionLines: [],
                customLines: [["e4", "c5", "Nf3", "d6"]],
                lineIndex: 4,
                solutionLineIndex: 1,
                customLineIndex: 0,
                viewingSolution: false,
                showWrongMove: false,
                showRetryMove: false,
                solved: false,
              })
            }
          >
            Add move to line
          </button>
          <button type="button" onClick={() => onStateChange?.(c5NavigationState)}>
            Navigate c5 line
          </button>
          <button
            type="button"
            onClick={() =>
              onStateChange?.({
                ...c5NavigationState,
                lineMoves: ["e4", "c6"],
                customLines: [["e4", "c6"]],
                lineIndex: 2,
                customLineIndex: 0,
                viewingSolution: false,
              })
            }
          >
            Replace line from middle
          </button>
          <button
            type="button"
            onClick={() =>
              onStateChange?.({
                ...c5NavigationState,
                lineMoves: ["e4", "c5"],
                customLines: [["e4", "c5"]],
                lineIndex: 2,
                customLineIndex: 0,
                viewingSolution: false,
              })
            }
          >
            Follow line from middle
          </button>
          <button
            type="button"
            onClick={() =>
              onStateChange?.({
                ...c5NavigationState,
                lineMoves: ["e4", "c5", "Nc3"],
                customLines: [["e4", "c5", "Nc3"]],
                lineIndex: 3,
                customLineIndex: 0,
                viewingSolution: false,
              })
            }
          >
            Deviate after following line
          </button>
          <button
            type="button"
            onClick={() =>
              onStateChange?.({
                ...c5NavigationState,
                lineMoves: ["e4", "e5", "Nf3"],
                lineIndex: 1,
                solutionLineIndex: 0,
              })
            }
          >
            Navigate to branch point
          </button>
        </>
      );
    },
  };
});

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    user: { username: "submitter" },
    login: vi.fn(),
  }),
}));

const startingLines = [
  ["e4", "e5", "Nf3"],
  ["e4", "c5", "Nf3"],
];

const solutionLinesFromTextarea = (textarea: HTMLTextAreaElement): string[][] =>
  parseSolutionUciLines(
    STARTING_FEN,
    textarea.value
      .split("\n")
      .filter((line) => !line.trim().startsWith("["))
      .join("\n")
      .trim(),
  ).map((line) => convertUciLineToSan(STARTING_FEN, line));

const lineSet = (lines: string[][]): string[] => lines.map((line) => line.join(" ")).sort();

const EditorHarness = ({
  initialSolution,
  showCopyPgn = false,
  allowSolutionEditing = false,
}: {
  initialSolution?: string;
  showCopyPgn?: boolean;
  allowSolutionEditing?: boolean;
}) => {
  const [value, setValue] = useState<PuzzleSubmissionValue>({
    fen: STARTING_FEN,
    solution: initialSolution ?? serializeSanLinesToPgn(STARTING_FEN, startingLines),
    event: "",
    explanation: "",
  });

  return (
    <>
      <PuzzleEditor
        value={value}
        onChange={setValue}
        resetKey="test-puzzle"
        showCopyPgn={showCopyPgn}
        allowSolutionEditing={allowSolutionEditing}
      />
      <output data-testid="stored-solution">{value.solution}</output>
    </>
  );
};

describe("PuzzleSubmissionPage fields", () => {
  it("shows the explanation for a single puzzle but not a puzzle batch", async () => {
    const user = userEvent.setup();
    render(<PuzzleSubmissionPage />);

    expect(screen.getByRole("textbox", { name: "Explanation" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Puzzle batch" }));
    expect(screen.queryByRole("textbox", { name: "Explanation" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Single puzzle" }));
    expect(screen.getByRole("textbox", { name: "Explanation" })).toBeVisible();
  });
});

describe("PuzzleEditor move tree", () => {
  beforeEach(() => {
    chessboardMocks.navigations.length = 0;
  });

  it("requires a solution and explains how events create puzzle sets", () => {
    render(<EditorHarness />);

    expect(screen.getByRole("textbox", { name: "Solution PGN" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Event" })).toHaveAttribute(
      "placeholder",
      "Optional event name",
    );
    expect(screen.getByText("Same event creates a puzzle set")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Explanation" })).not.toBeRequired();
    expect(screen.queryByRole("button", { name: "Load moves on board" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy PGN" })).toBeNull();
  });

  it("supports a submission-only batch navigator without an explanation field", () => {
    const previous = vi.fn();
    const next = vi.fn();
    render(
      <PuzzleEditor
        value={{
          fen: STARTING_FEN,
          solution: serializeSanLinesToPgn(STARTING_FEN, startingLines),
          event: "",
          explanation: "",
        }}
        onChange={vi.fn()}
        resetKey="batch-test"
        batchMode
        showExplanation={false}
        batchPosition={{ current: 1, total: 3 }}
        onPreviousPuzzle={previous}
        onNextPuzzle={next}
      />,
    );

    expect(screen.queryByRole("textbox", { name: "Explanation" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Solutions PGNs" })).toBeRequired();
    expect(screen.getByText("Puzzle 2 of 3")).toBeVisible();
    expect(screen.getByText("Same event creates a puzzle set")).toBeVisible();
  });

  it("shows submission errors inside the editor above its actions", () => {
    render(
      <PuzzleEditor
        value={{
          fen: STARTING_FEN,
          solution: serializeSanLinesToPgn(STARTING_FEN, startingLines),
          event: "",
          explanation: "",
        }}
        onChange={vi.fn()}
        resetKey="error-test"
        feedback={{ tone: "error", text: "Puzzle ID already exists" }}
        actions={<button type="button">Submit for review</button>}
      />,
    );

    const error = screen.getByText("Puzzle ID already exists");
    const submit = screen.getByRole("button", { name: "Submit for review" });
    expect(error.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows submission success inside the same feedback position", () => {
    render(
      <PuzzleEditor
        value={{
          fen: STARTING_FEN,
          solution: serializeSanLinesToPgn(STARTING_FEN, startingLines),
          event: "",
          explanation: "",
        }}
        onChange={vi.fn()}
        resetKey="success-test"
        feedback={{ tone: "success", text: "Puzzle submitted for review. Thank you!" }}
        actions={<button type="button">Submit for review</button>}
      />,
    );

    const success = screen.getByText("Puzzle submitted for review. Thank you!");
    const submit = screen.getByRole("button", { name: "Submit for review" });
    expect(success.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("copies the complete displayed PGN when enabled for review", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<EditorHarness showCopyPgn />);

    const solution = screen.getByRole("textbox", { name: "Solution PGN" });
    await user.click(screen.getByRole("button", { name: "Copy PGN" }));

    expect(writeText).toHaveBeenCalledWith((solution as HTMLTextAreaElement).value);
    expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();
  });

  it("accepts the initial PGN paste and keeps single-puzzle editing enabled", async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialSolution="" allowSolutionEditing />);

    const solution = screen.getByRole("textbox", { name: "Solution PGN" });
    const explanation = screen.getByRole("textbox", { name: "Explanation" });
    const storedSolution = screen.getByTestId("stored-solution");

    await user.clear(solution);
    await user.type(solution, "1. d4 d5");
    await waitFor(() => expect(storedSolution.textContent).toBe("1. d4 d5"));

    await user.click(explanation);
    expect(solution).not.toHaveAttribute("readonly");
    expect((solution as HTMLTextAreaElement).value).toContain('[Variant "Atomic"]');
    expect((solution as HTMLTextAreaElement).value).toContain(`[FEN "${STARTING_FEN}"]`);
    expect(chessboardMocks.navigations.at(-1)).toEqual({
      type: "solution",
      line: 0,
      ply: 0,
    });
  });

  it("opens every newly loaded puzzle at the start of its first line", () => {
    render(
      <PuzzleEditor
        value={{
          fen: STARTING_FEN,
          solution: serializeSanLinesToPgn(STARTING_FEN, startingLines),
          event: "",
          explanation: "",
        }}
        onChange={vi.fn()}
        resetKey="review-selection"
        allowSolutionEditing
      />,
    );

    expect(chessboardMocks.navigations.at(-1)).toEqual({
      type: "solution",
      line: 0,
      ply: 0,
    });
  });

  it("locks loaded batch puzzles against text and board editing", () => {
    render(
      <PuzzleEditor
        value={{
          fen: STARTING_FEN,
          solution: serializeSanLinesToPgn(STARTING_FEN, startingLines),
          event: "Batch event",
          explanation: "",
        }}
        onChange={vi.fn()}
        resetKey="loaded-batch"
        batchMode
        batchPosition={{ current: 0, total: 2 }}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Solutions PGNs" })).toHaveAttribute("readonly");
    expect(screen.getByTestId("board-restrictions")).toHaveTextContent("true");
    expect(screen.queryByRole("button", { name: "Delete current line" })).toBeNull();
  });

  it("makes every puzzle field and board move read-only for public review", () => {
    render(
      <PuzzleEditor
        value={{
          fen: STARTING_FEN,
          solution: serializeSanLinesToPgn(STARTING_FEN, startingLines),
          event: "Public event",
          explanation: "Public explanation",
        }}
        onChange={vi.fn()}
        resetKey="public-review"
        allowSolutionEditing
        readOnly
      />,
    );

    expect(screen.getByRole("textbox", { name: "Solution PGN" })).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "Event" })).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "Explanation" })).toHaveAttribute("readonly");
    expect(screen.getByTestId("board-restrictions")).toHaveTextContent("true");
    expect(screen.queryByRole("button", { name: "Delete current line" })).toBeNull();
  });

  it("lets single-puzzle editors replace the movetext and any number of lines", async () => {
    const user = userEvent.setup();
    render(<EditorHarness allowSolutionEditing />);

    const solution = screen.getByRole("textbox", {
      name: "Solution PGN",
    }) as HTMLTextAreaElement;
    expect(solution).not.toHaveAttribute("readonly");

    expect(screen.getByTestId("board-restrictions")).toHaveTextContent("false");
    await user.clear(solution);
    await user.type(solution, "1. d4 d5 2. c4 (2. Nf3 Nf6)");

    await waitFor(() => expect(screen.getByTestId("stored-solution")).toHaveTextContent("d4 d5"));
    expect(screen.getByTestId("board-solution")).toHaveTextContent("d4 d5");
    const moves = screen.getByRole("list", { name: "Solution variations" });
    expect(moves).toHaveTextContent("d4");
    expect(moves).toHaveTextContent("c4");
    expect(moves).toHaveTextContent("Nf6");
    expect(moves).not.toHaveTextContent("e4");
    expect(moves).not.toHaveTextContent("c5");
    expect(lineSet(solutionLinesFromTextarea(solution))).toEqual(
      lineSet([
        ["d4", "d5", "c4"],
        ["d4", "d5", "Nf3", "Nf6"],
      ]),
    );
  });

  it("accepts a typed move appended to one line and preserves every variation", async () => {
    const user = userEvent.setup();
    render(<EditorHarness allowSolutionEditing />);

    const textarea = screen.getByRole("textbox", { name: "Solution PGN" }) as HTMLTextAreaElement;
    await user.type(textarea, " 2... Nc6");

    await waitFor(() =>
      expect(lineSet(solutionLinesFromTextarea(textarea))).toEqual(
        lineSet([
          ["e4", "e5", "Nf3", "Nc6"],
          ["e4", "c5", "Nf3"],
        ]),
      ),
    );
    expect(screen.getByTestId("stored-solution")).toHaveTextContent("Nc6");
    expect(textarea.value.split("\n").length).toBeGreaterThan(3);
  });

  it("rejects direct edits that change the original FEN", () => {
    render(<EditorHarness allowSolutionEditing />);

    const textarea = screen.getByRole("textbox", { name: "Solution PGN" }) as HTMLTextAreaElement;
    const changedFen = STARTING_FEN.replace(" w ", " b ");
    fireEvent.change(textarea, {
      target: { value: `[Variant "Atomic"]\n[FEN "${changedFen}"]\n\n1... e5` },
    });

    expect(
      screen.getByText(
        "The puzzle FEN and initial position cannot be changed after the solution is loaded.",
      ),
    ).toBeVisible();
    expect(screen.getByTestId("stored-solution")).not.toHaveTextContent("1... e5");
    expect(screen.getByTestId("board-solution")).toHaveTextContent("e4");
  });

  it("adds a board move to the selected line and keeps the PGN multiline", async () => {
    const user = userEvent.setup();
    render(<EditorHarness allowSolutionEditing />);

    await user.click(screen.getByRole("button", { name: "1... c5" }));
    await user.click(screen.getByRole("button", { name: "Add move to line" }));

    const textarea = screen.getByRole("textbox", { name: "Solution PGN" }) as HTMLTextAreaElement;
    await waitFor(() =>
      expect(lineSet(solutionLinesFromTextarea(textarea))).toEqual(
        lineSet([
          ["e4", "e5", "Nf3"],
          ["e4", "c5", "Nf3", "d6"],
        ]),
      ),
    );
    expect(textarea.value.split("\n").length).toBeGreaterThan(4);
  });

  it("creates the first solution line by playing on an empty single-puzzle board", async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialSolution="" allowSolutionEditing />);

    await user.click(screen.getByRole("button", { name: "Add move to line" }));

    const textarea = screen.getByRole("textbox", { name: "Solution PGN" }) as HTMLTextAreaElement;
    await waitFor(() =>
      expect(lineSet(solutionLinesFromTextarea(textarea))).toEqual(
        lineSet([["e4", "c5", "Nf3", "d6"]]),
      ),
    );
    expect(screen.getByRole("button", { name: "Delete current line" })).toBeVisible();
  });

  it("adds a board deviation as a new line without replacing existing lines", async () => {
    const user = userEvent.setup();
    render(<EditorHarness allowSolutionEditing />);

    await user.click(screen.getByRole("button", { name: "1... c5" }));
    await user.click(screen.getByRole("button", { name: "Replace line from middle" }));

    const textarea = screen.getByRole("textbox", { name: "Solution PGN" }) as HTMLTextAreaElement;
    await waitFor(() =>
      expect(lineSet(solutionLinesFromTextarea(textarea))).toEqual(
        lineSet([
          ["e4", "e5", "Nf3"],
          ["e4", "c5", "Nf3"],
          ["e4", "c6"],
        ]),
      ),
    );
  });

  it("keeps board editing active when starting from the middle of a line", async () => {
    const user = userEvent.setup();
    render(<EditorHarness allowSolutionEditing />);

    await user.click(screen.getByRole("button", { name: "1... c5" }));
    await user.click(screen.getByRole("button", { name: "Follow line from middle" }));

    const textarea = screen.getByRole("textbox", { name: "Solution PGN" }) as HTMLTextAreaElement;
    expect(lineSet(solutionLinesFromTextarea(textarea))).toEqual(lineSet(startingLines));

    await user.click(screen.getByRole("button", { name: "Deviate after following line" }));
    await waitFor(() =>
      expect(lineSet(solutionLinesFromTextarea(textarea))).toEqual(
        lineSet([...startingLines, ["e4", "c5", "Nc3"]]),
      ),
    );
  });

  it("deletes the active solution line with the trash button", async () => {
    const user = userEvent.setup();
    render(<EditorHarness allowSolutionEditing />);

    await user.click(screen.getByRole("button", { name: "1... c5" }));
    await user.click(screen.getByRole("button", { name: "Delete current line" }));

    const textarea = screen.getByRole("textbox", { name: "Solution PGN" }) as HTMLTextAreaElement;
    await waitFor(() =>
      expect(lineSet(solutionLinesFromTextarea(textarea))).toEqual(lineSet([["e4", "e5", "Nf3"]])),
    );
    expect(screen.getByText("1 solution")).toBeVisible();
  });

  it("shows puzzle-style continuation options at a branch point", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    expect(screen.queryByText("2 options from here")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Navigate to branch point" }));

    expect(screen.getByText("2 options from here")).toBeVisible();
    const options = screen.getByRole("list", { name: "Solution options" });
    expect(within(options).getByRole("button", { name: "1... e5" })).toBeVisible();
    expect(within(options).getByRole("button", { name: "1... c5" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Go to start of line" })).toHaveAttribute(
      "title",
      "Start (Arrow Up)",
    );
    expect(screen.getByRole("button", { name: "Go to end of line" })).toHaveAttribute(
      "title",
      "End (Arrow Down)",
    );
  });

  it("keeps every alternate line while navigating and rejects board edits", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    const solutionPgn = screen.getByRole("textbox", { name: "Solution PGN" });
    expect(solutionPgn).toBeInstanceOf(HTMLTextAreaElement);
    const textarea = solutionPgn as HTMLTextAreaElement;
    expect(lineSet(solutionLinesFromTextarea(textarea))).toEqual(lineSet(startingLines));

    await user.click(screen.getByRole("button", { name: "1... c5" }));
    expect(lineSet(solutionLinesFromTextarea(textarea))).toEqual(lineSet(startingLines));

    await user.click(screen.getByRole("button", { name: "Add move to line" }));
    expect(lineSet(solutionLinesFromTextarea(textarea))).toEqual(lineSet(startingLines));
    expect(screen.getByTestId("stored-solution").textContent).not.toContain("c6");
  });

  it("keeps the loaded PGN and all headers read-only", async () => {
    const user = userEvent.setup();
    const initialPgn = [
      '[Event "Community study"]',
      '[Variant "Atomic"]',
      `[FEN "${STARTING_FEN}"]`,
      '[Annotator "seaside_tiramisu"]',
      "",
      serializeSanLinesToPgn(STARTING_FEN, startingLines),
    ].join("\n");
    render(<EditorHarness initialSolution={initialPgn} />);

    const textarea = screen.getByRole("textbox", {
      name: "Solution PGN",
    }) as HTMLTextAreaElement;
    expect(textarea).toHaveAttribute("readonly");
    await user.click(screen.getByRole("button", { name: "Add move to line" }));

    expect(lineSet(solutionLinesFromTextarea(textarea))).toEqual(lineSet(startingLines));
    expect(textarea.value).toContain('[Event "Community study"]');
    expect(textarea.value).toContain('[Variant "Atomic"]');
    expect(textarea.value).toContain(`[FEN "${STARTING_FEN}"]`);
    expect(textarea.value).toContain('[Annotator "seaside_tiramisu"]');
  });

  it("adds Variant and FEN headers when loading normalized queue movetext", () => {
    render(<EditorHarness />);

    const textarea = screen.getByRole("textbox", {
      name: "Solution PGN",
    }) as HTMLTextAreaElement;
    expect(textarea.value).toContain('[Variant "Atomic"]');
    expect(textarea.value).toContain(`[FEN "${STARTING_FEN}"]`);
  });

  it("never rewrites the PGN text while navigating existing solution lines", async () => {
    const user = userEvent.setup();
    const formattedPgn = "1.  e4   e5 (1... c5 2. Nf3) 2. Nf3";
    render(<EditorHarness initialSolution={formattedPgn} />);

    const textarea = screen.getByRole("textbox", {
      name: "Solution PGN",
    }) as HTMLTextAreaElement;
    const displayedPgn = textarea.value;
    await user.click(screen.getByRole("button", { name: "Navigate c5 line" }));

    expect(textarea.value).toBe(displayedPgn);
    expect(textarea.value).toContain(formattedPgn);
    expect(textarea.value).toContain('[Variant "Atomic"]');
    expect(textarea.value).toContain(`[FEN "${STARTING_FEN}"]`);
  });
});
