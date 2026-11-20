import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { useAuth } from "../../context/AuthContext";
import { usePersistedState } from "../../hooks/usePersistedState";
import { usePredictionOrderSide } from "../../hooks/usePredictionOrderSide";
import {
  findCurrentTournamentOpponent,
  isRestrictedPredictionOrder,
  MAX_BET_STAKE,
  MIN_BET_AMOUNT,
  predictionOrderRestrictionMessage,
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
  comparePredictionMarketPriority,
  MAX_PREDICTION_ORDER_QUANTITY,
  placePredictionOrder,
  predictionBuyOrderCost,
  predictionMarketVolume,
  type PredictionOrder,
  type PredictionOrderSide,
  type PredictionOutcome,
  predictionTakerFee,
  quotePredictionBuy,
  quotePredictionSell,
  sortPredictionMarketsByChance,
  suggestedPredictionPrice,
} from "../../lib/predictionMarkets/predictionMarkets";
import { buildBetHistory, predictionPnlByMarketId } from "./bettingHistoryModel";
import { useBettingHistory } from "./useBettingHistory";
import { useMarketDeadlineClock } from "./useMarketDeadlineClock";

type BettingView = "markets" | "mine" | "all" | "suggestions";
type WinnerPosition = "yes" | "no";
type PredictionDisplayMode = "book" | "market";
type PredictionMarketCategory = (typeof predictionMarketCategories)[number];
type PredictionSelection = { marketId: string; outcome: PredictionOutcome };
const bettingViews: readonly BettingView[] = ["markets", "mine", "all", "suggestions"];
const predictionDisplayModeSchema = z.enum(["book", "market"]);
const predictionDisplayModeStorageKey = "betting:prediction-display-mode";
const defaultMarketCategory = "AWC Semifinals";
const predictionMarketCategories = [
  "AWC Semifinals",
  "AWC Losers 2",
  "AWC Quarterfinals",
  "Nov Shield",
  "2026 AWC Champion",
  "2026 AWC Side Bets",
  "AWC Round of 16",
  "Ban",
  "AWC Losers 1",
  "AWC 2027",
] as const;
export const otherMarketCategories: readonly string[] = [
  "AWC Quarterfinals",
  "AWC Round of 16",
  "AWC Losers 1",
  "AWC 2027",
  "Ban",
];
const predictionGroupIdByCategory: Record<PredictionMarketCategory, string> = {
  "AWC Semifinals": "awc-2026-semifinals",
  "AWC Quarterfinals": "awc-2026-quarterfinals",
  "AWC Losers 1": "awc-2026-losers-round-1",
  "AWC Losers 2": "awc-2026-losers-round-2",
  "AWC Round of 16": "awc-2026-round-of-16",
  "2026 AWC Champion": "awc-2026-champion",
  "2026 AWC Side Bets": "awc-2026-side-bets",
  "AWC 2027": "awc-2027-champion",
  Ban: "ban-2026",
  "Nov Shield": "november-atomic-shield-2026",
};
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
  predictionMarketCategories.includes(category as (typeof predictionMarketCategories)[number]);

const bettingViewFromSearch = (search: string): BettingView => {
  const requestedView = new URLSearchParams(search).get("view") ?? "";
  return bettingViews.includes(requestedView as BettingView)
    ? (requestedView as BettingView)
    : "markets";
};

const bettingViewFromLocation = (): BettingView =>
  typeof window === "undefined" ? "markets" : bettingViewFromSearch(window.location.search);

const winnerPositionFromSearch = (search: string): WinnerPosition =>
  new URLSearchParams(search).get("side") === "no" ? "no" : "yes";

