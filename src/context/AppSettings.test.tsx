import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AppSettingsProvider, useAppSettings } from "./AppSettings";

const RankingsOpeningSetting = () => {
  const {
    hideRankingsOpenings,
    setHideRankingsOpenings,
    showChessComRankings,
    setShowChessComRankings,
  } = useAppSettings();
  return (
    <>
      <button type="button" onClick={() => setHideRankingsOpenings((hidden) => !hidden)}>
        {hideRankingsOpenings ? "hidden" : "shown"}
      </button>
      <button type="button" onClick={() => setShowChessComRankings((shown) => !shown)}>
        {showChessComRankings ? "Chess.com only" : "All users"}
      </button>
    </>
  );
};

describe("rankings opening preference", () => {
  it("loads and persists the hide-openings setting", async () => {
    window.localStorage.setItem("atomic-puzzles.rankings.hide-openings", "true");
    render(
      <AppSettingsProvider>
        <RankingsOpeningSetting />
      </AppSettingsProvider>,
    );

    const toggle = screen.getByRole("button", { name: "hidden" });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveTextContent("shown");
      expect(window.localStorage.getItem("atomic-puzzles.rankings.hide-openings")).toBe("false");
    });
  });

  it("loads and persists the Chess.com-only rankings setting", async () => {
    window.localStorage.setItem("atomic-puzzles.rankings.show-chesscom-users", "true");
    render(
      <AppSettingsProvider>
        <RankingsOpeningSetting />
      </AppSettingsProvider>,
    );

    const toggle = screen.getByRole("button", { name: "Chess.com only" });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveTextContent("All users");
      expect(window.localStorage.getItem("atomic-puzzles.rankings.show-chesscom-users")).toBe(
        "false",
      );
    });
  });
});
