import { useEffect, useState } from "react";

import { loadRankingsForMonth, type RankingsByMode } from "../lib/rankings/rankingsByMonth";

export const useRankingsByMonth = (
  selectedMonth: string | null | undefined,
): {
  rankingsByMonth: Map<string, RankingsByMode>;
  error: string;
} => {
  const [rankingsByMonth, setRankingsByMonth] = useState<Map<string, RankingsByMode>>(
    () => new Map(),
  );
  const [error, setError] = useState("");
  const cachedMonth = selectedMonth ? rankingsByMonth.get(selectedMonth) : null;

  useEffect(() => {
    if (!selectedMonth || cachedMonth) return;

    let isCurrent = true;

    const loadRankings = async (): Promise<void> => {
      try {
        setError("");
        const monthData = await loadRankingsForMonth(selectedMonth);
        if (!isCurrent) return;

        setRankingsByMonth((previous) => {
          const next = new Map(previous);
          next.set(selectedMonth, monthData);
          return next;
        });
      } catch (loadError) {
        if (!isCurrent) return;
        const message =
          loadError instanceof Error ? loadError.message : "Failed to load leaderboard data";
        setError(message);
      }
    };

    void loadRankings();

    return () => {
      isCurrent = false;
    };
  }, [cachedMonth, selectedMonth]);

  return {
    rankingsByMonth,
    error,
  };
};
