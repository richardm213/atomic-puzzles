import { parseTimeControlParts } from "./matchTransforms";

type MatchTimeControlInput = { timeControl?: string | null | undefined };

export const getTimeControlOptions = (
  matches: MatchTimeControlInput[] | null | undefined,
): { initialOptions: string[]; incrementOptions: string[] } => {
  const initialSet = new Set<string>();
  const incrementSet = new Set<string>();

  (Array.isArray(matches) ? matches : []).forEach((match) => {
    const { initial, increment } = parseTimeControlParts(match?.timeControl);
    if (initial) initialSet.add(initial);
    if (increment) incrementSet.add(increment);
  });

  const numericSort = (a: string, b: string): number => Number(a) - Number(b);

  return {
    initialOptions: [...initialSet].sort(numericSort),
    incrementOptions: [...incrementSet].sort(numericSort),
  };
};
