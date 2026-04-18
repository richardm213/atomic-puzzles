export const modeOptions = ["blitz", "bullet", "hyperbullet"];
export const defaultMode = modeOptions[0];

export const modeLabels = {
  blitz: "Blitz",
  bullet: "Bullet",
  hyperbullet: "Hyper",
};

export const modeDescriptions = {
  blitz: "",
  bullet: "Fast tactical games where clock handling and instant patterns matter.",
  hyperbullet: "Ultra-fast games where instinct, premoves, and chaos dominate.",
};

export const createModeRecord = (valueFactory) =>
  Object.fromEntries(modeOptions.map((mode) => [mode, valueFactory(mode)]));

export const pageSizeOptions = [25, 50, 100, 200];
export const defaultSourceFilters = { arena: true, friend: true, lobby: true };
export const knownSourceKeys = Object.keys(defaultSourceFilters);

export const opponentRatingSliderMin = 1000;
export const opponentRatingSliderMax = 2500;
export const defaultRatingMin = 1000;
export const defaultRatingMax = 2500;

export const defaultMatchLengthMin = 1;
export const defaultMatchLengthMax = 50;

export const matchLengthBoundsByMode = createModeRecord(() => ({ min: 1, max: 50 }));

export const isMatchLengthWithinBounds = (gameCount, min, max, boundsMax) => {
  if (gameCount < min) return false;
  if (max >= boundsMax) return true;
  return gameCount <= max;
};
