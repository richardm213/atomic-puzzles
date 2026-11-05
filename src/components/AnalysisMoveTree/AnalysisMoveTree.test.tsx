import { fireEvent, render, screen, within } from "@testing-library/react";

import { AnalysisMoveTree } from "./AnalysisMoveTree";

const lines = [
  ["Nf3", "f6", "Bf4", "Bb4+", "c3"],
  ["Nf3", "h6", "d4", "e6", "Bg5"],
  ["g3", "f6"],
];

describe("AnalysisMoveTree", () => {
  it("renders compact inline variations and dispatches branch navigation", () => {
    const onSelect = vi.fn();
    const onCycleOptions = vi.fn();
    const { container } = render(
      <AnalysisMoveTree
        lines={lines}
        moves={["Nf3"]}
        currentPly={1}
        pinnedLineIndex={0}
        onSelect={onSelect}
        onCycleOptions={onCycleOptions}
      />,
    );

    expect(container.querySelectorAll(".analysisTreeVariation")).not.toHaveLength(0);
    const choices = screen.getByLabelText("Choose continuation");
    fireEvent.click(within(choices).getByRole("button", { name: "1... h6" }));
    expect(onSelect).toHaveBeenCalledWith(1, 1);

    fireEvent.click(screen.getByRole("button", { name: "Next continuation" }));
    expect(onCycleOptions).toHaveBeenCalledWith("nextOption");
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
    fireEvent.click(screen.getByRole("menuitemradio", { name: "? Mistake" }));
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
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete from here" }));
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

    expect(screen.getByRole("button", { name: "f6mistake" })).toHaveClass("mistake");
    expect(screen.getByRole("button", { name: "1... h6" })).not.toHaveTextContent("?");
  });
});
