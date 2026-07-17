import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { z } from "zod";

import { usePersistedState } from "../hooks/usePersistedState";

const STORAGE_KEYS = {
  theme: "atomic-puzzles.theme",
  pieceSet: "atomic-puzzles.piece-set",
  boardTheme: "atomic-puzzles.board-theme",
  customLightSquare: "atomic-puzzles.custom-light-square",
  customDarkSquare: "atomic-puzzles.custom-dark-square",
  boardColorOverrideTheme: "atomic-puzzles.board-color-override-theme",
  boardOverrideLightSquare: "atomic-puzzles.board-override-light-square",
  boardOverrideDarkSquare: "atomic-puzzles.board-override-dark-square",
  hideRankingsOpenings: "atomic-puzzles.rankings.hide-openings",
  showPuzzleTimer: "atomic-puzzles.puzzles.show-timer",
};

const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

export type LabeledOption = { value: string; label: string };

const LICHESS_PIECE_SETS: LabeledOption[] = [
  { value: "cburnett", label: "Cburnett" },
  { value: "merida", label: "Merida" },
  { value: "alpha", label: "Alpha" },
  { value: "pirouetti", label: "Pirouetti" },
  { value: "chessnut", label: "Chessnut" },
  { value: "chess7", label: "Chess7" },
  { value: "reillycraig", label: "ReillyCraig" },
  { value: "companion", label: "Companion" },
  { value: "riohacha", label: "Riohacha" },
  { value: "kosal", label: "Kosal" },
  { value: "leipzig", label: "Leipzig" },
  { value: "fantasy", label: "Fantasy" },
  { value: "spatial", label: "Spatial" },
  { value: "celtic", label: "Celtic" },
  { value: "california", label: "California" },
  { value: "caliente", label: "Caliente" },
  { value: "pixel", label: "Pixel" },
  { value: "firi", label: "Firi" },
  { value: "rhosgfx", label: "Rhosgfx" },
  { value: "maestro", label: "Maestro" },
  { value: "fresca", label: "Fresca" },
  { value: "cardinal", label: "Cardinal" },
  { value: "gioco", label: "Gioco" },
  { value: "tatiana", label: "Tatiana" },
  { value: "staunty", label: "Staunty" },
  { value: "cooke", label: "Cooke" },
  { value: "monarchy", label: "Monarchy" },
  { value: "governor", label: "Governor" },
  { value: "dubrovny", label: "Dubrovny" },
  { value: "shahi-ivory-brown", label: "Shahi Ivory Brown" },
  { value: "icpieces", label: "Icpieces" },
  { value: "mpchess", label: "MPChess" },
  { value: "kiwen-suwi", label: "Kiwen Suwi" },
  { value: "horsey", label: "Horsey" },
  { value: "anarcandy", label: "Anarcandy" },
  { value: "xkcd", label: "XKCD" },
  { value: "shapes", label: "Shapes" },
  { value: "letter", label: "Letter" },
  { value: "disguised", label: "Disguised" },
];

const LICHESS_BOARD_THEMES: LabeledOption[] = [
  { value: "blue", label: "Blue" },
  { value: "blue2", label: "Blue 2" },
  { value: "blue3", label: "Blue 3" },
  { value: "blue-marble", label: "Blue Marble" },
  { value: "canvas", label: "Canvas" },
  { value: "wood", label: "Wood" },
  { value: "wood2", label: "Wood 2" },
  { value: "wood3", label: "Wood 3" },
  { value: "wood4", label: "Wood 4" },
  { value: "maple", label: "Maple" },
  { value: "maple2", label: "Maple 2" },
  { value: "brown", label: "Brown" },
  { value: "leather", label: "Leather" },
  { value: "green", label: "Green" },
  { value: "marble", label: "Marble" },
  { value: "green-plastic", label: "Green Plastic" },
  { value: "grey", label: "Grey" },
  { value: "metal", label: "Metal" },
  { value: "olive", label: "Olive" },
  { value: "newspaper", label: "Newspaper" },
  { value: "purple", label: "Purple" },
  { value: "pink", label: "Pink" },
  { value: "ic", label: "IC" },
  { value: "custom", label: "Custom" },
];

export type BoardSquareColors = { light: string; dark: string };

