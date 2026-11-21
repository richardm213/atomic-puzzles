import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { allPredictionPositionsQueryOptions } from "../../lib/betting/bettingQueries";
import type { PredictionMarketGroup } from "../../lib/predictionMarkets/predictionMarkets";
import { buildBetHistory } from "./bettingHistoryModel";

export const useBettingHistory = (
  predictionMarketGroups: PredictionMarketGroup[],
  catalog: { isPending: boolean; error: Error | null },
  username: string | undefined,
) => {
  const { data, isPending, error } = useQuery(allPredictionPositionsQueryOptions());
  const allHistoryBets = useMemo(
    () =>
      buildBetHistory({
        predictionPositions: data?.positions ?? [],
        marketSummaries: data?.markets ?? [],
        predictionMarketGroups,
      }),
    [data, predictionMarketGroups],
  );
  const myBets = useMemo(
    () =>
      username
        ? allHistoryBets.filter((bet) => bet.username.toLowerCase() === username.toLowerCase())
        : [],
    [allHistoryBets, username],
  );
  return {
    historyLoading: catalog.isPending || isPending,
    historyError: catalog.error ?? error,
    marketSummaries: data?.markets ?? [],
    allHistoryBets,
    pendingBetCount: allHistoryBets.filter((bet) => bet.status === "open").length,
    myBets,
    myPendingBetCount: myBets.filter((bet) => bet.status === "open").length,
  };
};
