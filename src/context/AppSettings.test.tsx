import { act, renderHook } from "@testing-library/react";

import { AppSettingsProvider, getBoardThemeColors, useAppSettings } from "./AppSettings";

const renderSettings = () => renderHook(useAppSettings, { wrapper: AppSettingsProvider });

describe("AppSettings", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps Ruby's dark board and custom colors while using a separate light board", () => {
    const rubyDark = getBoardThemeColors("ruby");
    const rubyLight = getBoardThemeColors(
      "ruby",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "light",
    );
    expect(rubyLight).not.toEqual(rubyDark);
    for (const colorMode of ["light", "dark"] as const) {
      expect(
        getBoardThemeColors("ruby", undefined, undefined, "ruby", "#123456", "#654321", colorMode),
      ).toEqual({ light: "#123456", dark: "#654321" });
    }
  });

  it("ignores the legacy timer opt-in but preserves a current opt-out", () => {
    window.localStorage.setItem("atomic-puzzles.puzzles.show-timer-v2", "false");
    const first = renderSettings();
    expect(first.result.current.showPuzzleTimer).toBe(true);
    expect(first.result.current.excludeOwnPuzzles).toBe(false);

    act(() => first.result.current.setShowPuzzleTimer(false));
    act(() => first.result.current.setExcludeOwnPuzzles(true));
    first.unmount();

    const restored = renderSettings();
    expect(restored.result.current.showPuzzleTimer).toBe(false);
    expect(restored.result.current.excludeOwnPuzzles).toBe(true);
  });

  it("defaults to Atomic-Stockfish and restores an explicit FSF14 selection", () => {
    const first = renderSettings();
    expect(first.result.current.localAnalysisEngine).toBe("atomic-stockfish");

    act(() => first.result.current.setLocalAnalysisEngine("fairy-stockfish-14"));
    first.unmount();

    expect(renderSettings().result.current.localAnalysisEngine).toBe("fairy-stockfish-14");
  });

  it("restores customized and disabled keyboard shortcuts after remounting", () => {
    const settings = renderSettings();
    act(() =>
      settings.result.current.setKeyboardShortcuts((current) => ({
        ...current,
        enabled: false,
        bindings: {
          ...current.bindings,
          nextItem: { enabled: false, keys: ["n"] },
        },
      })),
    );
    settings.unmount();
    const saved = renderSettings().result.current.keyboardShortcuts;
    expect(saved.enabled).toBe(false);
    expect(saved.bindings.nextItem).toEqual({ enabled: false, keys: ["n"] });
    expect(saved.bindings.previousMove.keys).toContain("ArrowLeft");
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
      result.current.setColorMode("light");
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
      result.current.setColorMode("dark");
    });
    expect(result.current.boardTheme).toBe("amethyst");
    act(() => {
      result.current.setBoardTheme("blue");
      result.current.setTheme("default");
      result.current.setColorMode("dark");
    });
    expect(result.current).toMatchObject({
      boardTheme: "custom",
      customLightSquare: "#abcdef",
      customDarkSquare: "#123456",
      pieceSet: "merida",
    });
    first.unmount();

    const reloaded = renderSettings().result;
    expect(reloaded.current).toMatchObject({
      theme: "default",
      colorMode: "dark",
      boardTheme: "custom",
    });
    act(() => reloaded.current.setColorMode("light"));
    expect(reloaded.current).toMatchObject({ boardTheme: "green", pieceSet: "alpha" });
    act(() => {
      reloaded.current.setTheme("amethyst");
      reloaded.current.setColorMode("dark");
    });
    expect(reloaded.current.boardTheme).toBe("blue");
  });

  it("keeps legacy board preferences and resets only the active theme's appearance", () => {
    window.localStorage.setItem("atomic-puzzles.theme", '"light"');
    window.localStorage.setItem("atomic-puzzles.board-theme", '"green"');
    window.localStorage.setItem("atomic-puzzles.board-color-override-theme", '"green"');
    window.localStorage.setItem("atomic-puzzles.board-override-light-square", '"#abcdef"');
    const { result } = renderSettings();
    expect(result.current).toMatchObject({
      theme: "default",
      colorMode: "light",
      boardTheme: "green",
      boardColorOverrideTheme: "green",
      boardOverrideLightSquare: "#abcdef",
    });

    act(() => result.current.resetDisplaySettings());
    expect(result.current).toMatchObject({
      theme: "default",
      colorMode: "light",
      boardTheme: "blue",
      boardColorOverrideTheme: "",
    });
    act(() => result.current.setColorMode("dark"));
    expect(result.current).toMatchObject({
      boardTheme: "green",
      boardColorOverrideTheme: "green",
      boardOverrideLightSquare: "#abcdef",
    });
  });

  it("adds gemstone defaults without discarding saved boards from the three-theme format", () => {
    const savedBoard = {
      pieceSet: "merida",
      boardTheme: "custom",
      customLightSquare: "#f3e5cf",
      customDarkSquare: "#746983",
      boardColorOverrideTheme: "",
      boardOverrideLightSquare: "#d4e4ff",
      boardOverrideDarkSquare: "#6291d8",
    };
    window.localStorage.setItem(
      "atomic-puzzles.board.appearance-by-theme",
      JSON.stringify({ dark: savedBoard, light: savedBoard, amethyst: savedBoard }),
    );
    window.localStorage.setItem("atomic-puzzles.theme", '"amethyst"');
    const first = renderSettings();
    const { result } = first;
    expect(result.current).toMatchObject({ theme: "amethyst", colorMode: "dark", ...savedBoard });

    act(() => result.current.setTheme("ruby"));
    expect(result.current.boardTheme).toBe("ruby");
    act(() => result.current.setPieceSet("alpha"));
    act(() => result.current.setColorMode("light"));
    expect(result.current).toMatchObject({
      theme: "ruby",
      boardTheme: "ruby",
      pieceSet: "cburnett",
    });
    act(() => result.current.setTheme("emerald"));
    expect(result.current).toMatchObject({ colorMode: "light", boardTheme: "emerald" });
    first.unmount();

    const reloaded = renderSettings().result;
    expect(reloaded.current).toMatchObject({
      theme: "emerald",
      colorMode: "light",
    });
    act(() => {
      reloaded.current.setTheme("ruby");
      reloaded.current.setColorMode("dark");
    });
    expect(reloaded.current).toMatchObject({ boardTheme: "ruby", pieceSet: "alpha" });
    act(() => reloaded.current.setTheme("amethyst"));
    expect(reloaded.current).toMatchObject(savedBoard);
  });

  it("restores the saved palette and mode even if color intensity was saved", () => {
    window.localStorage.setItem(
      "atomic-puzzles.site-appearance",
      JSON.stringify({ theme: "ruby", colorMode: "light", gemstoneStrength: "rich" }),
    );
    const { result } = renderSettings();
    expect(result.current).toMatchObject({ theme: "ruby", colorMode: "light" });

    act(() => result.current.setColorMode("dark"));
    expect(
      JSON.parse(window.localStorage.getItem("atomic-puzzles.site-appearance") ?? "{}"),
    ).toEqual({ theme: "ruby", colorMode: "dark" });
  });

  it("restores the previous mode and its board after leaving the dark-only palette", () => {
    const first = renderSettings();
    act(() => first.result.current.setColorMode("light"));
    act(() => first.result.current.setBoardTheme("green"));
    act(() => first.result.current.setTheme("black"));
    expect(first.result.current).toMatchObject({ colorMode: "dark", boardTheme: "grey" });
    act(() => first.result.current.setBoardTheme("wood"));
    first.unmount();

    const { result } = renderSettings();
    expect(result.current).toMatchObject({ theme: "black", colorMode: "dark", boardTheme: "wood" });
    act(() => result.current.setColorMode("dark"));
    act(() => result.current.setTheme("default"));
    expect(result.current).toMatchObject({ colorMode: "light", boardTheme: "green" });
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
