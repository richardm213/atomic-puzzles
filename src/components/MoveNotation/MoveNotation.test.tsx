import { fireEvent, render, screen } from "@testing-library/react";
import { INITIAL_FEN } from "chessops/fen";
import { describe, expect, it, vi } from "vitest";

import { MoveNotation } from "./MoveNotation";

describe("MoveNotation", () => {
  it("reserves a noninteractive row before puzzle or move data is available", () => {
    const { container } = render(
      <MoveNotation
        initialFen={INITIAL_FEN}
        reserveFirstRow
        lines={[]}
        moves={[]}
        currentPly={0}
        inline
        onNavigate={vi.fn()}
        onSelectVariation={vi.fn()}
      />,
    );
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("navigates the opponent's previous move to the root without shifting variation indexes", () => {
    const onNavigate = vi.fn();
    const onSelectVariation = vi.fn();
    const props = {
      initialFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
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
    rerender(<MoveNotation {...props} currentPly={0} beforePreviousMove />);
    expect(screen.getByRole("button", { name: "1. e4" })).not.toHaveAttribute("aria-current");
    rerender(<MoveNotation {...props} currentPly={0} />);
    expect(screen.getByRole("button", { name: "1. e4" })).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: "e5" }));
    expect(onSelectVariation).toHaveBeenCalledWith(0, 0);
  });

  it("uses inline notation for a single line", () => {
    const onSelectVariation = vi.fn();

    render(
      <MoveNotation
        initialFen={INITIAL_FEN}
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
        initialFen={INITIAL_FEN}
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

  it("jumps to the original move order without hiding a distinct continuation", () => {
    const lines = [
      ["Nf3", "Nf6", "Nc3", "Nc6", "d4"],
      ["Nc3", "Nc6", "Nf3", "Nf6", "e4"],
    ];
    const onSelectVariation = vi.fn();
    render(
      <MoveNotation
        initialFen={INITIAL_FEN}
        lines={lines}
        moves={lines[1]!}
        currentPly={5}
        inline={false}
        onNavigate={vi.fn()}
        onSelectVariation={onSelectVariation}
      />,
    );

    expect(screen.getByRole("button", { name: "3. e4", current: "step" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Go to original continuation" }));
    expect(onSelectVariation).toHaveBeenCalledWith(0, 3);
  });
});
