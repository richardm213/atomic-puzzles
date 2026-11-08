import { act, renderHook } from "@testing-library/react";

import { AppSettingsProvider, useAppSettings } from "./AppSettings";

const renderSettings = () => renderHook(useAppSettings, { wrapper: AppSettingsProvider });

describe("AppSettings", () => {
  beforeEach(() => window.localStorage.clear());

  it("ignores the legacy timer opt-in but preserves a current opt-out", () => {
    window.localStorage.setItem("atomic-puzzles.puzzles.show-timer-v2", "false");
    const first = renderSettings();
    expect(first.result.current.showPuzzleTimer).toBe(true);

    act(() => first.result.current.setShowPuzzleTimer(false));
    first.unmount();

    expect(renderSettings().result.current.showPuzzleTimer).toBe(false);
  });

  it("defaults to Atomic-Stockfish and restores an explicit FSF14 selection", () => {
    const first = renderSettings();
    expect(first.result.current.localAnalysisEngine).toBe("atomic-stockfish");

    act(() => first.result.current.setLocalAnalysisEngine("fairy-stockfish-14"));
    first.unmount();

    expect(renderSettings().result.current.localAnalysisEngine).toBe("fairy-stockfish-14");
  });

  it("keeps board sounds opt-in", () => {
    const first = renderSettings();
    expect(first.result.current.boardSoundsEnabled).toBe(false);

    act(() => first.result.current.setBoardSoundsEnabled(true));
    first.unmount();

    expect(renderSettings().result.current.boardSoundsEnabled).toBe(true);
  });

  it("persists puzzle and game link targets independently", () => {
    const first = renderSettings();
    expect(first.result.current.puzzleAnalysisTarget).toBe("atomic-puzzles");
    expect(first.result.current.lichessLinkTarget).toBe("lichess");

    act(() => {
      first.result.current.setPuzzleAnalysisTarget("lichess");
      first.result.current.setLichessLinkTarget("atomic-puzzles");
    });
    first.unmount();

    const { result } = renderSettings();
    expect(result.current.puzzleAnalysisTarget).toBe("lichess");
    expect(result.current.lichessLinkTarget).toBe("atomic-puzzles");
  });

  it("restores customized profile rating slots without changing the other slots", () => {
    const first = renderSettings();
    act(() => first.result.current.setProfileRatingSlots(["rapid", "auto", "auto", "auto"]));
    first.unmount();

    expect(renderSettings().result.current.profileRatingSlots).toEqual([
      "rapid",
      "auto",
      "auto",
      "auto",
    ]);
  });
});
