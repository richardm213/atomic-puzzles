import { type Mode, modeOptions } from "../../constants/matches";
import type { RatingDisplayByMode } from "../../hooks/usePlayerProfileData";

const standardModes = ["blitz", "bullet", "hyperbullet"] as const satisfies readonly Mode[];
const replacementModes = ["rapid", "wolfrandom", "atomic960"] as const satisfies readonly Mode[];

export const automaticProfileRatingSlot = "auto" as const;
export type ProfileRatingSlotPreference = Mode | typeof automaticProfileRatingSlot;
export type ProfileRatingSlotPreferences = [
  ProfileRatingSlotPreference,
  ProfileRatingSlotPreference,
  ProfileRatingSlotPreference,
  ProfileRatingSlotPreference,
];

export const defaultProfileRatingSlotPreferences: ProfileRatingSlotPreferences = [
  automaticProfileRatingSlot,
  automaticProfileRatingSlot,
  automaticProfileRatingSlot,
  automaticProfileRatingSlot,
];

const byGamesDescending =
  (ratings: RatingDisplayByMode) =>
  (a: Mode, b: Mode): number =>
    ratings[b].gamesPlayed - ratings[a].gamesPlayed ||
    modeOptions.indexOf(a) - modeOptions.indexOf(b);

const getAutomaticProfileRatingModes = (ratings: RatingDisplayByMode): Mode[] => {
  const visible = new Set<Mode>(standardModes.filter((mode) => ratings[mode].gamesPlayed > 0));
  const replaceable = [...visible].sort(
    (a, b) =>
      ratings[a].gamesPlayed - ratings[b].gamesPlayed ||
      standardModes.indexOf(a as (typeof standardModes)[number]) -
        standardModes.indexOf(b as (typeof standardModes)[number]),
  );

  [...replacementModes].sort(byGamesDescending(ratings)).forEach((mode) => {
    if (ratings[mode].gamesPlayed <= 0) return;
    const standardMode = replaceable[0];
    if (visible.size < 3) {
      visible.add(mode);
      return;
    }
    if (!standardMode || ratings[mode].gamesPlayed <= ratings[standardMode].gamesPlayed) return;
    visible.delete(standardMode);
    visible.add(mode);
    replaceable.shift();
  });

  const firstThree = modeOptions.filter((mode) => visible.has(mode));
  const fourthMode = [...replacementModes]
    .filter((mode) => ratings[mode].gamesPlayed > 0 && !visible.has(mode))
    .sort(byGamesDescending(ratings))[0];

  return fourthMode ? [...firstThree, fourthMode] : firstThree;
};

/**
 * Resolve four customizable rating slots. Automatic slots preserve the standard
 * Blitz/Bullet/Hyper order, let higher-volume optional pools displace them, and
 * use the strongest remaining optional pool for the fourth row. Saved choices
 * that are unavailable for a player fall back to that player's available pools.
 */
export const getVisibleProfileRatingModes = (
  ratings: RatingDisplayByMode,
  slotPreferences: ProfileRatingSlotPreferences = defaultProfileRatingSlotPreferences,
): Mode[] => {
  const automaticModes = getAutomaticProfileRatingModes(ratings);
  const availableModes = modeOptions
    .filter((mode) => ratings[mode].gamesPlayed > 0)
    .sort(byGamesDescending(ratings));
  const selected = new Set<Mode>();

  return slotPreferences.flatMap((preference, slotIndex) => {
    const allowed: readonly Mode[] = slotIndex === 3 ? replacementModes : modeOptions;
    const preferredMode =
      preference !== automaticProfileRatingSlot &&
      allowed.includes(preference) &&
      ratings[preference].gamesPlayed > 0 &&
      !selected.has(preference)
        ? preference
        : null;
    const fallbackMode = [...automaticModes, ...availableModes].find(
      (mode) => allowed.includes(mode) && !selected.has(mode),
    );
    const mode = preferredMode ?? fallbackMode;
    if (!mode) return [];
    selected.add(mode);
    return [mode];
  });
};
