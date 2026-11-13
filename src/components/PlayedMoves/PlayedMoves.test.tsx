import { fireEvent, render, screen } from "@testing-library/react";

import { PlayedMoves } from "./PlayedMoves";

describe("PlayedMoves", () => {
  it("navigates on click and opens move editing only from the context menu", () => {
    const onNavigate = vi.fn();
    const onAnnotate = vi.fn();
    const { rerender } = render(
      <PlayedMoves
        moves={["e4", "e5"]}
        currentPly={0}
        onNavigate={onNavigate}
        onAnnotate={onAnnotate}
      />,
    );

    const move = screen.getByRole("button", { name: "e4" });
    fireEvent.click(move);
    expect(onNavigate).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("menu", { name: "Move annotation" })).not.toBeInTheDocument();

    fireEvent.contextMenu(move);
    expect(
      screen.queryByRole("menuitemcheckbox", { name: "Annotate with !" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Annotate with ?", checked: false }),
    );
    expect(onAnnotate).toHaveBeenCalledWith(0, "?");

    rerender(
      <PlayedMoves
        moves={["e4?", "e5"]}
        currentPly={0}
        onNavigate={onNavigate}
        onAnnotate={onAnnotate}
      />,
    );
    fireEvent.contextMenu(screen.getByRole("button", { name: "e4?" }));
    fireEvent.click(
      screen.getByRole("menuitemcheckbox", { name: "Annotate with ?", checked: true }),
    );
    expect(onAnnotate).toHaveBeenLastCalledWith(0, "");
  });
});
