import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppSettingsProvider } from "../../context/AppSettings";
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
  it("plays a move when any part of its row is clicked", () => {
    const onPlayMove = vi.fn();
    render(
      <OpeningDatabaseDisplay
        moves={[
          {
            uci: "e2e4",
            move: "e4",
            games: 12,
            whiteWins: 7,
            draws: 1,
            blackWins: 4,
            white: 58,
            draw: 8,
            black: 34,
            avgOpponentRating: 2100,
            performanceRating: null,
          },
        ]}
        recentGames={[]}
        status="ready"
        error=""
        emptyMessage="No games"
        showPerformance={false}
        orientation="white"
        currentPly={0}
        onPlayMove={onPlayMove}
        onHoverMove={vi.fn()}
      />,
    );

    const moveButton = screen.getByRole("button", { name: "Play e4" });
    const row = moveButton.closest("tr");
    expect(row).not.toBeNull();

    fireEvent.click(withinRowCell(row!, 1));
    expect(onPlayMove).toHaveBeenCalledOnce();
    expect(onPlayMove).toHaveBeenLastCalledWith("e2e4");

    fireEvent.click(moveButton);
    expect(onPlayMove).toHaveBeenCalledTimes(2);
  });

  it("opens game links in a new tab while preserving their destination and move context", () => {
    render(
      <AppSettingsProvider>
        <OpeningDatabaseDisplay
          moves={[]}
          recentGames={[
            game({ gameId: "chesscom:108184353", whiteName: "ChessCom White" }),
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
        />
      </AppSettingsProvider>,
    );

    const chessComLink = screen.getByTitle("ChessCom White vs Black");
    const lichessLink = screen.getByTitle("Lichess White vs Black");

    expect(chessComLink).toHaveAttribute("href", "/game/108184353");
    expect(chessComLink).toHaveAttribute("target", "_blank");
    expect(lichessLink).toHaveAttribute(
      "href",
      "https://lichess.org/game/ab12CD34/black#5",
    );
    expect(lichessLink).toHaveAttribute("target", "_blank");
  });

  it("omits loading placeholders and can suppress inline errors", () => {
    const { rerender } = render(
      <OpeningDatabaseDisplay
        moves={[]}
        recentGames={[]}
        status="loading"
        error=""
        emptyMessage="No games"
        showPerformance={false}
        orientation="white"
        currentPly={0}
        onPlayMove={vi.fn()}
        onHoverMove={vi.fn()}
      />,
    );

    expect(screen.queryByText("Loading database moves...")).toBeNull();

    rerender(
      <OpeningDatabaseDisplay
        moves={[]}
        recentGames={[]}
        status="error"
        error="Database unavailable"
        emptyMessage="No games"
        showPerformance={false}
        orientation="white"
        currentPly={0}
        onPlayMove={vi.fn()}
        onHoverMove={vi.fn()}
        showInlineError={false}
      />,
    );

    expect(screen.queryByText("Database unavailable")).toBeNull();
  });
});

const withinRowCell = (row: HTMLTableRowElement, index: number): HTMLTableCellElement => {
  const cell = row.cells.item(index);
  if (!cell) throw new Error(`Missing table cell ${index}`);
  return cell;
};
