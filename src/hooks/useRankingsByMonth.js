import { useEffect, useState } from "react";
import { loadRankingsForMonth } from "../lib/rankings/rankingsByMonth";

export const useRankingsByMonth = (selectedMonth) => {
  const [rankingsByMonth, setRankingsByMonth] = useState(new Map());
  const [error, setError] = useState("");
  const cachedMonth = selectedMonth ? rankingsByMonth.get(selectedMonth) : null;

  useEffect(() => {
    if (!selectedMonth || cachedMonth) return;

    let isCurrent = true;

    const loadRankings = async () => {
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
        setError(loadError.message || "Failed to load leaderboard data");
      }
    };

    loadRankings();

    return () => {
      isCurrent = false;
    };
  }, [cachedMonth, selectedMonth]);

  return {
    rankingsByMonth,
    error,
  };
};
