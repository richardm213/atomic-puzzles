import { parseTimeControlParts } from "./matchTransforms";

export const getTimeControlOptions = (matches) => {
  const initialSet = new Set();
  const incrementSet = new Set();

  (Array.isArray(matches) ? matches : []).forEach((match) => {
    const { initial, increment } = parseTimeControlParts(match?.timeControl);
    if (initial) initialSet.add(initial);
    if (increment) incrementSet.add(increment);
  });

  const numericSort = (a, b) => Number(a) - Number(b);

  return {
    initialOptions: [...initialSet].sort(numericSort),
    incrementOptions: [...incrementSet].sort(numericSort),
  };
};
