import { fireEvent, render, screen } from "@testing-library/react";

import { PlayedMoves } from "./PlayedMoves";

describe("PlayedMoves", () => {
  it("navigates on click and opens move editing only from the context menu", () => {
    const onNavigate = vi.fn();
    const onAnnotate = vi.fn();
    render(
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
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(1);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Annotate with ?" }));
    expect(onAnnotate).toHaveBeenCalledWith(0, "?");
  });
});
