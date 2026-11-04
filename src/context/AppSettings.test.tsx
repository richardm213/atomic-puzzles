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

const BoardCoordinatesSetting = () => {
  const { showBoardCoordinates, setShowBoardCoordinates } = useAppSettings();
  return (
    <button type="button" onClick={() => setShowBoardCoordinates((shown) => !shown)}>
      {showBoardCoordinates ? "Coordinates shown" : "Coordinates hidden"}
    </button>
  );
};

const PuzzleAnalysisTargetSetting = () => {
  const { puzzleAnalysisTarget, setPuzzleAnalysisTarget } = useAppSettings();
  return (
    <button
      type="button"
      onClick={() =>
        setPuzzleAnalysisTarget((target) => (target === "lichess" ? "atomic-puzzles" : "lichess"))
      }
    >
      {puzzleAnalysisTarget}
    </button>
  );
};

const LichessLinkTargetSetting = () => {
  const { lichessLinkTarget, setLichessLinkTarget } = useAppSettings();
  return (
    <button
      type="button"
      onClick={() =>
        setLichessLinkTarget((target) => (target === "lichess" ? "atomic-puzzles" : "lichess"))
      }
    >
      {lichessLinkTarget}
    </button>
  );
};

const GameExplorerPlacementSetting = () => {
  const { gameExplorerOnLeft, setGameExplorerOnLeft } = useAppSettings();
  return (
    <button type="button" onClick={() => setGameExplorerOnLeft((onLeft) => !onLeft)}>
      {gameExplorerOnLeft ? "Explorer on left" : "Explorer on right"}
    </button>
  );
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

  it("shows the timer by default", () => {
    render(
      <AppSettingsProvider>
        <PuzzleTimerSetting />
      </AppSettingsProvider>,
    );

    expect(screen.getByText("Timer shown")).toBeInTheDocument();
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

  it("respects an existing preference to hide the timer", () => {
    window.localStorage.setItem("atomic-puzzles.puzzles.show-timer-v2", "false");
    render(
      <AppSettingsProvider>
        <PuzzleTimerSetting />
      </AppSettingsProvider>,
    );

    expect(screen.getByText("Timer hidden")).toBeInTheDocument();
  });

  it("ignores the old preference key and uses the current default", () => {
    window.localStorage.setItem("atomic-puzzles.puzzles.show-timer", "true");
    render(
      <AppSettingsProvider>
        <PuzzleTimerSetting />
      </AppSettingsProvider>,
    );

    expect(screen.getByText("Timer shown")).toBeInTheDocument();
  });
});

describe("board coordinate preference", () => {
  beforeEach(() => window.localStorage.clear());

  it("hides coordinates by default and persists the shown setting", async () => {
    render(
      <AppSettingsProvider>
        <BoardCoordinatesSetting />
      </AppSettingsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Coordinates hidden" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Coordinates shown" })).toBeInTheDocument();
      expect(window.localStorage.getItem("atomic-puzzles.board.show-coordinates")).toBe("true");
    });
  });
});

describe("puzzle analysis link preference", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to Atomic Puzzles and persists a Lichess preference", async () => {
    render(
      <AppSettingsProvider>
        <PuzzleAnalysisTargetSetting />
      </AppSettingsProvider>,
    );

    const toggle = screen.getByRole("button", { name: "atomic-puzzles" });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveTextContent("lichess");
      expect(window.localStorage.getItem("atomic-puzzles.puzzles.analysis-link-target")).toBe(
        '"lichess"',
      );
    });
  });
});

describe("Lichess game link preference", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to Lichess and persists the Atomic Puzzles option", async () => {
    render(
      <AppSettingsProvider>
        <LichessLinkTargetSetting />
      </AppSettingsProvider>,
    );

    const toggle = screen.getByRole("button", { name: "lichess" });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveTextContent("atomic-puzzles");
      expect(window.localStorage.getItem("atomic-puzzles.games.lichess-link-target")).toBe(
        '"atomic-puzzles"',
      );
    });
  });
});

describe("game opening explorer placement", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to the right and persists the left-side option", async () => {
    render(
      <AppSettingsProvider>
        <GameExplorerPlacementSetting />
      </AppSettingsProvider>,
    );

    const toggle = screen.getByRole("button", { name: "Explorer on right" });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(toggle).toHaveTextContent("Explorer on left");
      expect(window.localStorage.getItem("atomic-puzzles.games.explorer-on-left")).toBe("true");
    });
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
