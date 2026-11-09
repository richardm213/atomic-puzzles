import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import type { ArchiveGame } from "../../lib/archive/games";
import { GameMatchNavigation } from "./GameAnalysisHeader";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({
    children,
    params,
    className,
    "aria-label": ariaLabel,
    title,
  }: {
    children: ReactNode;
    params: { gameId: string };
    className?: string;
    "aria-label"?: string;
    title?: string;
  }) => (
    <a href={`/game/${params.gameId}`} className={className} aria-label={ariaLabel} title={title}>
      {children}
    </a>
  ),
}));

const game = {
  game_id: "game-2",
  external_match_id: "match-1",
} as ArchiveGame;

describe("GameMatchNavigation", () => {
  beforeEach(() => {
    mocks.useQuery.mockReset();
    mocks.navigate.mockReset();
  });

  it("links to the adjacent games in a multi-game match", () => {
    mocks.useQuery.mockReturnValue({
      data: {
        games: [{ id: "game-1" }, { id: "game-2" }, { id: "game-3" }],
      },
    });

    render(<GameMatchNavigation game={game} />);

    expect(screen.getByText("Game 2/3")).toBeVisible();
    expect(screen.getByRole("link", { name: "Previous game, game 1" })).toHaveAttribute(
      "href",
      "/game/game-1",
    );
    expect(screen.getByRole("link", { name: "Next game, game 3" })).toHaveAttribute(
      "href",
      "/game/game-3",
    );
  });

  it("navigates with Shift+arrows while preserving typing and plain board shortcuts", () => {
    mocks.useQuery.mockReturnValue({
      data: { games: [{ id: "game-1" }, { id: "game-2" }, { id: "game-3" }] },
    });
    render(<GameMatchNavigation game={game} />);
    fireEvent.keyDown(window, { key: "ArrowLeft", shiftKey: true });
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: "/game/$gameId",
      params: { gameId: "game-1" },
    });
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: "/game/$gameId",
      params: { gameId: "game-3" },
    });
    mocks.navigate.mockClear();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true, ctrlKey: true });
    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "ArrowLeft", shiftKey: true });
    input.remove();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Previous game, game 1" })).toHaveAttribute(
      "title",
      expect.stringContaining("Shift + ←"),
    );
    expect(screen.getByRole("link", { name: "Next game, game 3" })).toHaveAttribute(
      "title",
      expect.stringContaining("Shift + →"),
    );
  });

  it("does not navigate beyond the first or last game", () => {
    mocks.useQuery.mockReturnValue({
      data: { games: [{ id: "game-1" }, { id: "game-2" }, { id: "game-3" }] },
    });
    const { rerender } = render(<GameMatchNavigation game={{ ...game, game_id: "game-1" }} />);
    fireEvent.keyDown(window, { key: "ArrowLeft", shiftKey: true });
    expect(mocks.navigate).not.toHaveBeenCalled();
    rerender(<GameMatchNavigation game={{ ...game, game_id: "game-3" }} />);
    fireEvent.keyDown(window, { key: "ArrowRight", shiftKey: true });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("stays hidden for a single-game match", () => {
    mocks.useQuery.mockReturnValue({ data: { games: [{ id: "game-2" }] } });

    const { container } = render(<GameMatchNavigation game={game} />);

    expect(container).toBeEmptyDOMElement();
  });
});
