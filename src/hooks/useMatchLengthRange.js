import { useEffect, useMemo, useState } from "react";
import {
  defaultMode,
  defaultMatchLengthMax,
  defaultMatchLengthMin,
  matchLengthBoundsByMode,
} from "../constants/matches";

const resolveBounds = (mode) =>
  matchLengthBoundsByMode[mode] ?? matchLengthBoundsByMode[defaultMode];

export const toBoundedLengthRange = (mode) => {
  const bounds = resolveBounds(mode);

  return {
    min: Math.max(defaultMatchLengthMin, bounds.min),
    max: Math.min(defaultMatchLengthMax, bounds.max),
  };
};

export const useMatchLengthRange = (mode) => {
  const bounds = useMemo(() => resolveBounds(mode), [mode]);
  const [range, setRange] = useState(() => toBoundedLengthRange(mode));

  useEffect(() => {
    setRange(toBoundedLengthRange(mode));
  }, [mode]);

  return {
    bounds,
    matchLengthMin: range.min,
    setMatchLengthMin: (matchLengthMin) =>
      setRange((current) => ({ ...current, min: matchLengthMin })),
    matchLengthMax: range.max,
    setMatchLengthMax: (matchLengthMax) =>
      setRange((current) => ({ ...current, max: matchLengthMax })),
  };
};
