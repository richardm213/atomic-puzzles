import { fireEvent, render, screen } from "@testing-library/react";

import {
  activeLineIndex,
  matchingLineIndexes,
  variationOptions,
  VariationTree,
} from "./VariationTree";

const lines = [
  ["e4", "e5", "Nf3"],
  ["e4", "c5", "Nf3"],
  ["d4", "d5"],
];

describe("VariationTree", () => {
  it("renders root and nested alternatives in stable order", () => {
    render(<VariationTree lines={lines} activeLine={0} currentPly={0} onMoveClick={vi.fn()} />);
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "1. e4",
      "1... c5",
      "2. Nf3",
      "e5",
      "2. Nf3",
      "1. d4",
      "d5",
    ]);
  });

  it("dispatches the selected branch", () => {
    const onMoveClick = vi.fn();
    render(<VariationTree lines={lines} activeLine={1} currentPly={2} onMoveClick={onMoveClick} />);
    const c5 = screen.getByRole("button", { name: /c5/ });
    fireEvent.click(c5);
    expect(onMoveClick).toHaveBeenCalledWith(1, 1);
  });

  it("matches, groups, and selects continuation lines", () => {
    const matches = matchingLineIndexes(lines, ["e4"]);
    expect(matches).toEqual([0, 1]);
    expect(variationOptions(lines, 1, matches).map((option) => option.move)).toEqual(["e5", "c5"]);
    expect(activeLineIndex(matches, 1)).toBe(1);
  });

  it("displays ? annotations without letting them break line matching", () => {
    const annotatedLines = [["e4", "e5?"], ["d4?"]];
    render(
      <VariationTree lines={annotatedLines} activeLine={1} currentPly={1} onMoveClick={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "1. d4?" })).toBeVisible();
    expect(matchingLineIndexes(annotatedLines, ["d4"])).toEqual([1]);
  });
});
