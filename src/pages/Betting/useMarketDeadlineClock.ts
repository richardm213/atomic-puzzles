import { useEffect, useState } from "react";

type MarketDeadline = {
  status: string;
  closesAt: string | null;
};

export const useMarketDeadlineClock = (markets: MarketDeadline[]): number => {
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const nextDeadline = markets
      .filter((market) => market.status === "open" && market.closesAt)
      .map((market) => Date.parse(market.closesAt ?? ""))
      .filter((deadline) => Number.isFinite(deadline) && deadline > Date.now())
      .sort((left, right) => left - right)[0];
    if (!nextDeadline) return;

    const timeout = window.setTimeout(
      () => setCurrentTime(Date.now()),
      Math.min(nextDeadline - Date.now() + 250, 2_147_483_647),
    );
    return () => window.clearTimeout(timeout);
  }, [markets]);

  return currentTime;
};
