import { type Mode, modeOptions } from "../../constants/matches";
import type { RatingDisplayByMode } from "../../hooks/usePlayerProfileData";

const standardModes = ["blitz", "bullet", "hyperbullet"] as const satisfies readonly Mode[];
const replacementModes = ["rapid", "wolfrandom", "atomic960"] as const satisfies readonly Mode[];

export type OptionalProfileRatingVisibility = Partial<
  Record<(typeof replacementModes)[number], boolean>
>;

/**
 * Keep the three standard rating rows unless a higher-volume optional pool earns
 * one of their slots. The strongest optional pool gets first choice, which also
 * makes the result deterministic when only one standard pool can be displaced.
 */
export const getVisibleProfileRatingModes = (
  ratings: RatingDisplayByMode,
  optionalVisibility: OptionalProfileRatingVisibility,
): Mode[] => {
  const visible = new Set<Mode>(standardModes);
  const replaceable = [...standardModes].sort(
    (a, b) =>
      ratings[a].gamesPlayed - ratings[b].gamesPlayed ||
      standardModes.indexOf(a) - standardModes.indexOf(b),
  );

  [...replacementModes]
    .sort(
      (a, b) =>
        ratings[b].gamesPlayed - ratings[a].gamesPlayed ||
        replacementModes.indexOf(a) - replacementModes.indexOf(b),
    )
    .forEach((mode) => {
      const standardMode = replaceable[0];
      if (!standardMode || ratings[mode].gamesPlayed <= ratings[standardMode].gamesPlayed) return;
      visible.delete(standardMode);
      visible.add(mode);
      replaceable.shift();
    });

  replacementModes.forEach((mode) => {
    if (optionalVisibility[mode] && ratings[mode].gamesPlayed > 0) visible.add(mode);
  });

  return modeOptions.filter((mode) => visible.has(mode));
};
