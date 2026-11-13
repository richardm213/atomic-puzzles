import { useCallback, useEffect, useRef, useState } from "react";

import type { PracticeSide } from "./usePracticeSettings";

type ClockState = {
  remaining: Record<PracticeSide, number>;
  expired: PracticeSide | null;
  generation: number;
};
const initialClocks = (minutes: number, generation = 0): ClockState => ({
  remaining: { white: minutes * 60_000, black: minutes * 60_000 },
  expired: minutes <= 0 ? "white" : null,
  generation,
});

export const usePracticeClocks = (
  minutes: number,
  incrementSeconds: number,
  runningSide: PracticeSide | null,
) => {
  const [state, setState] = useState(() => initialClocks(minutes));
  const clock = useRef(state);
  const publish = useCallback(() => {
    const next = clock.current;
    setState((previous) =>
      previous.expired === next.expired &&
      Math.ceil(previous.remaining.white / 1000) === Math.ceil(next.remaining.white / 1000) &&
      Math.ceil(previous.remaining.black / 1000) === Math.ceil(next.remaining.black / 1000)
        ? previous
        : next,
    );
  }, []);
  const reset = useCallback(
    (nextMinutes = minutes) => {
      clock.current = initialClocks(nextMinutes, clock.current.generation + 1);
      setState(clock.current);
    },
    [minutes],
  );
  const addIncrement = useCallback(
    (side: PracticeSide) => {
      if (clock.current.expired) return;
      clock.current = {
        ...clock.current,
        remaining: {
          ...clock.current.remaining,
          [side]: clock.current.remaining[side] + incrementSeconds * 1000,
        },
      };
      publish();
    },
    [incrementSeconds, publish],
  );

  useEffect(() => {
    if (!runningSide || state.expired) return;
    const epoch = clock.current.generation;
    let lastTick = performance.now();
    const tick = () => {
      if (epoch !== clock.current.generation) return;
      const now = performance.now();
      const remaining = Math.max(0, clock.current.remaining[runningSide] - (now - lastTick));
      lastTick = now;
      clock.current = {
        ...clock.current,
        remaining: { ...clock.current.remaining, [runningSide]: remaining },
        expired: remaining === 0 ? runningSide : null,
      };
      publish();
    };
    const timer = window.setInterval(tick, 250);
    return () => {
      tick();
      window.clearInterval(timer);
    };
  }, [publish, runningSide, state.expired, state.generation]);

  return { ...state, reset, addIncrement };
};
