import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { z } from "zod";

import {
  defaultProfileRatingSlotPreferences,
  type ProfileRatingSlotPreferences,
} from "../features/profile/profileRatingModes";
import { readPersistedState, usePersistedState } from "../hooks/usePersistedState";
import {
  BOARD_SOUND_SETS,
  type BoardSoundSet,
  isBoardSoundSet,
} from "../lib/boardSounds/boardSounds";
import {
  DEFAULT_LOCAL_ANALYSIS_ENGINE,
  LOCAL_ANALYSIS_ENGINE_STORAGE_KEY,
  type LocalAnalysisEngine,
} from "../lib/practice/localAnalysisEngine";

const STORAGE_KEYS = {
  siteAppearance: "atomic-puzzles.site-appearance",
  boardAppearanceByTheme: "atomic-puzzles.board.appearance-by-theme",
  showBoardCoordinates: "atomic-puzzles.board.show-coordinates",
  enableBoardPremoves: "atomic-puzzles.board.enable-premoves",
  boardSoundsEnabled: "atomic-puzzles.board.sounds-enabled",
  boardSoundSet: "atomic-puzzles.board.sound-set",
  hideRankingsOpenings: "atomic-puzzles.rankings.hide-openings",
  showChessComRankings: "atomic-puzzles.rankings.show-chesscom-users",
  profileRatingSlots: "atomic-puzzles.profile.rating-slots",
  showProfileActionButtons: "atomic-puzzles.profile.show-action-buttons",
  showCoinBalance: "atomic-puzzles.coins.show-balance",
  showCoinChangePopups: "atomic-puzzles.puzzles.show-coin-change-popups",
  // v3 makes the timer visible by default for everyone while preserving later changes.
  showPuzzleTimer: "atomic-puzzles.puzzles.show-timer-v3",
  puzzleAnalysisTarget: "atomic-puzzles.puzzles.analysis-link-target",
  lichessLinkTarget: "atomic-puzzles.games.lichess-link-target",
  gameExplorerOnLeft: "atomic-puzzles.games.explorer-on-left",
  localAnalysisEngine: LOCAL_ANALYSIS_ENGINE_STORAGE_KEY,
  showRatingGraphLines: "profile.ratingGraph.showLines",
  hiddenRatingGraphModes: "profile.ratingGraph.hiddenModes",
};

export const GEMSTONE_THEMES = ["amethyst", "ruby", "emerald"] as const;
const COLOR_MODES = ["dark", "light"] as const;
const THEMES = ["default", ...GEMSTONE_THEMES] as const;
export type Theme = (typeof THEMES)[number];
export type ColorMode = (typeof COLOR_MODES)[number];

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
  { value: "ruby", label: "Ruby" },
  { value: "emerald", label: "Emerald" },
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
  ruby: { light: "#f7f1f2", dark: "#9b5b67" },
  emerald: { light: "#d7eee4", dark: "#4b8c77" },
  "purple-diag": { light: "#efe1fb", dark: "#76549d" },
  pink: { light: "#f8dbe4", dark: "#c86a8d" },
  ic: { light: "#dff6ff", dark: "#66b9d6" },
};

const IMAGE_BOARD_THEMES = ["wood", "wood2", "wood3", "wood4", "maple", "maple2"];

const DEFAULT_THEME: Theme = "default";
const DEFAULT_COLOR_MODE: ColorMode = "dark";
const DEFAULT_PIECE_SET = "cburnett";
const DEFAULT_BOARD_THEME = "blue";
const DEFAULT_CUSTOM_LIGHT_SQUARE = "#d4e4ff";
const DEFAULT_CUSTOM_DARK_SQUARE = "#6291d8";
const DEFAULT_BOARD_SOUND_SET: BoardSoundSet = "standard";

const DEFAULT_BOARD_THEME_BY_PALETTE: Record<Theme, string> = {
  default: DEFAULT_BOARD_THEME,
  amethyst: "purple",
  ruby: "ruby",
  emerald: "emerald",
};

export const getDefaultBoardTheme = (theme: Theme): string => DEFAULT_BOARD_THEME_BY_PALETTE[theme];

