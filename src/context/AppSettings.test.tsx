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

const PuzzleTimerSetting = () => {
  const { showPuzzleTimer } = useAppSettings();
  return <span>{showPuzzleTimer ? "Timer shown" : "Timer hidden"}</span>;
};

const CoinVisibilitySettings = () => {
  const { showCoinBalance, setShowCoinBalance, showCoinChangePopups, setShowCoinChangePopups } =
    useAppSettings();
  return (
    <>
      <button type="button" onClick={() => setShowCoinBalance((shown) => !shown)}>
        {showCoinBalance ? "Balance shown" : "Balance hidden"}
      </button>
      <button type="button" onClick={() => setShowCoinChangePopups((shown) => !shown)}>
        {showCoinChangePopups ? "Popups shown" : "Popups hidden"}
      </button>
    </>
  );
};

const ProfileRatingSetting = () => {
  const {
    showWolfrandomProfileRatings,
    setShowWolfrandomProfileRatings,
    showProfileActionButtons,
    setShowProfileActionButtons,
  } = useAppSettings();
  return (
    <>
      <button type="button" onClick={() => setShowWolfrandomProfileRatings((shown) => !shown)}>
        {showWolfrandomProfileRatings ? "Wolfrandom shown" : "Wolfrandom hidden"}
      </button>
      <button type="button" onClick={() => setShowProfileActionButtons((shown) => !shown)}>
        {showProfileActionButtons ? "Action buttons" : "Action menu"}
      </button>
    </>
  );
};

describe("puzzle timer preference", () => {
  beforeEach(() => window.localStorage.clear());

  it("hides the timer by default", () => {
    render(
      <AppSettingsProvider>
        <PuzzleTimerSetting />
      </AppSettingsProvider>,
    );

    expect(screen.getByText("Timer hidden")).toBeInTheDocument();
  });

  it("respects an existing preference to show the timer", () => {
    window.localStorage.setItem("atomic-puzzles.puzzles.show-timer-v2", "true");
    render(
      <AppSettingsProvider>
        <PuzzleTimerSetting />
      </AppSettingsProvider>,
    );

    expect(screen.getByText("Timer shown")).toBeInTheDocument();
  });

  it("does not carry forward the old opt-out default", () => {
    window.localStorage.setItem("atomic-puzzles.puzzles.show-timer", "true");
    render(
      <AppSettingsProvider>
        <PuzzleTimerSetting />
      </AppSettingsProvider>,
    );

    expect(screen.getByText("Timer hidden")).toBeInTheDocument();
  });
});

describe("coin visibility preferences", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows coin balances and change popups by default and persists opt-out choices", async () => {
    render(
      <AppSettingsProvider>
        <CoinVisibilitySettings />
      </AppSettingsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Balance shown" }));
    fireEvent.click(screen.getByRole("button", { name: "Popups shown" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Balance hidden" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Popups hidden" })).toBeInTheDocument();
      expect(window.localStorage.getItem("atomic-puzzles.coins.show-balance")).toBe("false");
      expect(window.localStorage.getItem("atomic-puzzles.puzzles.show-coin-change-popups")).toBe(
        "false",
      );
    });
  });
});

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

describe("profile rating preference", () => {
  beforeEach(() => window.localStorage.clear());

  it("hides Wolfrandom ratings by default and persists the opt-in setting", async () => {
    render(
      <AppSettingsProvider>
        <ProfileRatingSetting />
      </AppSettingsProvider>,
    );

    const toggle = screen.getByRole("button", { name: "Wolfrandom hidden" });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveTextContent("Wolfrandom shown");
      expect(window.localStorage.getItem("atomic-puzzles.profile.show-wolfrandom-ratings")).toBe(
        "true",
      );
    });
  });

  it("shows action buttons by default and persists the compact-menu preference", async () => {
    render(
      <AppSettingsProvider>
        <ProfileRatingSetting />
      </AppSettingsProvider>,
    );

    const toggle = screen.getByRole("button", { name: "Action buttons" });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveTextContent("Action menu");
      expect(window.localStorage.getItem("atomic-puzzles.profile.show-action-buttons")).toBe(
        "false",
      );
    });
  });
});