const BOARD_THEME_PALETTE: Record<string, BoardSquareColors> = {
  blue: { light: "#d4e4ff", dark: "#6291d8" },
  blue2: { light: "#cbdfff", dark: "#4d7fca" },
  blue3: { light: "#e0e7ef", dark: "#6c88a6" },
  "blue-marble": { light: "#d9e7f2", dark: "#5b7da1" },
  canvas: { light: "#e7ddc6", dark: "#c3ad7d" },
  wood: { light: "#e3bf80", dark: "#b57a3f" },
  wood2: { light: "#e9c88f", dark: "#a66a34" },
  wood3: { light: "#f0d5a4", dark: "#8e5f34" },
  wood4: { light: "#ebd0a7", dark: "#93653d" },
  maple: { light: "#f4ddad", dark: "#c38d53" },
  maple2: { light: "#f1d8a5", dark: "#ae7740" },
  brown: { light: "#f0d9b5", dark: "#b58863" },
  leather: { light: "#d8bd9c", dark: "#8a5a44" },
  green: { light: "#e7f0c7", dark: "#7ea650" },
  marble: { light: "#efefef", dark: "#8d8d8d" },
  "green-plastic": { light: "#edf7d9", dark: "#719f59" },
  grey: { light: "#d9d9d9", dark: "#8a8a8a" },
  metal: { light: "#d8dde2", dark: "#808a93" },
  olive: { light: "#e7e6c8", dark: "#8b8d56" },
  newspaper: { light: "#f4eed9", dark: "#b4a789" },
  purple: { light: "#eadcf7", dark: "#8460b5" },
  "purple-diag": { light: "#efe1fb", dark: "#76549d" },
  pink: { light: "#f8dbe4", dark: "#c86a8d" },
  ic: { light: "#dff6ff", dark: "#66b9d6" },
};

const IMAGE_BOARD_THEMES = ["wood", "wood2", "wood3", "wood4", "maple", "maple2"];

const DEFAULT_THEME: Theme = "dark";
const DEFAULT_PIECE_SET = "cburnett";
const DEFAULT_BOARD_THEME = "blue";
const DEFAULT_CUSTOM_LIGHT_SQUARE = "#d4e4ff";
const DEFAULT_CUSTOM_DARK_SQUARE = "#6291d8";

