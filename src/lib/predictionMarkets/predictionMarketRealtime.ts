import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getSupabaseClient } from "../supabase/client";
import { patchPredictionMarketState, predictionMarketQueryRoot } from "./predictionMarketQueries";
import { fetchPredictionMarkets, type PredictionMarketId } from "./predictionMarkets";

type PredictionMarketUpdate = {
  market_id: string;
  change_scope: "book" | "catalog";
  version: number;
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
          // A later event or recovery check retries failed batches.
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
  refreshOnSubscribe = true,
) => {
  const marketIdsKey = JSON.stringify([...new Set(marketIds)].sort());

  useEffect(() => {
    const trackedMarketIds = JSON.parse(marketIdsKey) as string[];
    if (trackedMarketIds.length === 0) return;

    const trackedMarketIdSet = new Set(trackedMarketIds);
    const supabase = getSupabaseClient();
    const seenVersions = new Map<string, number>();
    const pendingVersions = new Map<string, number>();
    const refresh = createCoalescedBatchRefresh(async (changedMarketIds: readonly string[]) => {
      const versions = changedMarketIds.map((id) => [id, pendingVersions.get(id)] as const);
      await refreshMarkets(queryClient, changedMarketIds);
      versions.forEach(([id, version]) => {
        if (version !== undefined)
          seenVersions.set(id, Math.max(seenVersions.get(id) ?? 0, version));
      });
    });
    const scheduledMarketIds = new Set<string>();
    let refreshTimer: number | undefined;
    let checkingVersions = false;
    let stopped = false;

    const recordUpdate = (update: Partial<PredictionMarketUpdate>) => {
      if (!update.market_id || !trackedMarketIdSet.has(update.market_id)) return;
      if (typeof update.version === "number") {
        pendingVersions.set(
          update.market_id,
          Math.max(pendingVersions.get(update.market_id) ?? 0, update.version),
        );
      }
    };

    const checkVersions = async () => {
      if (stopped || checkingVersions || document.visibilityState !== "visible") return;
      checkingVersions = true;
      try {
        const { data, error } = await supabase
          .from("prediction_market_updates")
          .select("market_id,version,change_scope")
          .in("market_id", trackedMarketIds);
        if (stopped) return;
        if (error) throw error;
        const changed = (data ?? []).filter(
          (update) => seenVersions.get(update.market_id) !== update.version,
        );
        changed.forEach(recordUpdate);
        if (changed.some((update) => update.change_scope === "catalog")) {
          void queryClient.invalidateQueries({
            queryKey: [...predictionMarketQueryRoot, "catalog"],
            exact: true,
          });
        }
        if (changed.length) refresh.request(changed.map((update) => update.market_id));
      } catch {
        // Keep books fresh even when the lightweight recovery feed is unavailable.
        if (!stopped) refresh.request(trackedMarketIds);
      } finally {
        checkingVersions = false;
      }
    };

    const scheduleRefresh = (marketId: string) => {
      if (document.visibilityState !== "visible") return;
      scheduledMarketIds.add(marketId);
      // A fixed window batches bursts without postponing updates during continuous trading.
      if (refreshTimer !== undefined) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        refresh.request([...scheduledMarketIds]);
        scheduledMarketIds.clear();
      }, 16);
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
          recordUpdate(update);
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
        if (refreshOnSubscribe && status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          refresh.request(trackedMarketIds);
        }
      });

    void checkVersions();
    const versionTimer = window.setInterval(() => void checkVersions(), 2_000);
    document.addEventListener("visibilitychange", refreshVisibleMarkets);
    window.addEventListener("online", refreshVisibleMarkets);

    return () => {
      stopped = true;
      window.clearInterval(versionTimer);
      window.clearTimeout(refreshTimer);
      scheduledMarketIds.clear();
      refresh.stop();
      document.removeEventListener("visibilitychange", refreshVisibleMarkets);
      window.removeEventListener("online", refreshVisibleMarkets);
      void supabase.removeChannel(channel);
    };
  }, [marketIdsKey, queryClient, refreshOnSubscribe]);
};
