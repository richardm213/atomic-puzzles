import { fireEvent, render, screen, within } from "@testing-library/react";

import { AnalysisContinuationChoices, AnalysisMoveTree } from "./AnalysisMoveTree";

const lines = [
  ["Nf3", "f6", "Bf4", "Bb4+", "c3"],
  ["Nf3", "h6", "d4", "e6", "Bg5", "Be7", "e3"],
  ["g3", "f6"],
];

describe("AnalysisMoveTree", () => {
  it("keeps longer alternatives next to their fork and navigates to their moves", () => {
    const onSelect = vi.fn();
    render(
      <>
        <AnalysisMoveTree
          lines={lines}
          moves={["Nf3"]}
          currentPly={1}
          pinnedLineIndex={0}
          onSelect={onSelect}
        />
        <AnalysisContinuationChoices
          lines={lines}
          moves={["Nf3"]}
          currentPly={1}
          pinnedLineIndex={0}
          onSelect={onSelect}
        />
      </>,
    );

    const tree = within(screen.getByRole("list", { name: "Analysis variations" }));
    const mainMove = tree.getByRole("button", { name: "1... f6" });
    const alternative = tree.getByRole("button", { name: "4. e3" });
    const resumedMainline = tree.getByRole("button", { name: "2. Bf4" });
    expect(mainMove.compareDocumentPosition(alternative)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(alternative.compareDocumentPosition(resumedMainline)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    fireEvent.click(alternative);
    expect(onSelect).toHaveBeenCalledWith(1, 6);

    const choices = screen.getByLabelText("Choose continuation");
    fireEvent.click(within(choices).getByRole("button", { name: "1... h6" }));
    expect(onSelect).toHaveBeenCalledWith(1, 1);

    expect(within(choices).getAllByRole("button")).toHaveLength(2);
  });

  it("can render variations in non-inline mode", () => {
    const { container } = render(
      <AnalysisMoveTree
        lines={lines}
        moves={["Nf3"]}
        currentPly={1}
        inline={false}
        onSelect={vi.fn()}
        onCycleOptions={vi.fn()}
      />,
    );

    expect(container.querySelector(".analysisTree")).toHaveClass("nonInline");
  });

  it("navigates on click and opens the annotation menu only from the context menu", () => {
    const onAnnotate = vi.fn();
    const onSelect = vi.fn();
    render(
      <AnalysisMoveTree
        lines={lines}
        moves={["Nf3"]}
        currentPly={1}
        onSelect={onSelect}
        onCycleOptions={vi.fn()}
        onAnnotate={onAnnotate}
      />,
    );

    const move = screen.getAllByRole("button", { name: "1. Nf3" })[0]!;
    fireEvent.click(move);
    expect(onSelect).toHaveBeenCalledWith(0, 0);
    expect(screen.queryByRole("menu", { name: "Move annotation" })).not.toBeInTheDocument();

    fireEvent.contextMenu(move);
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Annotate with ?" }));
    expect(onAnnotate).toHaveBeenCalledWith(0, 0, "?");
  });

  it("offers deletion when the caller supports it", () => {
    const onDelete = vi.fn();
    render(
      <AnalysisMoveTree
        lines={lines}
        moves={["Nf3"]}
        currentPly={1}
        onSelect={vi.fn()}
        onCycleOptions={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.contextMenu(screen.getAllByRole("button", { name: "1. Nf3" })[0]!);
    expect(screen.queryByRole("menuitemcheckbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(0, 0);
  });

  it("shows computer annotations only on the game mainline", () => {
    render(
      <AnalysisMoveTree
        lines={lines}
        moves={["Nf3", "h6"]}
        currentPly={2}
        pinnedLineIndex={1}
        onSelect={vi.fn()}
        onCycleOptions={vi.fn()}
        assessments={[
          {
            ply: 1,
            uci: "g1f3",
            classification: "best",
            symbol: "✓",
            winPercentBefore: 50,
            winPercentAfter: 50,
            winPercentLoss: 0,
            bestMove: "g1f3",
          },
          {
            ply: 2,
            uci: "f7f6",
            classification: "mistake",
            symbol: "?",
            winPercentBefore: 50,
            winPercentAfter: 40,
            winPercentLoss: 10,
            bestMove: "e7e5",
          },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "1... f6 mistake" })).toHaveClass("mistake");
    expect(screen.getByRole("button", { name: "1... h6" })).not.toHaveTextContent("?");
  });
});
