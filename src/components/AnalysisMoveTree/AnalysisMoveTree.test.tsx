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

  it("opens the annotation menu from a move context menu", () => {
    const onAnnotate = vi.fn();
    render(
      <AnalysisMoveTree
        lines={lines}
        moves={["Nf3"]}
        currentPly={1}
        onSelect={vi.fn()}
        onCycleOptions={vi.fn()}
        onAnnotate={onAnnotate}
      />,
    );

    fireEvent.contextMenu(screen.getAllByRole("button", { name: "1. Nf3" })[0]!);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "? Mistake" }));
    expect(onAnnotate).toHaveBeenCalledWith(0, 0, "?");
  });
});
