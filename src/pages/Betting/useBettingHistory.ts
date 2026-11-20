import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { allPredictionPositionsQueryOptions } from "../../lib/betting/bettingQueries";
import type {
  PredictionMarketGroup,
  PredictionMarketState,
} from "../../lib/predictionMarkets/predictionMarkets";
import { buildBetHistory } from "./bettingHistoryModel";

export const useBettingHistory = ({
  showingHistory,
  isAuthenticated,
  username,
  catalog,
  markets,
  predictionMarketGroups,
  predictionMarketStates,
}: {
  showingHistory: boolean;
  isAuthenticated: boolean;
  username: string;
  catalog: { isPending: boolean; error: Error | null };
  markets: { isPending: boolean; isError: boolean; error: Error | null };
  predictionMarketGroups: PredictionMarketGroup[];
  predictionMarketStates: PredictionMarketState[];
}) => {
  const predictionPositionsQuery = useQuery({
    ...allPredictionPositionsQueryOptions(),
    enabled: showingHistory,
  });
  const historyLoading =
    showingHistory &&
    (catalog.isPending || predictionPositionsQuery.isPending || markets.isPending);
  const historyError = catalog.error ?? predictionPositionsQuery.error ?? markets.error;
  const allHistoryBets = useMemo(() => {
    if (!showingHistory || historyLoading || markets.isError) return [];
    return buildBetHistory({
      predictionPositions: predictionPositionsQuery.data ?? [],
      predictionMarketGroups,
      predictionMarketStates,
    });
  }, [
    historyLoading,
    predictionMarketGroups,
    markets.isError,
    predictionMarketStates,
    predictionPositionsQuery.data,
    showingHistory,
  ]);
  const pendingBetCount = useMemo(
    () => allHistoryBets.filter((bet) => bet.status === "open").length,
    [allHistoryBets],
  );
  const myBets = useMemo(
    () =>
      isAuthenticated
        ? allHistoryBets.filter((bet) => bet.username.toLowerCase() === username.toLowerCase())
        : [],
    [allHistoryBets, isAuthenticated, username],
  );
  const myPendingBetCount = myBets.filter((bet) => bet.status === "open").length;
  return {
    historyLoading,
    historyError,
    allHistoryBets,
    pendingBetCount,
    myBets,
    myPendingBetCount,
  };
};
