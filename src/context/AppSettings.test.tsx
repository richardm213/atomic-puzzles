import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AppSettingsProvider, useAppSettings } from "./AppSettings";

const RankingsOpeningSetting = () => {
  const { hideRankingsOpenings, setHideRankingsOpenings } = useAppSettings();
  return (
    <button type="button" onClick={() => setHideRankingsOpenings((hidden) => !hidden)}>
      {hideRankingsOpenings ? "hidden" : "shown"}
    </button>
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
});