export type AppSettingsContextValue = {
  theme: Theme;
  setTheme: Dispatch<SetStateAction<Theme>>;
  pieceSet: string;
  setPieceSet: Dispatch<SetStateAction<string>>;
  pieceSets: LabeledOption[];
  boardTheme: string;
  setBoardTheme: Dispatch<SetStateAction<string>>;
  boardThemes: LabeledOption[];
  customLightSquare: string;
  setCustomLightSquare: Dispatch<SetStateAction<string>>;
  customDarkSquare: string;
  setCustomDarkSquare: Dispatch<SetStateAction<string>>;
  boardColorOverrideTheme: string;
  setBoardColorOverrideTheme: Dispatch<SetStateAction<string>>;
  boardOverrideLightSquare: string;
  setBoardOverrideLightSquare: Dispatch<SetStateAction<string>>;
  boardOverrideDarkSquare: string;
  setBoardOverrideDarkSquare: Dispatch<SetStateAction<string>>;
  resetDisplaySettings: () => void;
  hideRankingsOpenings: boolean;
  setHideRankingsOpenings: Dispatch<SetStateAction<boolean>>;
  showPuzzleTimer: boolean;
  setShowPuzzleTimer: Dispatch<SetStateAction<boolean>>;
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

const isValidPieceSet = (value: unknown): value is string =>
  typeof value === "string" && LICHESS_PIECE_SETS.some((entry) => entry.value === value);
const isValidBoardTheme = (value: unknown): value is string =>
  typeof value === "string" && LICHESS_BOARD_THEMES.some((entry) => entry.value === value);
const isValidHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#([0-9a-f]{6})$/i.test(value);
const isImageBoardTheme = (value: string): boolean => IMAGE_BOARD_THEMES.includes(value);
const themeSchema = z.enum(THEMES);
const pieceSetSchema = z.string().refine(isValidPieceSet);
const boardThemeSchema = z.string().refine(isValidBoardTheme);
const hexColorSchema = z.string().refine(isValidHexColor);
const boardColorOverrideSchema = z.string();

export const getBoardThemeColors = (
  boardTheme: string,
  customLightSquare: string,
  customDarkSquare: string,
  boardColorOverrideTheme = "",
  boardOverrideLightSquare: string = DEFAULT_CUSTOM_LIGHT_SQUARE,
  boardOverrideDarkSquare: string = DEFAULT_CUSTOM_DARK_SQUARE,
): BoardSquareColors => {
  if (boardTheme === "custom") {
    return { light: customLightSquare, dark: customDarkSquare };
  }

  if (boardColorOverrideTheme === boardTheme && !isImageBoardTheme(boardTheme)) {
    return { light: boardOverrideLightSquare, dark: boardOverrideDarkSquare };
  }

  return (
    BOARD_THEME_PALETTE[boardTheme] ??
    BOARD_THEME_PALETTE[DEFAULT_BOARD_THEME] ?? { light: "#ffffff", dark: "#000000" }
  );
};

export const AppSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = usePersistedState<Theme>(
    STORAGE_KEYS.theme,
    themeSchema,
    DEFAULT_THEME,
  );
  const [pieceSet, setPieceSet] = usePersistedState<string>(
    STORAGE_KEYS.pieceSet,
    pieceSetSchema,
    DEFAULT_PIECE_SET,
  );
  const [boardTheme, setBoardTheme] = usePersistedState<string>(
    STORAGE_KEYS.boardTheme,
    boardThemeSchema,
    DEFAULT_BOARD_THEME,
  );
  const [customLightSquare, setCustomLightSquare] = usePersistedState<string>(
    STORAGE_KEYS.customLightSquare,
    hexColorSchema,
    DEFAULT_CUSTOM_LIGHT_SQUARE,
  );
  const [customDarkSquare, setCustomDarkSquare] = usePersistedState<string>(
    STORAGE_KEYS.customDarkSquare,
    hexColorSchema,
    DEFAULT_CUSTOM_DARK_SQUARE,
  );
  const [boardColorOverrideTheme, setBoardColorOverrideTheme] = usePersistedState<string>(
    STORAGE_KEYS.boardColorOverrideTheme,
    boardColorOverrideSchema,
    "",
  );
  const [boardOverrideLightSquare, setBoardOverrideLightSquare] = usePersistedState<string>(
    STORAGE_KEYS.boardOverrideLightSquare,
    hexColorSchema,
    DEFAULT_CUSTOM_LIGHT_SQUARE,
  );
  const [boardOverrideDarkSquare, setBoardOverrideDarkSquare] = usePersistedState<string>(
    STORAGE_KEYS.boardOverrideDarkSquare,
    hexColorSchema,
    DEFAULT_CUSTOM_DARK_SQUARE,
  );
  const [hideRankingsOpenings, setHideRankingsOpenings] = usePersistedState(
    STORAGE_KEYS.hideRankingsOpenings,
    z.boolean(),
    false,
  );
  const [showPuzzleTimer, setShowPuzzleTimer] = usePersistedState(
    STORAGE_KEYS.showPuzzleTimer,
    z.boolean(),
    true,
  );

  const resetDisplaySettings = useCallback(() => {
    setTheme(DEFAULT_THEME);
    setPieceSet(DEFAULT_PIECE_SET);
    setBoardTheme(DEFAULT_BOARD_THEME);
    setCustomLightSquare(DEFAULT_CUSTOM_LIGHT_SQUARE);
    setCustomDarkSquare(DEFAULT_CUSTOM_DARK_SQUARE);
    setBoardColorOverrideTheme("");
    setBoardOverrideLightSquare(DEFAULT_CUSTOM_LIGHT_SQUARE);
    setBoardOverrideDarkSquare(DEFAULT_CUSTOM_DARK_SQUARE);
  }, [
    setTheme,
    setPieceSet,
    setBoardTheme,
    setCustomLightSquare,
    setCustomDarkSquare,
    setBoardColorOverrideTheme,
    setBoardOverrideLightSquare,
    setBoardOverrideDarkSquare,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.dataset["theme"] = theme;
  }, [theme]);

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      theme,
      setTheme,
      pieceSet,
      setPieceSet,
      pieceSets: LICHESS_PIECE_SETS,
      boardTheme,
      setBoardTheme,
      boardThemes: LICHESS_BOARD_THEMES,
      customLightSquare,
      setCustomLightSquare,
      customDarkSquare,
      setCustomDarkSquare,
      boardColorOverrideTheme,
      setBoardColorOverrideTheme,
      boardOverrideLightSquare,
      setBoardOverrideLightSquare,
      boardOverrideDarkSquare,
      setBoardOverrideDarkSquare,
      resetDisplaySettings,
      hideRankingsOpenings,
      setHideRankingsOpenings,
      showPuzzleTimer,
      setShowPuzzleTimer,
    }),
    [
      theme,
      setTheme,
      pieceSet,
      setPieceSet,
      boardTheme,
      setBoardTheme,
      customLightSquare,
      setCustomLightSquare,
      customDarkSquare,
      setCustomDarkSquare,
      boardColorOverrideTheme,
      setBoardColorOverrideTheme,
      boardOverrideLightSquare,
      setBoardOverrideLightSquare,
      boardOverrideDarkSquare,
      setBoardOverrideDarkSquare,
      resetDisplaySettings,
      hideRankingsOpenings,
      setHideRankingsOpenings,
      showPuzzleTimer,
      setShowPuzzleTimer,
    ],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
};

export const useAppSettings = (): AppSettingsContextValue => {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error("useAppSettings must be used inside AppSettingsProvider");
  }
  return context;
};
