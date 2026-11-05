import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import type { ArchiveGame } from "../../lib/archive/games";
import { GameMatchNavigation } from "./GameAnalysisHeader";

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.useQuery }));
vi.mock("@tanstack/react-router", () => ({
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
  beforeEach(() => mocks.useQuery.mockReset());

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

  it("stays hidden for a single-game match", () => {
    mocks.useQuery.mockReturnValue({ data: { games: [{ id: "game-2" }] } });

    const { container } = render(<GameMatchNavigation game={game} />);

    expect(container).toBeEmptyDOMElement();
  });
});
