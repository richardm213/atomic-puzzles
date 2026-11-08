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

  it("restores independent board appearances across theme switches and reloads", () => {
    const first = renderSettings();
    const { result } = first;

    act(() => {
      result.current.setBoardTheme("custom");
      result.current.setCustomLightSquare("#abcdef");
      result.current.setCustomDarkSquare("#123456");
      result.current.setPieceSet("merida");
      result.current.setBoardSoundsEnabled(true);
      result.current.setTheme("light");
    });
    expect(result.current).toMatchObject({
      boardTheme: "blue",
      pieceSet: "cburnett",
      boardSoundsEnabled: true,
    });
    act(() => {
      result.current.setBoardTheme("green");
      result.current.setPieceSet("alpha");
      result.current.setTheme("amethyst");
    });
    expect(result.current.boardTheme).toBe("purple");
    act(() => {
      result.current.setBoardTheme("blue");
      result.current.setTheme("dark");
    });
    expect(result.current).toMatchObject({
      boardTheme: "custom",
      customLightSquare: "#abcdef",
      customDarkSquare: "#123456",
      pieceSet: "merida",
    });
    first.unmount();

    const reloaded = renderSettings().result;
    expect(reloaded.current).toMatchObject({ theme: "dark", boardTheme: "custom" });
    act(() => reloaded.current.setTheme("light"));
    expect(reloaded.current).toMatchObject({ boardTheme: "green", pieceSet: "alpha" });
    act(() => reloaded.current.setTheme("amethyst"));
    expect(reloaded.current.boardTheme).toBe("blue");
  });

  it("keeps legacy board preferences and resets only the active theme's appearance", () => {
    window.localStorage.setItem("atomic-puzzles.theme", '"light"');
    window.localStorage.setItem("atomic-puzzles.board-theme", '"green"');
    window.localStorage.setItem("atomic-puzzles.board-color-override-theme", '"green"');
    window.localStorage.setItem("atomic-puzzles.board-override-light-square", '"#abcdef"');
    const { result } = renderSettings();
    expect(result.current).toMatchObject({
      theme: "light",
      boardTheme: "green",
      boardColorOverrideTheme: "green",
      boardOverrideLightSquare: "#abcdef",
    });

    act(() => result.current.resetDisplaySettings());
    expect(result.current).toMatchObject({
      theme: "light",
      boardTheme: "blue",
      boardColorOverrideTheme: "",
    });
    act(() => result.current.setTheme("dark"));
    expect(result.current).toMatchObject({
      boardTheme: "green",
      boardColorOverrideTheme: "green",
      boardOverrideLightSquare: "#abcdef",
    });
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