export type AppSettingsContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
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
  showBoardCoordinates: boolean;
  setShowBoardCoordinates: Dispatch<SetStateAction<boolean>>;
  enableBoardPremoves: boolean;
  setEnableBoardPremoves: Dispatch<SetStateAction<boolean>>;
  boardSoundsEnabled: boolean;
  setBoardSoundsEnabled: Dispatch<SetStateAction<boolean>>;
  boardSoundSet: BoardSoundSet;
  setBoardSoundSet: Dispatch<SetStateAction<BoardSoundSet>>;
  boardSoundSets: ReadonlyArray<{ value: BoardSoundSet; label: string }>;
  resetDisplaySettings: () => void;
  hideRankingsOpenings: boolean;
  setHideRankingsOpenings: Dispatch<SetStateAction<boolean>>;
  showChessComRankings: boolean;
  setShowChessComRankings: Dispatch<SetStateAction<boolean>>;
  profileRatingSlots: ProfileRatingSlotPreferences;
  setProfileRatingSlots: Dispatch<SetStateAction<ProfileRatingSlotPreferences>>;
  showProfileActionButtons: boolean;
  setShowProfileActionButtons: Dispatch<SetStateAction<boolean>>;
  hiddenRatingGraphModes: string[];
  setHiddenRatingGraphModes: Dispatch<SetStateAction<string[]>>;
  ratingGraphDots: "auto" | "show" | "hide";
  setRatingGraphDots: Dispatch<SetStateAction<"auto" | "show" | "hide">>;
  ratingGraphFrequency: "weekly" | "monthly";
  setRatingGraphFrequency: Dispatch<SetStateAction<"weekly" | "monthly">>;
  showRatingGraphLines: boolean;
  setShowRatingGraphLines: Dispatch<SetStateAction<boolean>>;
  showPuzzleTimer: boolean;
  setShowPuzzleTimer: Dispatch<SetStateAction<boolean>>;
  puzzleAnalysisTarget: "atomic-puzzles" | "lichess";
  setPuzzleAnalysisTarget: Dispatch<SetStateAction<"atomic-puzzles" | "lichess">>;
  lichessLinkTarget: "atomic-puzzles" | "lichess";
  setLichessLinkTarget: Dispatch<SetStateAction<"atomic-puzzles" | "lichess">>;
  gameExplorerOnLeft: boolean;
  setGameExplorerOnLeft: Dispatch<SetStateAction<boolean>>;
  localAnalysisEngine: LocalAnalysisEngine;
  setLocalAnalysisEngine: Dispatch<SetStateAction<LocalAnalysisEngine>>;
  showCoinBalance: boolean;
  setShowCoinBalance: Dispatch<SetStateAction<boolean>>;
  showCoinChangePopups: boolean;
  setShowCoinChangePopups: Dispatch<SetStateAction<boolean>>;
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

const isValidPieceSet = (value: unknown): value is string =>
  typeof value === "string" && LICHESS_PIECE_SETS.some((entry) => entry.value === value);
const isValidBoardTheme = (value: unknown): value is string =>
  typeof value === "string" && LICHESS_BOARD_THEMES.some((entry) => entry.value === value);
const isValidHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#([0-9a-f]{6})$/i.test(value);
const isImageBoardTheme = (value: string): boolean => IMAGE_BOARD_THEMES.includes(value);
const siteAppearanceSchema = z.object({
  theme: z.enum(THEMES),
  colorMode: z.enum(COLOR_MODES),
});
type SiteAppearance = z.infer<typeof siteAppearanceSchema>;

const loadLegacySiteAppearance = (): SiteAppearance => {
  const legacy = readPersistedState(
    "atomic-puzzles.theme",
    z.enum([...COLOR_MODES, ...GEMSTONE_THEMES]),
  );
  return {
    theme: !legacy || legacy === "dark" || legacy === "light" ? DEFAULT_THEME : legacy,
    colorMode: legacy === "light" ? "light" : DEFAULT_COLOR_MODE,
  };
};

// Keep the old record keys for Default and for the original dark gemstone appearance.
const boardProfileSchema = z.enum([
  ...COLOR_MODES,
  ...GEMSTONE_THEMES,
  ...GEMSTONE_THEMES.map((theme) => `${theme}-light` as const),
]);
type BoardProfile = z.infer<typeof boardProfileSchema>;
const getBoardProfile = (theme: Theme, mode: ColorMode): BoardProfile =>
  theme === "default" ? mode : mode === "light" ? `${theme}-light` : theme;
const hexColorSchema = z.string().refine(isValidHexColor);
const boardAppearanceSchema = z.object({
  pieceSet: z.string().refine(isValidPieceSet),
  boardTheme: z.string().refine(isValidBoardTheme),
  customLightSquare: hexColorSchema,
  customDarkSquare: hexColorSchema,
  boardColorOverrideTheme: z.string(),
  boardOverrideLightSquare: hexColorSchema,
  boardOverrideDarkSquare: hexColorSchema,
});
// Older installs have a saved record that only contains the original three themes.
const boardAppearanceByThemeSchema = z.partialRecord(boardProfileSchema, boardAppearanceSchema);
type BoardAppearance = z.infer<typeof boardAppearanceSchema>;
type BoardAppearanceByTheme = z.infer<typeof boardAppearanceByThemeSchema>;

