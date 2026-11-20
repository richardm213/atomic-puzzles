import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { useAuth } from "../../context/AuthContext";
import { usePersistedState } from "../../hooks/usePersistedState";
import {
  findCurrentTournamentOpponent,
  isRestrictedPredictionOrder,
} from "../../lib/betting/betting";
import { bettingQueryKeys } from "../../lib/betting/bettingQueries";
import { coinSummaryQueryOptions, updateCachedCoinBalance } from "../../lib/coins/coinQueries";
import {
  tournamentBracketQueryOptions,
  tournamentPlayerCountriesQueryOptions,
} from "../../lib/matches/tournamentQueries";
import {
  patchPredictionMarketState,
  predictionMarketBatchQueryOptions,
  predictionMarketCatalogQueryOptions,
} from "../../lib/predictionMarkets/predictionMarketQueries";
import { usePredictionMarketRealtime } from "../../lib/predictionMarkets/predictionMarketRealtime";
import {
  availablePredictionContracts,
  comparePredictionMarketPriority,
  placePredictionOrder,
  type PredictionMarketDefinition,
  type PredictionMarketState,
  predictionMarketVolume,
  type PredictionOrder,
  type PredictionOrderSide,
  type PredictionOutcome,
  sortPredictionMarketsByChance,
  suggestedPredictionPrice,
} from "../../lib/predictionMarkets/predictionMarkets";
import { personalMarketPnl } from "./bettingHistoryModel";
import { useBettingHistory } from "./useBettingHistory";
import { useMarketDeadlineClock } from "./useMarketDeadlineClock";

type BettingView = "markets" | "mine" | "all" | "suggestions";
type WinnerPosition = "yes" | "no";
type PredictionDisplayMode = "book" | "market";
type PredictionMarketCategory = keyof typeof predictionGroupIdByCategory;
type PredictionSelection = { marketId: string; outcome: PredictionOutcome };
const bettingViews: readonly BettingView[] = ["markets", "mine", "all", "suggestions"];
const predictionDisplayModeSchema = z.enum(["book", "market"]);
const predictionDisplayModeStorageKey = "betting:prediction-display-mode";
const defaultMarketCategory = "AWC Semifinals";
export const otherMarketCategories: readonly string[] = [
  "AWC Quarterfinals",
  "AWC Round of 16",
  "AWC Losers 1",
  "AWC 2027",
  "Ban",
];
const predictionGroupIdByCategory = {
  "AWC Semifinals": "awc-2026-semifinals",
  "AWC Losers 2": "awc-2026-losers-round-2",
  "AWC Quarterfinals": "awc-2026-quarterfinals",
  "Nov Shield": "november-atomic-shield-2026",
  "2026 AWC Champion": "awc-2026-champion",
  "2026 AWC Side Bets": "awc-2026-side-bets",
  "AWC Round of 16": "awc-2026-round-of-16",
  Ban: "ban-2026",
  "AWC Losers 1": "awc-2026-losers-round-1",
  "AWC 2027": "awc-2027-champion",
};
export const predictionMarketCategories = Object.keys(
  predictionGroupIdByCategory,
) as PredictionMarketCategory[];
export const isWinnerCategory = (category: string): boolean =>
  category === "2026 AWC Champion" || category === "AWC 2027" || category === "Nov Shield";
const marketCategorySlug = (category: string): string => {
  const normalizedCategory = category
    .trim()
    .toLowerCase()
    .replace(/^awc\s+/, "");
  const numberedRound = /^round of (\d+)$/.exec(normalizedCategory);
  if (numberedRound) return `r${numberedRound[1]}`;
  return normalizedCategory.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
};

const marketCategoryFromSearch = (search: string): PredictionMarketCategory => {
  const requestedMarket = new URLSearchParams(search).get("market") ?? "";
  if (requestedMarket === "markets") return "Ban";
  if (requestedMarket === "champion") return "2026 AWC Champion";
  if (requestedMarket === "shield") return "Nov Shield";
  return (
    predictionMarketCategories.find(
      (category) => marketCategorySlug(category) === requestedMarket,
    ) ?? defaultMarketCategory
  );
};

