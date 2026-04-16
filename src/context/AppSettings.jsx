import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEYS = {
  theme: "atomic-puzzles.theme",
  pieceSet: "atomic-puzzles.piece-set",
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

const DEFAULT_THEME = "dark";
const DEFAULT_PIECE_SET = "cburnett";

const AppSettingsContext = createContext(null);

const isValidTheme = (value) => THEMES.includes(value);
const isValidPieceSet = (value) => LICHESS_PIECE_SETS.some((entry) => entry.value === value);
const readStoredTheme = () => {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const storedTheme = window.localStorage.getItem(STORAGE_KEYS.theme);
  return isValidTheme(storedTheme) ? storedTheme : DEFAULT_THEME;
};
const readStoredPieceSet = () => {
  if (typeof window === "undefined") return DEFAULT_PIECE_SET;
  const storedPieceSet = window.localStorage.getItem(STORAGE_KEYS.pieceSet);
  return isValidPieceSet(storedPieceSet) ? storedPieceSet : DEFAULT_PIECE_SET;
};

export const AppSettingsProvider = ({ children }) => {
  const [theme, setTheme] = useState(readStoredTheme);
  const [pieceSet, setPieceSet] = useState(readStoredPieceSet);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEYS.theme, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.pieceSet, pieceSet);
  }, [pieceSet]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      pieceSet,
      setPieceSet,
      pieceSets: LICHESS_PIECE_SETS,
    }),
    [theme, pieceSet],
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
