import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  patchPredictionMarketState,
  predictionMarketBatchQueryKey,
  predictionMarketQueryKey,
} from "./predictionMarketQueries";
import type { PredictionMarketState } from "./predictionMarkets";

const state = (id: string, exchangeVolumeCoins: number) =>
  ({
    market: { id, exchangeVolumeCoins },
    book: { yes: { bids: [], asks: [] }, no: { bids: [], asks: [] } },
    fills: [],
    positions: [],
    orders: [],
  }) as unknown as PredictionMarketState;

describe("patchPredictionMarketState", () => {
  it("patches only the changed market in active market caches", () => {
    const queryClient = new QueryClient();
    const marketA = state("market-a", 1);
    const marketB = state("market-b", 2);
    const updatedMarketA = state("market-a", 3);
    const batchKey = predictionMarketBatchQueryKey(["market-a", "market-b"]);
    queryClient.setQueryData(batchKey, [marketA, marketB]);

    patchPredictionMarketState(queryClient, updatedMarketA);

    expect(queryClient.getQueryData(batchKey)).toEqual([updatedMarketA, marketB]);
    expect(queryClient.getQueryData(predictionMarketQueryKey("market-a"))).toEqual(updatedMarketA);
  });
});
