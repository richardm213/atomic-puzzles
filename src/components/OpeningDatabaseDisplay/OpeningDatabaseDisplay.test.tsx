import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OpeningDatabaseDisplay, type OpeningDatabaseGame } from "./OpeningDatabaseDisplay";

const game = (overrides: Partial<OpeningDatabaseGame>): OpeningDatabaseGame => ({
  uci: "e2e4",
  move: "e4",
  gameId: "abcdefgh",
  playedOn: "2026-09-18",
  whiteName: "White",
  blackName: "Black",
  whiteRating: 2000,
  blackRating: 2100,
  result: "1-0",
  resultClass: "white",
  ...overrides,
});

describe("OpeningDatabaseDisplay recent-game links", () => {
  it("opens numeric Chess.com games on Chess.com and keeps Lichess move context", () => {
    render(
      <OpeningDatabaseDisplay
        moves={[]}
        recentGames={[
          game({ gameId: "123456789", whiteName: "ChessCom White" }),
          game({ gameId: "ab12CD34", whiteName: "Lichess White" }),
        ]}
        status="ready"
        error=""
        emptyMessage="No games"
        showPerformance={false}
        orientation="black"
        currentPly={4}
        onPlayMove={vi.fn()}
        onHoverMove={vi.fn()}
      />,
    );

    expect(screen.getByTitle("ChessCom White vs Black")).toHaveAttribute(
      "href",
      "https://www.chess.com/variants/atomic/game/123456789",
    );
    expect(screen.getByTitle("Lichess White vs Black")).toHaveAttribute(
      "href",
      "https://lichess.org/ab12CD34/black#5",
    );
  });
});
