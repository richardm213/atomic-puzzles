export const modeOptions = ["blitz", "bullet"];

export const pageSizeOptions = [25, 50, 100, 200];
export const defaultSourceFilters = { arena: true, friend: true, lobby: true };
export const knownSourceKeys = Object.keys(defaultSourceFilters);

export const opponentRatingSliderMin = 1000;
export const opponentRatingSliderMax = 2500;
export const defaultRatingMin = 1000;
export const defaultRatingMax = 2500;

export const defaultMatchLengthMin = 1;
export const defaultMatchLengthMax = 50;

export const matchLengthBoundsByMode = {
  blitz: { min: 1, max: 50 },
  bullet: { min: 1, max: 50 },
};

export const isMatchLengthWithinBounds = (gameCount, min, max, boundsMax) => {
  if (gameCount < min) return false;
  if (max >= boundsMax) return true;
  return gameCount <= max;
};
