import { useEffect, useState } from "react";

export const useMinuteClock = (enabled: boolean): number => {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return now;
};
