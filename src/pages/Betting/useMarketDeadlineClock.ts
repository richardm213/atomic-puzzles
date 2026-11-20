import { useEffect, useState } from "react";

type MarketDeadline = {
  status: string;
  closesAt: string | null;
};

export const useMarketDeadlineClock = (markets: MarketDeadline[]): number => {
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const now = Date.now();
    let nextDeadline = Infinity;
    for (const market of markets) {
      if (market.status !== "open" || !market.closesAt) continue;
      const deadline = Date.parse(market.closesAt);
      if (deadline > now && deadline < nextDeadline) nextDeadline = deadline;
    }
    if (!Number.isFinite(nextDeadline)) return;
    const timeout = window.setTimeout(
      () => setCurrentTime(Date.now()),
      Math.min(nextDeadline - now + 250, 2_147_483_647),
    );
    return () => window.clearTimeout(timeout);
  }, [markets, currentTime]);

  return Math.max(currentTime, Date.now());
};