const getDefaultBoardAppearance = (profile: BoardProfile): BoardAppearance => {
  const theme =
    GEMSTONE_THEMES.find((gem) => profile === gem || profile === `${gem}-light`) ?? DEFAULT_THEME;
  return {
    pieceSet: DEFAULT_PIECE_SET,
    boardTheme: getDefaultBoardTheme(theme),
    customLightSquare: DEFAULT_CUSTOM_LIGHT_SQUARE,
    customDarkSquare: DEFAULT_CUSTOM_DARK_SQUARE,
    boardColorOverrideTheme: "",
    boardOverrideLightSquare: DEFAULT_CUSTOM_LIGHT_SQUARE,
    boardOverrideDarkSquare: DEFAULT_CUSTOM_DARK_SQUARE,
  };
};

const loadLegacyBoardAppearances = (): BoardAppearanceByTheme => {
  const schemas = boardAppearanceSchema.shape;
  const legacy = {
    pieceSet: readPersistedState("atomic-puzzles.piece-set", schemas.pieceSet),
    boardTheme: readPersistedState("atomic-puzzles.board-theme", schemas.boardTheme),
    customLightSquare: readPersistedState("atomic-puzzles.custom-light-square", hexColorSchema),
    customDarkSquare: readPersistedState("atomic-puzzles.custom-dark-square", hexColorSchema),
    boardColorOverrideTheme: readPersistedState(
      "atomic-puzzles.board-color-override-theme",
      schemas.boardColorOverrideTheme,
    ),
    boardOverrideLightSquare: readPersistedState(
      "atomic-puzzles.board-override-light-square",
      hexColorSchema,
    ),
    boardOverrideDarkSquare: readPersistedState(
      "atomic-puzzles.board-override-dark-square",
      hexColorSchema,
    ),
  };
  // Use the previous shared appearance as each mode's starting point.
  const stored = Object.fromEntries(
    Object.entries(legacy).filter(([, value]) => value !== undefined),
  );
  return {
    dark: { ...getDefaultBoardAppearance("dark"), ...stored },
    light: { ...getDefaultBoardAppearance("light"), ...stored },
    amethyst: { ...getDefaultBoardAppearance("amethyst"), ...stored },
  };
};

const useBoardAppearance = (profile: BoardProfile) => {
  const [appearances, setAppearances] = usePersistedState(
    STORAGE_KEYS.boardAppearanceByTheme,
    boardAppearanceByThemeSchema,
    loadLegacyBoardAppearances,
  );
  const appearance = useMemo(
    () => appearances[profile] ?? getDefaultBoardAppearance(profile),
    [appearances, profile],
  );
  const actions = useMemo(() => {
    const setter =
      <K extends keyof BoardAppearance>(field: K): Dispatch<SetStateAction<BoardAppearance[K]>> =>
      (next) => {
        setAppearances((current) => {
          const active = current[profile] ?? getDefaultBoardAppearance(profile);
          return {
            ...current,
            [profile]: {
              ...active,
              [field]: typeof next === "function" ? next(active[field]) : next,
            },
          };
        });
      };
    return {
      setters: {
        setPieceSet: setter("pieceSet"),
        setBoardTheme: setter("boardTheme"),
        setCustomLightSquare: setter("customLightSquare"),
        setCustomDarkSquare: setter("customDarkSquare"),
        setBoardColorOverrideTheme: setter("boardColorOverrideTheme"),
        setBoardOverrideLightSquare: setter("boardOverrideLightSquare"),
        setBoardOverrideDarkSquare: setter("boardOverrideDarkSquare"),
      },
      resetBoardAppearance: () => {
        setAppearances((current) => ({
          ...current,
          [profile]: getDefaultBoardAppearance(profile),
        }));
      },
    };
  }, [setAppearances, profile]);
  return [appearance, actions] as const;
};

const boardSoundSetSchema = z.custom<BoardSoundSet>(isBoardSoundSet);
const profileRatingSlotSchema = z.enum([
  "auto",
  "blitz",
  "bullet",
  "hyperbullet",
  "rapid",
  "wolfrandom",
  "atomic960",
]);
const profileRatingSlotsSchema = z.tuple([
  profileRatingSlotSchema,
  profileRatingSlotSchema,
  profileRatingSlotSchema,
  profileRatingSlotSchema,
]);

