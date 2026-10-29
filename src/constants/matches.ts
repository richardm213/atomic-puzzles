export const modeOptions = ["blitz", "bullet", "hyperbullet", "wolfrandom", "atomic960"] as const;
export type Mode = (typeof modeOptions)[number];

// Atomic960 support ships before its historical archive is ready. Keep every
// parser and data boundary aware of the mode, while public selectors remain
// gated until the refreshed archive has been uploaded and verified.
export const atomic960Enabled = import.meta.env.VITE_ENABLE_ATOMIC960 === "true";
export const publicModeOptions: readonly Mode[] = atomic960Enabled
  ? modeOptions
  : modeOptions.filter((mode) => mode !== "atomic960");

export const isMode = (value: unknown): value is Mode =>
  typeof value === "string" && modeOptions.some((mode) => mode === value);

export const isPublicMode = (value: unknown): value is Mode =>
  isMode(value) && publicModeOptions.includes(value);

export const defaultMode: Mode = modeOptions[0];

export const modeLabels: Record<Mode, string> = {
  blitz: "Blitz",
  bullet: "Bullet",
  hyperbullet: "Hyper",
  wolfrandom: "Wolfrandom",
  atomic960: "Atomic960",
};

export const modeDescriptions: Record<Mode, string> = {
  blitz: "",
  bullet: "",
  hyperbullet: "",
  wolfrandom: "",
  atomic960: "",
};

export type RankingEligibility = {
  minGames: number;
  maxRd: number | null;
};

export const rankingEligibilityByMode: Record<Mode, RankingEligibility> = {
  blitz: {
    minGames: 15,
    maxRd: 60,
  },
  bullet: {
    minGames: 25,
    maxRd: 60,
  },
  hyperbullet: {
    minGames: 25,
    maxRd: 60,
  },
  wolfrandom: {
    minGames: 10,
    maxRd: 80,
  },
  atomic960: {
    minGames: 5,
    maxRd: 75,
  },
};

export const yearlyRankingEligibilityByMode: Partial<Record<Mode, number>> = {
  blitz: 150,
  bullet: 250,
  hyperbullet: 350,
};

export const createModeRecord = <T>(valueFactory: (mode: Mode) => T): Record<Mode, T> =>
  Object.fromEntries(modeOptions.map((mode) => [mode, valueFactory(mode)])) as Record<Mode, T>;

export const pageSizeOptions = [25, 50, 100, 200] as const;

export type SourceFilters = {
  arena: boolean;
  friend: boolean;
  lobby: boolean;
  swiss: boolean;
  chesscom: boolean;
  pychess: boolean;
  unknown: boolean;
};
export const defaultSourceFilters: SourceFilters = {
  arena: true,
  friend: true,
  lobby: true,
  swiss: true,
  chesscom: true,
  pychess: true,
  unknown: true,
};
export const knownSourceKeys = Object.keys(defaultSourceFilters) as Array<keyof SourceFilters>;

export const opponentRatingSliderMin = 1000;
export const opponentRatingSliderMax = 2500;
export const defaultRatingMin = 1000;
export const defaultRatingMax = 2500;

export const isMatchLengthWithinBounds = (
  gameCount: number,
  min: number,
  max: number,
  boundsMax: number,
): boolean => {
  if (gameCount < min) return false;
  if (max >= boundsMax) return true;
  return gameCount <= max;
};
