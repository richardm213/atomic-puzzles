export const modeOptions = ["blitz", "bullet", "hyperbullet"] as const;
export type Mode = (typeof modeOptions)[number];

export const defaultMode: Mode = modeOptions[0];

export const modeLabels: Record<Mode, string> = {
  blitz: "Blitz",
  bullet: "Bullet",
  hyperbullet: "Hyper",
};

export const modeDescriptions: Record<Mode, string> = {
  blitz: "",
  bullet: "",
  hyperbullet: "",
};

export type RankingEligibility = {
  minGames: number;
  maxRd: number;
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
};

export const createModeRecord = <T>(valueFactory: (mode: Mode) => T): Record<Mode, T> =>
  Object.fromEntries(modeOptions.map((mode) => [mode, valueFactory(mode)])) as Record<Mode, T>;

export const pageSizeOptions = [25, 50, 100, 200] as const;

export type SourceFilters = { arena: boolean; friend: boolean; lobby: boolean };
export const defaultSourceFilters: SourceFilters = { arena: true, friend: true, lobby: true };
export const knownSourceKeys = Object.keys(defaultSourceFilters) as Array<keyof SourceFilters>;

export const opponentRatingSliderMin = 1000;
export const opponentRatingSliderMax = 2500;
export const defaultRatingMin = 1000;
export const defaultRatingMax = 2500;

export const defaultMatchLengthMin = 1;
export const defaultMatchLengthMax = 50;

export type MatchLengthBounds = { min: number; max: number };
export const matchLengthBoundsByMode: Record<Mode, MatchLengthBounds> = createModeRecord(() => ({
  min: 1,
  max: 50,
}));

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
