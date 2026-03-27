import { useEffect, useState } from "react";
import { loadRankingsForMonth } from "../lib/rankingsData";

export const useRankingsByMonth = (selectedMonth) => {
  const [rankingsByMonth, setRankingsByMonth] = useState(new Map());
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedMonth) return;
    if (rankingsByMonth.has(selectedMonth)) return;

    let ignore = false;

    const loadRankings = async () => {
      try {
        setError("");
        const monthData = await loadRankingsForMonth(selectedMonth);
        if (ignore) return;

        setRankingsByMonth((previous) => {
          const next = new Map(previous);
          next.set(selectedMonth, monthData);
          return next;
        });
      } catch (loadError) {
        if (ignore) return;
        setError(loadError.message || "Failed to load leaderboard data");
      }
    };

    loadRankings();

    return () => {
      ignore = true;
    };
  }, [selectedMonth, rankingsByMonth]);

  return {
    rankingsByMonth,
    error,
  };
};
