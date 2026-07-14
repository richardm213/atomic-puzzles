import { render, screen, waitFor, within } from "@testing-library/react";
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
import { PuzzleEditor } from "./PuzzleSubmission";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const chessboardMocks = vi.hoisted(() => ({
  navigations: [] as SolutionNavigation[],
}));

type MockChessboardProps = {
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
          <button
            type="button"
            onClick={() =>
              onStateChange?.({
                fen: STARTING_FEN,
                turn: "white",
                status: "",
                error: "",
                lineMoves: ["e4", "c6"],
                solutionLines: [],
                lineIndex: 2,
                solutionLineIndex: 0,
                viewingSolution: false,
                showWrongMove: false,
                showRetryMove: false,
                solved: false,
              })
            }
          >
            Add c6 branch
          </button>
          <button type="button" onClick={() => onStateChange?.(c5NavigationState)}>
            Navigate c5 line
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
}: {
  initialSolution?: string;
  showCopyPgn?: boolean;
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
      />
      <output data-testid="stored-solution">{value.solution}</output>
    </>
  );
};

describe("PuzzleEditor move tree", () => {
  beforeEach(() => {
    chessboardMocks.navigations.length = 0;
  });

  it("requires a solution but keeps the explanation optional", () => {
    render(<EditorHarness />);

    expect(screen.getByRole("textbox", { name: "Solution PGN" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Event" })).toHaveAttribute(
      "placeholder",
      "Only for special tournament events or matches; otherwise leave empty",
    );
    expect(screen.getByRole("textbox", { name: "Explanation" })).not.toBeRequired();
    expect(screen.queryByRole("button", { name: "Load moves on board" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy PGN" })).toBeNull();
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
    expect(success).toHaveClass("success");
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

  it("accepts the initial PGN paste, then makes the solution read-only", async () => {
    const user = userEvent.setup();
    render(<EditorHarness initialSolution="" />);

    const solution = screen.getByRole("textbox", { name: "Solution PGN" });
    const explanation = screen.getByRole("textbox", { name: "Explanation" });
    const storedSolution = screen.getByTestId("stored-solution");

    await user.clear(solution);
    await user.type(solution, "1. d4 d5");
    expect(storedSolution.textContent).toBe("");

    await user.click(explanation);
    await waitFor(() => expect(storedSolution.textContent).toBe("1. d4 d5"));
    expect(solution).toHaveAttribute("readonly");
    expect((solution as HTMLTextAreaElement).value).toContain('[Variant "Atomic"]');
    expect((solution as HTMLTextAreaElement).value).toContain(`[FEN "${STARTING_FEN}"]`);
    expect(chessboardMocks.navigations.at(-1)).toEqual({
      type: "solution",
      line: 0,
      ply: 0,
    });
  });

  it("shows puzzle-style continuation options at a branch point", async () => {
    const user = userEvent.setup();
    render(<EditorHarness />);

    expect(screen.queryByText("2 options from here")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Navigate to branch point" }));

    expect(screen.getByText("2 options from here")).toBeVisible();
    const options = screen.getByRole("list", { name: "Solution options" });
    expect(within(options).getByRole("button", { name: "1... e5" })).toHaveClass("active");
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

    await user.click(screen.getByRole("button", { name: "Add c6 branch" }));
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
    await user.click(screen.getByRole("button", { name: "Add c6 branch" }));

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