export const getBoardThemeColors = (
  boardTheme: string,
  customLightSquare = DEFAULT_CUSTOM_LIGHT_SQUARE,
  customDarkSquare = DEFAULT_CUSTOM_DARK_SQUARE,
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
  const [{ theme, colorMode }, setSiteAppearance] = usePersistedState(
    STORAGE_KEYS.siteAppearance,
    siteAppearanceSchema,
    loadLegacySiteAppearance,
  );
  const setTheme = useCallback(
    (theme: Theme) => setSiteAppearance((current) => ({ ...current, theme })),
    [setSiteAppearance],
  );
  const setColorMode = useCallback(
    (colorMode: ColorMode) => setSiteAppearance((current) => ({ ...current, colorMode })),
    [setSiteAppearance],
  );
  const [boardAppearance, { resetBoardAppearance, setters: boardAppearanceSetters }] =
    useBoardAppearance(getBoardProfile(theme, colorMode));
  const [showBoardCoordinates, setShowBoardCoordinates] = usePersistedState(
    STORAGE_KEYS.showBoardCoordinates,
    z.boolean(),
    false,
  );
  const [enableBoardPremoves, setEnableBoardPremoves] = usePersistedState(
    STORAGE_KEYS.enableBoardPremoves,
    z.boolean(),
    true,
  );
  const [boardSoundsEnabled, setBoardSoundsEnabled] = usePersistedState(
    STORAGE_KEYS.boardSoundsEnabled,
    z.boolean(),
    false,
  );
  const [boardSoundSet, setBoardSoundSet] = usePersistedState<BoardSoundSet>(
    STORAGE_KEYS.boardSoundSet,
    boardSoundSetSchema,
    DEFAULT_BOARD_SOUND_SET,
  );
  const [hideRankingsOpenings, setHideRankingsOpenings] = usePersistedState(
    STORAGE_KEYS.hideRankingsOpenings,
    z.boolean(),
    false,
  );
  const [showChessComRankings, setShowChessComRankings] = usePersistedState(
    STORAGE_KEYS.showChessComRankings,
    z.boolean(),
    false,
  );
  const [profileRatingSlots, setProfileRatingSlots] =
    usePersistedState<ProfileRatingSlotPreferences>(
      STORAGE_KEYS.profileRatingSlots,
      profileRatingSlotsSchema,
      defaultProfileRatingSlotPreferences,
    );
  const [showProfileActionButtons, setShowProfileActionButtons] = usePersistedState(
    STORAGE_KEYS.showProfileActionButtons,
    z.boolean(),
    true,
  );
  const [showPuzzleTimer, setShowPuzzleTimer] = usePersistedState(
    STORAGE_KEYS.showPuzzleTimer,
    z.boolean(),
    true,
  );
  const [puzzleAnalysisTarget, setPuzzleAnalysisTarget] = usePersistedState<
    "atomic-puzzles" | "lichess"
  >(STORAGE_KEYS.puzzleAnalysisTarget, z.enum(["atomic-puzzles", "lichess"]), "atomic-puzzles");
  const [lichessLinkTarget, setLichessLinkTarget] = usePersistedState<"atomic-puzzles" | "lichess">(
    STORAGE_KEYS.lichessLinkTarget,
    z.enum(["atomic-puzzles", "lichess"]),
    "lichess",
  );
  const [gameExplorerOnLeft, setGameExplorerOnLeft] = usePersistedState(
    STORAGE_KEYS.gameExplorerOnLeft,
    z.boolean(),
    false,
  );
  const [localAnalysisEngine, setLocalAnalysisEngine] = usePersistedState<LocalAnalysisEngine>(
    STORAGE_KEYS.localAnalysisEngine,
    z.enum(["atomic-stockfish", "fairy-stockfish-14"]),
    DEFAULT_LOCAL_ANALYSIS_ENGINE,
  );
  const previousLocalAnalysisEngineRef = useRef(localAnalysisEngine);
  const [showCoinBalance, setShowCoinBalance] = usePersistedState(
    STORAGE_KEYS.showCoinBalance,
    z.boolean(),
    true,
  );
  const [showCoinChangePopups, setShowCoinChangePopups] = usePersistedState(
    STORAGE_KEYS.showCoinChangePopups,
    z.boolean(),
    true,
  );

  const [ratingGraphDots, setRatingGraphDots] = usePersistedState<"auto" | "show" | "hide">(
    "profile.ratingGraph.dots",
    z.enum(["auto", "show", "hide"]),
    "auto",
  );

  const [ratingGraphFrequency, setRatingGraphFrequency] = usePersistedState<"weekly" | "monthly">(
    "profile.ratingGraph.frequency",
    z.enum(["weekly", "monthly"]),
    "weekly",
  );

  const [showRatingGraphLines, setShowRatingGraphLines] = usePersistedState(
    STORAGE_KEYS.showRatingGraphLines,
    z.boolean(),
    true,
  );

  const [hiddenRatingGraphModes, setHiddenRatingGraphModes] = usePersistedState<string[]>(
    STORAGE_KEYS.hiddenRatingGraphModes,
    z.array(z.enum(["blitz", "hyperbullet", "bullet", "rapid", "atomic960"])),
    [],
  );

  const resetDisplaySettings = useCallback(() => {
    resetBoardAppearance();
    setShowBoardCoordinates(false);
    setEnableBoardPremoves(true);
    setBoardSoundsEnabled(false);
    setBoardSoundSet(DEFAULT_BOARD_SOUND_SET);
  }, [
    resetBoardAppearance,
    setShowBoardCoordinates,
    setEnableBoardPremoves,
    setBoardSoundsEnabled,
    setBoardSoundSet,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const { dataset } = document.documentElement;
    dataset["theme"] = colorMode;
    dataset["palette"] = theme;
    document.documentElement.toggleAttribute("data-gemstone-theme", theme !== "default");
  }, [theme, colorMode]);

  useEffect(() => {
    if (previousLocalAnalysisEngineRef.current === localAnalysisEngine) return;
    previousLocalAnalysisEngineRef.current = localAnalysisEngine;
    void import("../lib/practice/fairyStockfish").then(({ disposeInactiveLocalAnalysisEngine }) =>
      disposeInactiveLocalAnalysisEngine(localAnalysisEngine),
    );
  }, [localAnalysisEngine]);

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      theme,
      setTheme,
      colorMode,
      setColorMode,
      ...boardAppearance,
      ...boardAppearanceSetters,
      pieceSets: LICHESS_PIECE_SETS,
      boardThemes: LICHESS_BOARD_THEMES,
      showBoardCoordinates,
      setShowBoardCoordinates,
      enableBoardPremoves,
      setEnableBoardPremoves,
      boardSoundsEnabled,
      setBoardSoundsEnabled,
      boardSoundSet,
      setBoardSoundSet,
      boardSoundSets: BOARD_SOUND_SETS,
      resetDisplaySettings,
      hideRankingsOpenings,
      setHideRankingsOpenings,
      showChessComRankings,
      setShowChessComRankings,
      profileRatingSlots,
      setProfileRatingSlots,
      showProfileActionButtons,
      setShowProfileActionButtons,
      hiddenRatingGraphModes,
      setHiddenRatingGraphModes,
      ratingGraphDots,
      setRatingGraphDots,
      ratingGraphFrequency,
      setRatingGraphFrequency,
      showRatingGraphLines,
      setShowRatingGraphLines,
      showPuzzleTimer,
      setShowPuzzleTimer,
      puzzleAnalysisTarget,
      setPuzzleAnalysisTarget,
      lichessLinkTarget,
      setLichessLinkTarget,
      gameExplorerOnLeft,
      setGameExplorerOnLeft,
      localAnalysisEngine,
      setLocalAnalysisEngine,
      showCoinBalance,
      setShowCoinBalance,
      showCoinChangePopups,
      setShowCoinChangePopups,
    }),
    [
      theme,
      setTheme,
      colorMode,
      setColorMode,
      boardAppearance,
      boardAppearanceSetters,
      showBoardCoordinates,
      setShowBoardCoordinates,
      enableBoardPremoves,
      setEnableBoardPremoves,
      boardSoundsEnabled,
      setBoardSoundsEnabled,
      boardSoundSet,
      setBoardSoundSet,
      resetDisplaySettings,
      hideRankingsOpenings,
      setHideRankingsOpenings,
      showChessComRankings,
      setShowChessComRankings,
      profileRatingSlots,
      setProfileRatingSlots,
      showProfileActionButtons,
      setShowProfileActionButtons,
      hiddenRatingGraphModes,
      setHiddenRatingGraphModes,
      ratingGraphDots,
      setRatingGraphDots,
      ratingGraphFrequency,
      setRatingGraphFrequency,
      showRatingGraphLines,
      setShowRatingGraphLines,
      showPuzzleTimer,
      setShowPuzzleTimer,
      puzzleAnalysisTarget,
      setPuzzleAnalysisTarget,
      lichessLinkTarget,
      setLichessLinkTarget,
      gameExplorerOnLeft,
      setGameExplorerOnLeft,
      localAnalysisEngine,
      setLocalAnalysisEngine,
      showCoinBalance,
      setShowCoinBalance,
      showCoinChangePopups,
      setShowCoinChangePopups,
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