export const useBettingWorkspace = () => {
  const { isAuthenticated, isLoading: authLoading, login, user } = useAuth();
  const queryClient = useQueryClient();
  const username = user?.username ?? "anonymous";
  const [view, setView] = useState<BettingView>(bettingViewFromLocation);
  const [marketCategory, setMarketCategory] = useState(() =>
    typeof window === "undefined"
      ? defaultMarketCategory
      : marketCategoryFromSearch(window.location.search),
  );
  const [winnerPosition, setWinnerPosition] = useState<WinnerPosition>(() =>
    typeof window === "undefined" ? "yes" : winnerPositionFromSearch(window.location.search),
  );
  const [predictionSelection, setPredictionSelection] = useState<PredictionSelection | null>(null);
  const [expandedPredictionMarketId, setExpandedPredictionMarketId] = useState<string | null>(null);
  const [expandedPredictionOutcome, setExpandedPredictionOutcome] =
    useState<PredictionOutcome>("yes");
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
  const predictionMarkets = useMemo(
    () => predictionMarketGroups.flatMap((group) => group.markets),
    [predictionMarketGroups],
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
  const predictionMarketIds = useMemo(() => {
    const markets = view === "markets" ? activePredictionGroup?.markets : undefined;
    return (showingHistory ? predictionMarkets : (markets ?? [])).map((market) => market.id);
  }, [activePredictionGroup?.markets, predictionMarkets, showingHistory, view]);
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
  const currentTime = useMarketDeadlineClock(
    predictionMarketStates.map((state) => ({
      status: state.market.status,
      closesAt: state.market.closesAt,
    })),
  );
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
  const marketCategories = predictionMarketCategories;
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
  const selectedPredictionDefinition = predictionSelection
    ? predictionMarkets.find((market) => market.id === predictionSelection.marketId)
    : undefined;
  const selectedPredictionGroup = predictionSelection
    ? predictionMarketGroups.find((group) =>
        group.markets.some((market) => market.id === predictionSelection.marketId),
      )
    : undefined;
  const selectedPredictionState = predictionSelection
    ? predictionStateByMarketId.get(predictionSelection.marketId)
    : undefined;
  const balance = coinSummaryQuery.data?.balance ?? 0;
  const predictionPrice = Number(predictionPriceInput);
  const predictionQuantity = Number(predictionQuantityInput);
  const validPredictionPrice =
    Number.isInteger(predictionPrice) && predictionPrice >= 1 && predictionPrice <= 99;
  const validPredictionQuantity =
    Number.isInteger(predictionQuantity) &&
    predictionQuantity >= 1 &&
    predictionQuantity <= MAX_PREDICTION_ORDER_QUANTITY;
  const selectedPredictionOutcome = predictionSelection?.outcome ?? "yes";
  const {
    availableByOutcome: availableContracts,
    canSell,
    hasSellInventory,
    selectSide: selectPredictionSide,
    selectOutcome: selectPredictionOutcome,
  } = usePredictionOrderSide({
    positions: selectedPredictionState?.positions,
    isAuthenticated,
    side: predictionSide,
    outcome: selectedPredictionOutcome,
    quantityInput: predictionQuantityInput,
    onSideChange: setPredictionSide,
    onSelectionChange: () => setSuccessMessage(""),
    onOutcomeChange: (outcome) =>
      setPredictionSelection((current) => (current ? { ...current, outcome } : null)),
    onQuantityChange: setPredictionQuantityInput,
  });
  const selectedPredictionSportsbookPrice =
    selectedPredictionState?.book[selectedPredictionOutcome].asks[0]?.priceCents;
  useEffect(() => {
    if (activePredictionDisplayMode !== "book" || !predictionSelection) return;
    setPredictionPriceInput(
      selectedPredictionSportsbookPrice === undefined
        ? ""
        : String(selectedPredictionSportsbookPrice),
    );
  }, [activePredictionDisplayMode, predictionSelection, selectedPredictionSportsbookPrice]);
  const predictionBuyQuote = quotePredictionBuy(
    selectedPredictionState?.book[selectedPredictionOutcome].asks ?? [],
    validPredictionPrice ? predictionPrice : 0,
    validPredictionQuantity ? predictionQuantity : 0,
  );
  const predictionEstimatedTotal = predictionBuyOrderCost(
    predictionBuyQuote,
    validPredictionPrice ? predictionPrice : 0,
  );
  const predictionEstimatedProfit = predictionQuantity - predictionEstimatedTotal;
  const predictionSellQuote = quotePredictionSell(
    selectedPredictionState?.book[selectedPredictionOutcome].bids ?? [],
    validPredictionPrice ? predictionPrice : 100,
    validPredictionQuantity ? predictionQuantity : 0,
  );
  const predictionSellProceeds = Math.max(
    0,
    predictionSellQuote.proceedsCoins - predictionTakerFee(predictionSellQuote.proceedsCoins),
  );
  const predictionStake = Number(predictionStakeInput);
  const predictionSportsbookStakeLimit = validPredictionPrice
    ? Math.min(MAX_BET_STAKE, predictionPrice * 100)
    : MAX_BET_STAKE;
  const validPredictionStake =
    Number.isInteger(predictionStake) &&
    predictionStake >= MIN_BET_AMOUNT &&
    predictionStake <= predictionSportsbookStakeLimit;
  const predictionSportsbookQuantity =
    validPredictionStake && validPredictionPrice
      ? Math.floor((predictionStake * 100) / predictionPrice)
      : 0;
  const predictionSportsbookQuote = quotePredictionBuy(
    selectedPredictionState?.book[selectedPredictionOutcome].asks ?? [],
    validPredictionPrice ? predictionPrice : 0,
    predictionSportsbookQuantity,
  );
  const predictionSportsbookFee = predictionTakerFee(predictionSportsbookQuote.fillCostCoins);
  const predictionSportsbookTotal =
    predictionSportsbookQuote.fillCostCoins + predictionSportsbookFee;
  const predictionSportsbookFullyMatched =
    predictionSportsbookQuantity > 0 && predictionSportsbookQuote.restingQuantity === 0;
  const predictionSportsbookInsufficientBalance =
    isAuthenticated && predictionSportsbookTotal > balance;
  const selectedPredictionOpen =
    selectedPredictionState?.market.status === "open" &&
    Date.parse(selectedPredictionState.market.closesAt) > Date.now();
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
    groupId: string | undefined,
    marketPlayer: string,
    outcome: PredictionOutcome,
    side: PredictionOrderSide = "buy",
  ) => {
    const definition = predictionMarkets.find(
      (candidate) => candidate.username.toLowerCase() === marketPlayer.toLowerCase(),
    );
    return isRestrictedPredictionOrder({
      groupId,
      marketPlayer,
      yesPlayer: definition?.outcomeLabels?.yes,
      noPlayer: definition?.outcomeLabels?.no,
      username,
      currentOpponent: currentAwcOpponent,
      outcome,
      side,
    });
  };
  const predictionRestrictionTitle = (
    restriction: ReturnType<typeof isRestrictedPredictionOrder>,
  ) =>
    restriction
      ? predictionOrderRestrictionMessage(
          restriction,
          selectedPredictionGroup?.id ?? activePredictionGroup?.id,
        )
      : undefined;
  const selectedPredictionRestriction = selectedPredictionDefinition
    ? predictionRestrictionFor(
        selectedPredictionGroup?.id,
        selectedPredictionDefinition.username,
        selectedPredictionOutcome,
        predictionSide,
      )
    : null;
  const personalPredictionPnlByMarketId = useMemo(() => {
    if (!isAuthenticated || view !== "markets" || !activePredictionGroup) return new Map();
    const personalBets = buildBetHistory({
      predictionPositions: predictionMarketStates.flatMap((state) =>
        (state.historyPositions ?? []).filter(
          (position) => position.username.toLowerCase() === username.toLowerCase(),
        ),
      ),
      predictionMarketGroups: [activePredictionGroup],
      predictionMarketStates,
    });
    return predictionPnlByMarketId(personalBets);
  }, [activePredictionGroup, isAuthenticated, predictionMarketStates, username, view]);
  const activePredictionGroupPnl = useMemo(() => {
    if (!isAuthenticated || !activePredictionGroup) return null;

    const values = activePredictionGroup.markets
      .map((market) => personalPredictionPnlByMarketId.get(market.id))
      .filter((value): value is number => value !== undefined);
    if (!values.length) return null;

    const total = values.reduce((sum, value) => sum + value, 0);
    return Math.abs(total) >= 0.005 ? total : null;
  }, [activePredictionGroup, isAuthenticated, personalPredictionPnlByMarketId]);
  useEffect(() => {
    const syncViewFromHistory = () => {
      setView(bettingViewFromLocation());
      setMarketCategory(marketCategoryFromSearch(window.location.search));
      setWinnerPosition(winnerPositionFromSearch(window.location.search));
      setPredictionSelection(null);
      setExpandedPredictionMarketId(null);
    };
    window.addEventListener("popstate", syncViewFromHistory);
    return () => window.removeEventListener("popstate", syncViewFromHistory);
  }, [marketCategories]);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("view", view);
    if (view === "markets") {
      currentUrl.searchParams.set("market", marketCategorySlug(marketCategory));
      if (isWinnerCategory(marketCategory)) {
        currentUrl.searchParams.set("side", winnerPosition);
      } else {
        currentUrl.searchParams.delete("side");
      }
    } else {
      currentUrl.searchParams.delete("market");
      currentUrl.searchParams.delete("side");
    }
    if (view !== "all") {
      currentUrl.searchParams.delete("bettor");
      currentUrl.searchParams.delete("strike");
      currentUrl.searchParams.delete("status");
    }
    if (
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}` ===
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    )
      return;
    window.history.replaceState(
      {},
      "",
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    );
  }, [marketCategory, view, winnerPosition]);

  const selectView = (nextView: BettingView) => {
    if (nextView === view) return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("view", nextView);
    if (nextView === "markets") {
      nextUrl.searchParams.set("market", marketCategorySlug(marketCategory));
      if (isWinnerCategory(marketCategory)) {
        nextUrl.searchParams.set("side", winnerPosition);
      }
    } else {
      nextUrl.searchParams.delete("market");
      nextUrl.searchParams.delete("side");
    }
    window.history.pushState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    setView(nextView);
  };

  const selectMarketCategory = (nextCategory: string) => {
    if (!isPredictionMarketCategory(nextCategory) || nextCategory === marketCategory) return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("view", "markets");
    nextUrl.searchParams.set("market", marketCategorySlug(nextCategory));
    if (isWinnerCategory(nextCategory)) {
      nextUrl.searchParams.set("side", winnerPosition);
    } else {
      nextUrl.searchParams.delete("side");
    }
    window.history.pushState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    setMarketCategory(nextCategory);
    setPredictionSelection(null);
    setExpandedPredictionMarketId(null);
  };

  const selectWinnerPosition = (nextPosition: WinnerPosition) => {
    if (nextPosition === winnerPosition) return;
    setWinnerPosition(nextPosition);
    setPredictionSelection(null);
  };

  const placePredictionMutation = useMutation({
    mutationFn: placePredictionOrder,
    onSuccess: (result) => {
      setSuccessMessage(
        result.cancelledForInsufficientBalance
          ? "Order cancelled because your available coin balance was too low when it matched."
          : activePredictionDisplayMode === "book"
            ? "Bet placed."
            : "Prediction order placed.",
      );
      setPredictionStakeInput("");
      setPredictionStakeTouched(false);
      updateCachedCoinBalance(queryClient, username, result.balance);
      patchPredictionMarketState(queryClient, result.state);
      void queryClient.invalidateQueries({ queryKey: bettingQueryKeys.predictionPositions });
    },
  });

  const choosePredictionOutcome = (
    marketId: string,
    outcome: PredictionOutcome,
    suggestedPrice: number,
    side: PredictionOrderSide = "buy",
  ) => {
    setPredictionSide(side);
    setPredictionSelection({ marketId, outcome });
    setExpandedPredictionMarketId(marketId);
    setExpandedPredictionOutcome(outcome);
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
    setExpandedPredictionMarketId((current) => (current === marketId ? null : marketId));
    setExpandedPredictionOutcome(
      predictionSelection?.marketId === marketId ? predictionSelection.outcome : "yes",
    );
  };

  const submitPredictionOrder = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage("");
    if (
      !predictionSelection ||
      !validPredictionPrice ||
      !validPredictionQuantity ||
      !hasSellInventory ||
      selectedPredictionRestriction ||
      !selectedPredictionOpen
    )
      return;
    placePredictionMutation.mutate({
      username,
      marketId: predictionSelection.marketId,
      outcome: predictionSelection.outcome,
      side: predictionSide,
      priceCents: predictionPrice,
      quantity: predictionQuantity,
    });
  };

  const submitPredictionSportsbookBet = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPredictionStakeTouched(true);
    setSuccessMessage("");
    if (
      !predictionSelection ||
      !validPredictionPrice ||
      !validPredictionStake ||
      !predictionSportsbookFullyMatched ||
      predictionSportsbookInsufficientBalance ||
      selectedPredictionRestriction ||
      !selectedPredictionOpen
    )
      return;
    placePredictionMutation.mutate({
      username,
      marketId: predictionSelection.marketId,
      outcome: predictionSelection.outcome,
      side: "buy",
      priceCents: predictionPrice,
      quantity: predictionSportsbookQuantity,
      budgetCoins: predictionStake,
    });
  };

  return {
    view,
    selectView,
    showingHistory,
    ...history,
    predictionCatalogQuery,
    isAuthenticated,
    authLoading,
    login,
    predictionMarketGroups,
    predictionMarketStates,
    countryByPlayer,
    editingOrderContext,
    setEditingOrderContext,
    queryClient,
    username,
    browser: {
      marketCategories,
      marketCategory,
      selectMarketCategory,
      activePredictionGroup,
      predictionMarketOnlyCategory,
      predictionDisplayMode,
      setPredictionDisplayMode,
      setExpandedPredictionMarketId,
      setPredictionSelection,
      setSuccessMessage,
      predictionCatalogQuery,
      predictionMarketQuery,
      activePredictionDisplayMode,
      activePredictionGroupLoading,
      activePredictionGroupOpen,
      winnerPosition,
      selectWinnerPosition,
      activePredictionGroupPnl,
      activePredictionVolume,
      sortedActivePredictionMarkets,
      predictionStateByMarketId,
      personalPredictionPnlByMarketId,
      predictionSelection,
      predictionRestrictionFor,
      predictionRestrictionTitle,
      choosePredictionOutcome,
      isAuthenticated,
      expandedPredictionMarketId,
      expandedPredictionOutcome,
      togglePredictionStrike,
      setEditingOrderContext,
      setPredictionQuantityInput,
    },
    ticket: {
      activePredictionGroup,
      activePredictionDisplayMode,
      betSlipRef,
      selectedPredictionDefinition,
      predictionSelection,
      submitPredictionSportsbookBet,
      submitPredictionOrder,
      selectedPredictionGroup,
      marketCategory,
      validPredictionPrice,
      predictionPrice,
      predictionStakeRef,
      predictionSportsbookStakeLimit,
      predictionStakeInput,
      setPredictionStakeInput,
      setPredictionStakeTouched,
      predictionSportsbookQuote,
      predictionSportsbookQuantity,
      validPredictionStake,
      predictionSportsbookFullyMatched,
      predictionSportsbookTotal,
      predictionSportsbookFee,
      predictionStakeTouched,
      predictionSportsbookInsufficientBalance,
      predictionSide,
      canSell,
      selectPredictionSide,
      availableContracts,
      predictionRestrictionFor,
      selectedPredictionState,
      predictionQuantityInput,
      predictionPriceInput,
      validPredictionQuantity,
      predictionSellProceeds,
      predictionEstimatedTotal,
      selectedPredictionOutcome,
      predictionQuantity,
      predictionEstimatedProfit,
      selectPredictionOutcome,
      setPredictionPriceInput,
      setPredictionQuantityInput,
      placePredictionMutation,
      username,
      selectedPredictionRestriction,
      successMessage,
      isAuthenticated,
      selectedPredictionOpen,
      authLoading,
      login,
      hasSellInventory,
      predictionBuyQuote,
    },
  };
};
