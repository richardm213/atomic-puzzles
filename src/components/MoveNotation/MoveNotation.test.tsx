import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MoveNotation } from "./MoveNotation";

describe("MoveNotation", () => {
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
