import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useRef } from "react";

import { bettingQueryKeys, refreshPredictionPositions } from "../betting/bettingQueries";
import { coinQueryKeys } from "../coins/coinQueries";
import { getSupabaseClient } from "../supabase/client";
import {
  patchPredictionMarketState,
  predictionMarketBatchQueryOptions,
  predictionMarketCatalogQueryOptions,
} from "./predictionMarketQueries";
import { fetchPredictionMarkets, type PredictionMarketId } from "./predictionMarkets";

const LIVE_RECOVERY_MS = 5_000;
const OFFLINE_RECOVERY_MS = 2_000;
const FULL_VERSION_CHECK_MS = 60_000;
const VERSION_OVERLAP_MS = 10_000;
const QUOTA_BACKOFF_MS = 60_000;

type PredictionMarketUpdate = {
  market_id: string;
  change_scope: "book" | "catalog";
  version: number;
  updated_at?: string;
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

export const usePredictionMarketRealtime = (
  queryClient: QueryClient,
  marketIds: readonly PredictionMarketId[],
  {
    trackHistory = false,
    username,
  }: { trackHistory?: boolean; username?: string | undefined } = {},
) => {
  const channelId = useId();
  const activeIds = useRef(marketIds);
  const refreshMarket = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    activeIds.current = marketIds;
  }, [marketIds]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    const controller = new AbortController();
    const { signal } = controller;
    const seenVersions = new Map<string, number>();
    const catalogChanges = new Set<string>();
    const queuedIds = new Set<string>();
    const startedAt = Date.now();
    let baselineReady = false;
    let checkingVersions = false;
    let socketLive = false;
    let lastVersionCheck = -Infinity;
    let refreshTimer: number | undefined;
    let lastFallback = -Infinity;
    let lastFullCheck = -Infinity;
    let latestUpdateTime = 0;
    let quotaBlockedUntil = 0;

    const invalidate = (queryKey: readonly unknown[]) =>
      queryClient.invalidateQueries({ queryKey, exact: true }, { throwOnError: true });
    const historyActive = () =>
      trackHistory ||
      queryClient
        .getQueryCache()
        .find({ queryKey: bettingQueryKeys.predictionPositions })
        ?.isActive();
    const refreshBalance = () =>
      username ? invalidate(coinQueryKeys.summary(username)) : Promise.resolve();

    const refreshBooks = async (ids: readonly string[]) => {
      const options = predictionMarketBatchQueryOptions(activeIds.current);
      if (queryClient.getQueryState(options.queryKey)?.fetchStatus === "fetching") {
        await queryClient.fetchQuery({ ...options, staleTime: 0 });
      }
      if (signal.aborted) return;
      const tracked = new Set(activeIds.current);
      const changed = ids.filter((id) => tracked.has(id));
      if (!changed.length) return;
      const states = await fetchPredictionMarkets(changed, signal);
      if (!signal.aborted)
        states.forEach((state) => patchPredictionMarketState(queryClient, state));
    };

    const retryOnFailure = (refresh: (ids: readonly string[]) => Promise<unknown>) =>
      createCoalescedBatchRefresh(async (ids: readonly string[]) => {
        const versions = ids.map((id) => seenVersions.get(id));
        try {
          await refresh(ids);
        } catch {
          lastFullCheck = -Infinity;
          ids.forEach((id, index) => {
            if (seenVersions.get(id) === versions[index]) seenVersions.delete(id);
          });
        }
      });
    const books = retryOnFailure(refreshBooks);
    const account = retryOnFailure(async (ids) => {
      const changedCatalog = ids.filter((id) => catalogChanges.delete(id));
      try {
        await Promise.all([
          refreshBalance(),
          ...ids.map((id) => invalidate(bettingQueryKeys.strikePositions(id))),
          historyActive() ? refreshPredictionPositions(queryClient, ids, signal) : undefined,
          changedCatalog.length
            ? invalidate(predictionMarketCatalogQueryOptions().queryKey)
            : undefined,
        ]);
      } catch (error) {
        changedCatalog.forEach((id) => catalogChanges.add(id));
        throw error;
      }
    });

    const queue = (id: string) => {
      queuedIds.add(id);
      if (refreshTimer !== undefined) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        const ids = [...queuedIds];
        queuedIds.clear();
        const active = new Set(activeIds.current);
        books.request(ids.filter((marketId) => active.has(marketId)));
        account.request(ids);
      }, 32);
    };
    refreshMarket.current = queue;

    const recordUpdate = (update: PredictionMarketUpdate) => {
      const { market_id: id, version } = update;
      if (version <= (seenVersions.get(id) ?? 0)) return;
      seenVersions.set(id, version);
      if (update.change_scope === "catalog") catalogChanges.add(id);
      queue(id);
    };

    const checkVersions = async () => {
      const now = performance.now();
      if (
        signal.aborted ||
        checkingVersions ||
        now < quotaBlockedUntil ||
        document.visibilityState !== "visible"
      )
        return;
      if (!trackHistory && !activeIds.current.length) return;
      checkingVersions = true;
      lastVersionCheck = now;
      try {
        const fullCheck = !latestUpdateTime || now - lastFullCheck >= FULL_VERSION_CHECK_MS;
        let versions = supabase
          .from("prediction_market_updates")
          .select("market_id,version,change_scope,updated_at")
          .abortSignal(signal);
        if (!trackHistory) versions = versions.in("market_id", [...activeIds.current]);
        // Overlap the cursor for transactions that commit out of order. A periodic full
        // check also catches delayed transactions and strikes added to the visible list.
        if (!fullCheck)
          versions = versions.gte(
            "updated_at",
            new Date(latestUpdateTime - VERSION_OVERLAP_MS).toISOString(),
          );
        const { data, error, status } = await versions;
        if (signal.aborted) return;
        if (status === 402) {
          quotaBlockedUntil = performance.now() + QUOTA_BACKOFF_MS;
          return;
        }
        if (error) throw error;
        if (fullCheck) lastFullCheck = now;
        for (const update of (data ?? []) as PredictionMarketUpdate[]) {
          const updatedAt = Date.parse(update.updated_at ?? "");
          if (Number.isFinite(updatedAt)) latestUpdateTime = Math.max(latestUpdateTime, updatedAt);
          if (
            !baselineReady &&
            !seenVersions.has(update.market_id) &&
            (!Number.isFinite(updatedAt) || updatedAt < startedAt - 5_000)
          ) {
            seenVersions.set(update.market_id, update.version);
          } else {
            recordUpdate(update);
          }
        }
        baselineReady = true;
      } catch {
        if (signal.aborted || performance.now() - lastFallback < 10_000) return;
        lastFallback = performance.now();
        books.request(activeIds.current);
        await Promise.allSettled([
          refreshBalance(),
          historyActive() ? invalidate(bettingQueryKeys.predictionPositions) : undefined,
          invalidate(predictionMarketCatalogQueryOptions().queryKey),
        ]);
      } finally {
        checkingVersions = false;
      }
    };

    const resume = () => void checkVersions();
    const poll = () => {
      const interval = socketLive ? LIVE_RECOVERY_MS : OFFLINE_RECOVERY_MS;
      if (performance.now() - lastVersionCheck >= interval) resume();
    };
    const channel = supabase
      .channel(`prediction-markets:${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prediction_market_updates" },
        ({ new: row }) => {
          const update = row as Partial<PredictionMarketUpdate>;
          if (!update.market_id || !update.change_scope || typeof update.version !== "number")
            return;
          if (
            document.visibilityState === "visible" &&
            (trackHistory ||
              activeIds.current.includes(update.market_id) ||
              update.change_scope === "catalog")
          ) {
            recordUpdate(update as PredictionMarketUpdate);
          }
        },
      )
      .subscribe((status) => {
        socketLive = status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED;
      });

    resume();
    const versionTimer = window.setInterval(poll, 1_000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);

    return () => {
      controller.abort();
      refreshMarket.current = () => {};
      window.clearInterval(versionTimer);
      window.clearTimeout(refreshTimer);
      books.stop();
      account.stop();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      void supabase.removeChannel(channel);
    };
  }, [channelId, queryClient, trackHistory, username]);

  return useCallback((id: string) => refreshMarket.current(id), []);
};
