import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MoveNotation } from "./MoveNotation";

describe("MoveNotation", () => {
  it("navigates the opponent's previous move to the root without shifting variation indexes", () => {
    const onNavigate = vi.fn();
    const onSelectVariation = vi.fn();
    const props = {
      lines: [["e5", "Nf3"]],
      moves: ["e5", "Nf3"],
      previousMove: { san: "e4", ply: 0 },
      inline: true,
      onNavigate,
      onSelectVariation,
    };
    const { rerender } = render(<MoveNotation {...props} currentPly={2} />);
    const previous = screen.getByRole("button", { name: "1. e4" });
    expect(previous).not.toHaveAttribute("aria-current");
    fireEvent.click(previous);
    expect(onNavigate).toHaveBeenCalledWith(0);
    expect(onSelectVariation).not.toHaveBeenCalled();
    rerender(<MoveNotation {...props} currentPly={0} />);
    expect(screen.getByRole("button", { name: "1. e4" })).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: "e5" }));
    expect(onSelectVariation).toHaveBeenCalledWith(0, 0);
  });

  it("uses inline notation for a single line", () => {
    const onSelectVariation = vi.fn();

    render(
      <MoveNotation
        lines={[["e4", "e5"]]}
        moves={["e4", "e5"]}
        currentPly={0}
        inline
        onNavigate={vi.fn()}
        onSelectVariation={onSelectVariation}
        onCycleOptions={vi.fn()}
      />,
    );

    expect(screen.getByRole("list", { name: "Analysis variations" })).toHaveClass("inline");
    fireEvent.click(screen.getByRole("button", { name: "1. e4" }));
    expect(onSelectVariation).toHaveBeenCalledWith(0, 0);
  });

  it("uses inline notation for played moves without a stored line", () => {
    const onNavigate = vi.fn();

    render(
      <MoveNotation
        lines={[]}
        moves={["e4", "e5"]}
        currentPly={0}
        inline
        onNavigate={onNavigate}
        onSelectVariation={vi.fn()}
        onCycleOptions={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "e5" }));
    expect(onNavigate).toHaveBeenCalledWith(2);
  });
});