const isPredictionMarketCategory = (category: string): category is PredictionMarketCategory =>
  Object.hasOwn(predictionGroupIdByCategory, category);

const bettingViewFromSearch = (search: string): BettingView => {
  const requestedView = new URLSearchParams(search).get("view") ?? "";
  return bettingViews.includes(requestedView as BettingView)
    ? (requestedView as BettingView)
    : "markets";
};

const readBettingLocation = () => {
  const search = typeof window === "undefined" ? "" : window.location.search;
  return {
    view: bettingViewFromSearch(search),
    marketCategory: marketCategoryFromSearch(search),
    winnerPosition: new URLSearchParams(search).get("side") === "no" ? "no" : "yes",
  } satisfies {
    view: BettingView;
    marketCategory: PredictionMarketCategory;
    winnerPosition: WinnerPosition;
  };
};

const writeBettingLocation = (
  view: BettingView,
  category: PredictionMarketCategory,
  position: WinnerPosition,
  push = false,
) => {
  const url = new URL(window.location.href);
  const { searchParams } = url;
  searchParams.set("view", view);
  if (view === "markets") searchParams.set("market", marketCategorySlug(category));
  else searchParams.delete("market");
  if (view === "markets" && isWinnerCategory(category)) searchParams.set("side", position);
  else searchParams.delete("side");
  if (view !== "all") {
    for (const filter of ["bettor", "strike", "status"]) searchParams.delete(filter);
  }
  if (url.href === window.location.href) return;
  if (push) window.history.pushState({}, "", url);
  else window.history.replaceState({}, "", url);
};

