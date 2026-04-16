import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEYS = {
  theme: "atomic-puzzles.theme",
  pieceSet: "atomic-puzzles.piece-set",
  boardTheme: "atomic-puzzles.board-theme",
  customLightSquare: "atomic-puzzles.custom-light-square",
  customDarkSquare: "atomic-puzzles.custom-dark-square",
  boardColorOverrideTheme: "atomic-puzzles.board-color-override-theme",
  boardOverrideLightSquare: "atomic-puzzles.board-override-light-square",
  boardOverrideDarkSquare: "atomic-puzzles.board-override-dark-square",
};

export const THEMES = ["dark", "light"];

export const LICHESS_PIECE_SETS = [
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

export const LICHESS_BOARD_THEMES = [
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

export const BOARD_THEME_PALETTE = {
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

export const IMAGE_BOARD_THEMES = ["wood", "wood2", "wood3", "wood4", "maple", "maple2"];

const DEFAULT_THEME = "dark";
const DEFAULT_PIECE_SET = "cburnett";
const DEFAULT_BOARD_THEME = "blue";
const DEFAULT_CUSTOM_LIGHT_SQUARE = "#d4e4ff";
const DEFAULT_CUSTOM_DARK_SQUARE = "#6291d8";

const AppSettingsContext = createContext(null);

const isValidTheme = (value) => THEMES.includes(value);
const isValidPieceSet = (value) => LICHESS_PIECE_SETS.some((entry) => entry.value === value);
const isValidBoardTheme = (value) => LICHESS_BOARD_THEMES.some((entry) => entry.value === value);
const isValidHexColor = (value) => /^#([0-9a-f]{6})$/i.test(value ?? "");
export const isImageBoardTheme = (value) => IMAGE_BOARD_THEMES.includes(value);
const isValidBoardColorOverrideTheme = (value) =>
  isValidBoardTheme(value) && value !== "custom" && !isImageBoardTheme(value);

const readStoredValue = (key, validator, fallback) => {
  if (typeof window === "undefined") return fallback;
  const storedValue = window.localStorage.getItem(key);
  return validator(storedValue) ? storedValue : fallback;
};

const usePersistedState = (key, validator, fallback) => {
  const [value, setValue] = useState(() => readStoredValue(key, validator, fallback));

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue];
};

export const getBoardThemeColors = (
  boardTheme,
  customLightSquare,
  customDarkSquare,
  boardColorOverrideTheme = "",
  boardOverrideLightSquare = DEFAULT_CUSTOM_LIGHT_SQUARE,
  boardOverrideDarkSquare = DEFAULT_CUSTOM_DARK_SQUARE,
) => {
  if (boardTheme === "custom") {
    return { light: customLightSquare, dark: customDarkSquare };
  }

  if (boardColorOverrideTheme === boardTheme && !isImageBoardTheme(boardTheme)) {
    return { light: boardOverrideLightSquare, dark: boardOverrideDarkSquare };
  }

  return BOARD_THEME_PALETTE[boardTheme] ?? BOARD_THEME_PALETTE[DEFAULT_BOARD_THEME];
};

export const AppSettingsProvider = ({ children }) => {
  const [theme, setTheme] = usePersistedState(STORAGE_KEYS.theme, isValidTheme, DEFAULT_THEME);
  const [pieceSet, setPieceSet] = usePersistedState(
    STORAGE_KEYS.pieceSet,
    isValidPieceSet,
    DEFAULT_PIECE_SET,
  );
  const [boardTheme, setBoardTheme] = usePersistedState(
    STORAGE_KEYS.boardTheme,
    isValidBoardTheme,
    DEFAULT_BOARD_THEME,
  );
  const [customLightSquare, setCustomLightSquare] = usePersistedState(
    STORAGE_KEYS.customLightSquare,
    isValidHexColor,
    DEFAULT_CUSTOM_LIGHT_SQUARE,
  );
  const [customDarkSquare, setCustomDarkSquare] = usePersistedState(
    STORAGE_KEYS.customDarkSquare,
    isValidHexColor,
    DEFAULT_CUSTOM_DARK_SQUARE,
  );
  const [boardColorOverrideTheme, setBoardColorOverrideTheme] = usePersistedState(
    STORAGE_KEYS.boardColorOverrideTheme,
    isValidBoardColorOverrideTheme,
    "",
  );
  const [boardOverrideLightSquare, setBoardOverrideLightSquare] = usePersistedState(
    STORAGE_KEYS.boardOverrideLightSquare,
    isValidHexColor,
    DEFAULT_CUSTOM_LIGHT_SQUARE,
  );
  const [boardOverrideDarkSquare, setBoardOverrideDarkSquare] = usePersistedState(
    STORAGE_KEYS.boardOverrideDarkSquare,
    isValidHexColor,
    DEFAULT_CUSTOM_DARK_SQUARE,
  );

  const resetDisplaySettings = () => {
    setTheme(DEFAULT_THEME);
    setPieceSet(DEFAULT_PIECE_SET);
    setBoardTheme(DEFAULT_BOARD_THEME);
    setCustomLightSquare(DEFAULT_CUSTOM_LIGHT_SQUARE);
    setCustomDarkSquare(DEFAULT_CUSTOM_DARK_SQUARE);
    setBoardColorOverrideTheme("");
    setBoardOverrideLightSquare(DEFAULT_CUSTOM_LIGHT_SQUARE);
    setBoardOverrideDarkSquare(DEFAULT_CUSTOM_DARK_SQUARE);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const value = useMemo(
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
    }),
    [
      theme,
      pieceSet,
      boardTheme,
      customLightSquare,
      customDarkSquare,
      boardColorOverrideTheme,
      boardOverrideLightSquare,
      boardOverrideDarkSquare,
    ],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
};

export const useAppSettings = () => {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error("useAppSettings must be used inside AppSettingsProvider");
  }
  return context;
};
