import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getSupabaseClient } from "../supabase/client";
import { patchPredictionMarketState, predictionMarketQueryRoot } from "./predictionMarketQueries";
import { fetchPredictionMarkets, type PredictionMarketId } from "./predictionMarkets";

type PredictionMarketUpdate = {
  market_id: string;
  change_scope: "book" | "catalog";
};

export const createCoalescedBatchRefresh = <Item>(
  refresh: (items: readonly Item[]) => Promise<void>,
) => {
  let active = false;
  let stopped = false;
  const queued = new Set<Item>();

  const drain = async () => {
    if (active || stopped) return;
    active = true;
    try {
      while (queued.size > 0 && !stopped) {
        const batch = [...queued];
        queued.clear();
        try {
          await refresh(batch);
        } catch {
          // React Query retains the request error; a later event or fallback poll retries it.
        }
      }
    } finally {
      active = false;
    }
  };

  return {
    request: (items: readonly Item[]) => {
      if (stopped) return;
      items.forEach((item) => queued.add(item));
      void drain();
    },
    stop: () => {
      stopped = true;
      queued.clear();
    },
  };
};

const refreshMarkets = async (queryClient: QueryClient, marketIds: readonly string[]) => {
  const states = await fetchPredictionMarkets(marketIds);
  states.forEach((state) => patchPredictionMarketState(queryClient, state));
};

export const usePredictionMarketRealtime = (
  queryClient: QueryClient,
  marketIds: readonly PredictionMarketId[],
) => {
  const marketIdsKey = JSON.stringify([...new Set(marketIds)].sort());

  useEffect(() => {
    const trackedMarketIds = JSON.parse(marketIdsKey) as string[];
    if (trackedMarketIds.length === 0) return;

    const trackedMarketIdSet = new Set(trackedMarketIds);
    const supabase = getSupabaseClient();
    const refresh = createCoalescedBatchRefresh((changedMarketIds: readonly string[]) =>
      refreshMarkets(queryClient, changedMarketIds),
    );
    const scheduledMarketIds = new Set<string>();
    let refreshTimer: number | undefined;

    const scheduleRefresh = (marketId: string) => {
      scheduledMarketIds.add(marketId);
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refresh.request([...scheduledMarketIds]);
        scheduledMarketIds.clear();
      }, 50);
    };
    const refreshVisibleMarkets = () => {
      if (document.visibilityState === "visible") refresh.request(trackedMarketIds);
    };

    const channel = supabase
      .channel(`prediction-markets:${marketIdsKey}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prediction_market_updates" },
        (payload) => {
          const update = payload.new as Partial<PredictionMarketUpdate>;
          if (!update.market_id || !update.change_scope) return;
          if (update.change_scope === "catalog") {
            void queryClient.invalidateQueries({
              queryKey: [...predictionMarketQueryRoot, "catalog"],
              exact: true,
            });
          }
          if (trackedMarketIdSet.has(update.market_id)) scheduleRefresh(update.market_id);
        },
      )
      .subscribe((status) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          refresh.request(trackedMarketIds);
        }
      });

    document.addEventListener("visibilitychange", refreshVisibleMarkets);
    window.addEventListener("online", refreshVisibleMarkets);

    return () => {
      window.clearTimeout(refreshTimer);
      scheduledMarketIds.clear();
      refresh.stop();
      document.removeEventListener("visibilitychange", refreshVisibleMarkets);
      window.removeEventListener("online", refreshVisibleMarkets);
      void supabase.removeChannel(channel);
    };
  }, [marketIdsKey, queryClient]);
};