export const useBettingWorkspace = () => {
  const { isAuthenticated, isLoading: authLoading, login, user } = useAuth();
  const queryClient = useQueryClient();
  const username = user?.username ?? "anonymous";
  const [{ view, marketCategory, winnerPosition }, setLocation] = useState(readBettingLocation);
  const [predictionSelection, setPredictionSelection] = useState<PredictionSelection | null>(null);
  const [expandedStrike, setExpandedStrike] = useState<PredictionSelection | null>(null);
  const [editingOrderContext, setEditingOrderContext] = useState<{
    marketId: string;
    outcome: PredictionOutcome;
    orders: PredictionOrder[];
  } | null>(null);
  const [predictionPriceInput, setPredictionPriceInput] = useState("50");
  const [predictionSide, setPredictionSide] = useState<PredictionOrderSide>("buy");
  const [predictionQuantityInput, setPredictionQuantityInput] = useState("10");
  const [predictionStakeInput, setPredictionStakeInput] = useState("");
  const [predictionStakeTouched, setPredictionStakeTouched] = useState(false);
  const [predictionDisplayMode, setPredictionDisplayMode] =
    usePersistedState<PredictionDisplayMode>(
      predictionDisplayModeStorageKey,
      predictionDisplayModeSchema,
      "book",
    );
  const [successMessage, setSuccessMessage] = useState("");
  const betSlipRef = useRef<HTMLElement>(null);
  const predictionStakeRef = useRef<HTMLInputElement>(null);

  const predictionCatalogQuery = useQuery({
    ...predictionMarketCatalogQueryOptions(),
    enabled: view !== "suggestions",
  });
  const predictionMarketGroups = useMemo(
    () => predictionCatalogQuery.data ?? [],
    [predictionCatalogQuery.data],
  );
  const activePredictionGroup = predictionMarketGroups.find(
    (group) => group.id === predictionGroupIdByCategory[marketCategory],
  );
  const showingHistory = view === "all" || (view === "mine" && isAuthenticated);
  const coinSummaryQuery = useQuery({
    ...coinSummaryQueryOptions(username),
    enabled: isAuthenticated,
  });
  const countriesQuery = useQuery({
    ...tournamentPlayerCountriesQueryOptions(),
    enabled: view !== "suggestions",
  });
  const awcBracketQuery = useQuery({
    ...tournamentBracketQueryOptions("awc2026"),
    enabled: view === "markets" && isAuthenticated && marketCategory === "2026 AWC Champion",
  });
  const predictionMarketIds = useMemo(
    () =>
      showingHistory
        ? predictionMarketGroups.flatMap((group) => group.markets.map((market) => market.id))
        : view === "markets"
          ? (activePredictionGroup?.markets.map((market) => market.id) ?? [])
          : [],
    [activePredictionGroup, predictionMarketGroups, showingHistory, view],
  );
  const predictionMarketQuery = useQuery({
    ...predictionMarketBatchQueryOptions(predictionMarketIds),
    enabled: predictionMarketIds.length > 0,
  });
  usePredictionMarketRealtime(
    queryClient,
    predictionMarketQuery.data ? predictionMarketIds : [],
    false,
  );
  const predictionMarketStates = useMemo(
    () => predictionMarketQuery.data ?? [],
    [predictionMarketQuery.data],
  );
  const predictionStateByMarketId = useMemo(
    () => new Map(predictionMarketStates.map((state) => [state.market.id, state])),
    [predictionMarketStates],
  );
  const countryByPlayer = countriesQuery.data ?? {};
  const deadlines = useMemo(
    () => predictionMarketStates.map(({ market }) => market),
    [predictionMarketStates],
  );
  const currentTime = useMarketDeadlineClock(deadlines);
  const history = useBettingHistory({
    showingHistory,
    isAuthenticated,
    username,
    catalog: predictionCatalogQuery,
    markets: {
      isPending: predictionMarketIds.length > 0 && predictionMarketQuery.isPending,
      isError: predictionMarketQuery.isError,
      error: predictionMarketQuery.error,
    },
    predictionMarketGroups,
    predictionMarketStates,
  });
  const predictionMarketOnlyCategory =
    marketCategory === "Ban" || marketCategory === "2026 AWC Side Bets";
  const activePredictionDisplayMode: PredictionDisplayMode = predictionMarketOnlyCategory
    ? "market"
    : predictionDisplayMode;
  const activePredictionGroupOpen =
    activePredictionGroup?.markets.some((definition) => {
      const state = predictionStateByMarketId.get(definition.id);
      return state?.market.status === "open" && Date.parse(state.market.closesAt) > currentTime;
    }) ?? false;
  const activePredictionGroupLoading =
    Boolean(activePredictionGroup) &&
    predictionMarketQuery.isPending &&
    predictionMarketStates.length === 0;
  const sortedActivePredictionMarkets = useMemo(() => {
    const definitions = activePredictionGroup?.markets ?? [];
    if (activePredictionDisplayMode !== "book") {
      return sortPredictionMarketsByChance(definitions, predictionStateByMarketId);
    }
    const displayedOutcome: PredictionOutcome = isWinnerCategory(marketCategory)
      ? winnerPosition
      : "yes";
    return [...definitions].sort((left, right) => {
      const priority = comparePredictionMarketPriority(left, right);
      if (priority) return priority;
      const leftResolved = predictionStateByMarketId.get(left.id)?.market.status === "resolved";
      const rightResolved = predictionStateByMarketId.get(right.id)?.market.status === "resolved";
      if (leftResolved !== rightResolved) return leftResolved ? 1 : -1;
      return (
        suggestedPredictionPrice(right, predictionStateByMarketId.get(right.id), displayedOutcome) -
        suggestedPredictionPrice(left, predictionStateByMarketId.get(left.id), displayedOutcome)
      );
    });
  }, [
    activePredictionDisplayMode,
    activePredictionGroup?.markets,
    marketCategory,
    predictionStateByMarketId,
    winnerPosition,
  ]);
  const activePredictionVolume =
    activePredictionGroup?.markets.reduce(
      (total, definition) =>
        total + predictionMarketVolume(predictionStateByMarketId.get(definition.id)),
      0,
    ) ?? 0;
  const selectedMarket = predictionSelection
    ? activePredictionGroup?.markets.find((market) => market.id === predictionSelection.marketId)
    : undefined;
  const selectedState = selectedMarket && predictionStateByMarketId.get(selectedMarket.id);
  const currentAwcOpponent = findCurrentTournamentOpponent(
    (awcBracketQuery.data?.matches ?? []).map((match) => ({
      p1: match.p1,
      p2: match.p2,
      s1: match.s1,
      s2: match.s2,
      matchId: match.match_id,
    })),
    username,
  );
  const predictionRestrictionFor = (
    definition: PredictionMarketDefinition,
    outcome: PredictionOutcome,
    side: PredictionOrderSide = "buy",
  ) =>
    isRestrictedPredictionOrder({
      groupId: activePredictionGroup?.id,
      marketPlayer: definition.username,
      yesPlayer: definition.outcomeLabels?.yes,
      noPlayer: definition.outcomeLabels?.no,
      username,
      currentOpponent: currentAwcOpponent,
      outcome,
      side,
    });
  const pnl = useMemo(
    () =>
      personalMarketPnl(
        isAuthenticated && view === "markets" ? activePredictionGroup : undefined,
        predictionMarketStates,
        username,
      ),
    [activePredictionGroup, isAuthenticated, predictionMarketStates, username, view],
  );

  const clearSelection = useCallback(() => {
    setPredictionSelection(null);
    setExpandedStrike(null);
  }, []);

  useEffect(() => {
    const syncViewFromHistory = () => {
      setLocation(readBettingLocation());
      clearSelection();
    };
    window.addEventListener("popstate", syncViewFromHistory);
    return () => window.removeEventListener("popstate", syncViewFromHistory);
  }, [clearSelection]);

  useEffect(() => {
    writeBettingLocation(view, marketCategory, winnerPosition);
  }, [marketCategory, view, winnerPosition]);

  const selectView = (nextView: BettingView) => {
    if (nextView === view) return;
    writeBettingLocation(nextView, marketCategory, winnerPosition, true);
    setLocation({ view: nextView, marketCategory, winnerPosition });
  };

  const selectMarketCategory = (category: string) => {
    if (!isPredictionMarketCategory(category) || category === marketCategory) return;
    writeBettingLocation("markets", category, winnerPosition, true);
    setLocation({ view: "markets", marketCategory: category, winnerPosition });
    clearSelection();
  };

  const selectWinnerPosition = (position: WinnerPosition) => {
    if (position === winnerPosition) return;
    setLocation({ view, marketCategory, winnerPosition: position });
    setPredictionSelection(null);
  };

  const selectDisplayMode = (mode: PredictionDisplayMode) => {
    setPredictionDisplayMode(mode);
    clearSelection();
    setSuccessMessage("");
  };

  const applyOrderUpdate = (
    { balance, state }: { balance: number; state: PredictionMarketState },
    account = username,
  ) => {
    updateCachedCoinBalance(queryClient, account, balance);
    patchPredictionMarketState(queryClient, state);
    void queryClient.invalidateQueries({ queryKey: bettingQueryKeys.predictionPositions });
  };

  const placePredictionMutation = useMutation({
    mutationFn: placePredictionOrder,
    onSuccess: (result, order) => {
      setSuccessMessage(
        result.cancelledForInsufficientBalance
          ? "Order cancelled because your available coin balance was too low when it matched."
          : order.budgetCoins !== undefined
            ? "Bet placed."
            : "Prediction order placed.",
      );
      setPredictionStakeInput("");
      setPredictionStakeTouched(false);
      applyOrderUpdate(result, order.username);
    },
  });

  const choosePredictionOutcome = (
    marketId: string,
    outcome: PredictionOutcome,
    suggestedPrice: number,
    side: PredictionOrderSide = "buy",
    quantity?: number,
  ) => {
    setPredictionSide(side);
    if (quantity !== undefined) setPredictionQuantityInput(String(quantity));
    setPredictionSelection({ marketId, outcome });
    setExpandedStrike({ marketId, outcome });
    setPredictionPriceInput(String(suggestedPrice));
    setSuccessMessage("");
    placePredictionMutation.reset();
    const isMobile = window.matchMedia("(max-width: 760px)").matches;
    if (isMobile) {
      window.setTimeout(() => {
        betSlipRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    } else if (activePredictionDisplayMode === "book") {
      window.setTimeout(() => predictionStakeRef.current?.focus(), 0);
    }
  };

  const togglePredictionStrike = (marketId: string) => {
    setExpandedStrike((current) =>
      current?.marketId === marketId
        ? null
        : {
            marketId,
            outcome:
              predictionSelection?.marketId === marketId ? predictionSelection.outcome : "yes",
          },
    );
  };

  const startOrderFromBook = (
    state: PredictionMarketState,
    outcome: PredictionOutcome,
    side: "bid" | "ask",
    price: number,
    quantity: number,
  ) => {
    const available = availablePredictionContracts(state.positions)[outcome];
    const sell = side === "bid" && available >= 1;
    choosePredictionOutcome(
      state.market.id,
      outcome,
      price,
      sell ? "sell" : "buy",
      sell ? Math.min(quantity, Math.floor(available)) : quantity,
    );
  };

  const auth = { isAuthenticated, authLoading, login, username };
  return {
    view,
    selectView,
    showingHistory,
    ...history,
    predictionCatalogQuery,
    auth,
    predictionMarketGroups,
    predictionMarketStates,
    countryByPlayer,
    editingOrderContext,
    setEditingOrderContext,
    applyOrderUpdate,
    browser: {
      marketCategory,
      selectMarketCategory,
      activePredictionGroup,
      predictionMarketOnlyCategory,
      selectDisplayMode,
      predictionCatalogQuery,
      predictionMarketQuery,
      activePredictionDisplayMode,
      activePredictionGroupLoading,
      activePredictionGroupOpen,
      winnerPosition,
      selectWinnerPosition,
      activePredictionGroupPnl: pnl.total,
      activePredictionVolume,
      sortedActivePredictionMarkets,
      predictionStateByMarketId,
      personalPredictionPnlByMarketId: pnl.byMarketId,
      predictionSelection,
      predictionRestrictionFor,
      choosePredictionOutcome,
      isAuthenticated,
      expandedStrike,
      togglePredictionStrike,
      setEditingOrderContext,
      startOrderFromBook,
    },
    ticket: {
      auth,
      group: activePredictionGroup,
      mode: activePredictionDisplayMode,
      winnerMarket: isWinnerCategory(marketCategory),
      definition: selectedMarket,
      state: selectedState,
      selection: predictionSelection,
      setOutcome: (outcome: PredictionOutcome) =>
        setPredictionSelection((current) => (current ? { ...current, outcome } : null)),
      restrictionFor: predictionRestrictionFor,
      balance: coinSummaryQuery.data?.balance ?? 0,
      currentTime,
      betSlipRef,
      predictionStakeRef,
      side: predictionSide,
      setSide: setPredictionSide,
      priceInput: predictionPriceInput,
      setPriceInput: setPredictionPriceInput,
      quantityInput: predictionQuantityInput,
      setQuantityInput: setPredictionQuantityInput,
      stakeInput: predictionStakeInput,
      setStakeInput: setPredictionStakeInput,
      stakeTouched: predictionStakeTouched,
      setStakeTouched: setPredictionStakeTouched,
      mutation: placePredictionMutation,
      successMessage,
      clearSuccess: () => setSuccessMessage(""),
    },
  };
};
