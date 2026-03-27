import { useEffect, useMemo, useState } from "react";
import {
  defaultMatchLengthMax,
  defaultMatchLengthMin,
  matchLengthBoundsByMode,
} from "../constants/matches";

const resolveBounds = (mode) => matchLengthBoundsByMode[mode] ?? matchLengthBoundsByMode.blitz;

export const toBoundedLengthRange = (mode) => {
  const bounds = resolveBounds(mode);

  return {
    min: Math.max(defaultMatchLengthMin, bounds.min),
    max: Math.min(defaultMatchLengthMax, bounds.max),
  };
};

export const useMatchLengthRange = (mode) => {
  const bounds = useMemo(() => resolveBounds(mode), [mode]);
  const initialRange = useMemo(() => toBoundedLengthRange(mode), [mode]);
  const [matchLengthMin, setMatchLengthMin] = useState(initialRange.min);
  const [matchLengthMax, setMatchLengthMax] = useState(initialRange.max);

  useEffect(() => {
    const nextRange = toBoundedLengthRange(mode);
    setMatchLengthMin(nextRange.min);
    setMatchLengthMax(nextRange.max);
  }, [mode]);

  return {
    bounds,
    matchLengthMin,
    setMatchLengthMin,
    matchLengthMax,
    setMatchLengthMax,
  };
};
