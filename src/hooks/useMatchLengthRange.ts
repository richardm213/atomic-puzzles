import { useCallback, useEffect, useMemo, useState } from "react";

import {
  defaultMatchLengthMax,
  defaultMatchLengthMin,
  defaultMode,
  type MatchLengthBounds,
  matchLengthBoundsByMode,
  type Mode,
} from "../constants/matches";

const resolveBounds = (mode: Mode): MatchLengthBounds =>
  matchLengthBoundsByMode[mode] ?? matchLengthBoundsByMode[defaultMode];

export const toBoundedLengthRange = (mode: Mode): MatchLengthBounds => {
  const bounds = resolveBounds(mode);

  return {
    min: Math.max(defaultMatchLengthMin, bounds.min),
    max: Math.min(defaultMatchLengthMax, bounds.max),
  };
};

export const useMatchLengthRange = (
  mode: Mode,
): {
  bounds: MatchLengthBounds;
  matchLengthMin: number;
  setMatchLengthMin: (value: number) => void;
  matchLengthMax: number;
  setMatchLengthMax: (value: number) => void;
} => {
  const bounds = useMemo(() => resolveBounds(mode), [mode]);
  const [range, setRange] = useState<MatchLengthBounds>(() => toBoundedLengthRange(mode));

  useEffect(() => {
    setRange(toBoundedLengthRange(mode));
  }, [mode]);

  const setMatchLengthMin = useCallback(
    (matchLengthMin: number) => setRange((current) => ({ ...current, min: matchLengthMin })),
    [],
  );
  const setMatchLengthMax = useCallback(
    (matchLengthMax: number) => setRange((current) => ({ ...current, max: matchLengthMax })),
    [],
  );

  return {
    bounds,
    matchLengthMin: range.min,
    setMatchLengthMin,
    matchLengthMax: range.max,
    setMatchLengthMax,
  };
};
