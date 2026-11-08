import "./Betting.css";

import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { InlineState } from "../../components/InlineState/InlineState";
import { PredictionOrderEditor } from "../../components/PredictionOrderEditor/PredictionOrderEditor";
import { BettingAccountSummary } from "../../components/PredictionTrading/BettingAccountSummary";
import { PredictionMarketGroupHeader } from "../../components/PredictionTrading/PredictionMarketGroupHeader";
import { PredictionMarketTable } from "../../components/PredictionTrading/PredictionMarketTable";
import { PredictionOrderBook } from "../../components/PredictionTrading/PredictionOrderBook";
import { PredictionOrderComposer } from "../../components/PredictionTrading/PredictionOrderComposer";
import { PredictionResolvedMarket } from "../../components/PredictionTrading/PredictionResolvedMarket";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { usePersistedState } from "../../hooks/usePersistedState";
import {
  AWC_NOT_TO_WIN_MARKET_ID,
  type BettingMarket,
  findCurrentTournamentOpponent,
  isAwcNotToWinSelfBet,
  isRestrictedPredictionOrder,
  isTournamentBetOnOpponent,
  MAX_BET_STAKE,
  maxTournamentBetStake,
  MIN_BET_AMOUNT,
  placeTournamentBet,
  predictionOrderRestrictionMessage,
  quoteTournamentBet,
} from "../../lib/betting/betting";
import {
  allPredictionPositionsQueryOptions,
  allTournamentBetsQueryOptions,
  bettingBootstrapQueryOptions,
  bettingMarketsQueryOptions,
  bettingQueryKeys,
  tournamentBetsQueryOptions,
} from "../../lib/betting/bettingQueries";
import { formatCoinValue } from "../../lib/coins/coinDisplay";
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
  formatPredictionChance,
  MAX_PREDICTION_ORDER_QUANTITY,
  placePredictionOrder,
  predictionBuyOrderCost,
  predictionMarketVolume,
  type PredictionOrder,
  type PredictionOutcome,
  predictionOutcomeCountryCode,
  predictionOutcomeLabel,
  predictionOutcomes,
  predictionTakerFee,
  quotePredictionBuy,
  sortPredictionMarketsByChance,
  suggestedPredictionPrice,
} from "../../lib/predictionMarkets/predictionMarkets";
import { appAssetPath } from "../../utils/appAssetPath";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { getErrorMessage } from "../../utils/errors";
import { BettingHistory } from "./BettingHistory";
import { buildBetHistory, predictionPnlByMarketId } from "./bettingHistoryModel";
import { BettingSuggestions } from "./BettingSuggestions";
import { useMarketDeadlineClock } from "./useMarketDeadlineClock";

type BettingView = "markets" | "mine" | "all" | "suggestions";
type WinnerPosition = "yes" | "no";
type PredictionDisplayMode = "book" | "market";
type PredictionMarketCategory = (typeof predictionMarketCategories)[number];
type Selection = { marketId: string; player: string };
type PredictionSelection = { marketId: string; outcome: PredictionOutcome };
const bettingViews: readonly BettingView[] = ["markets", "mine", "all", "suggestions"];
const predictionDisplayModeSchema = z.enum(["book", "market"]);
const predictionDisplayModeStorageKey = "betting:prediction-display-mode";
const defaultMarketCategory = "AWC Round of 16";
const predictionMarketCategories = [
  "AWC Round of 16",
  "2026 AWC Champion",
  "Ban",
  "Shield",
  "2027 AWC",
] as const;
const predictionGroupIdByCategory: Record<PredictionMarketCategory, string> = {
  "AWC Round of 16": "awc-2026-round-of-16",
  "2026 AWC Champion": "awc-2026-champion",
  "2027 AWC": "awc-2027-champion",
  Ban: "ban-2026",
  Shield: "november-atomic-shield-2026",
};
const isAwcWinnerCategory = (category: string): boolean =>
  category === "2026 AWC Champion" || category === "2027 AWC";
const winnerNoMarketId = AWC_NOT_TO_WIN_MARKET_ID;
const marketCategorySlug = (category: string): string => {
  const normalizedCategory = category
    .trim()
    .toLowerCase()
    .replace(/^awc\s+/, "");
  const numberedRound = /^round of (\d+)$/.exec(normalizedCategory);
  if (numberedRound) return `r${numberedRound[1]}`;
  return normalizedCategory.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
};

const marketCategoryFromSearch = (
  search: string,
  categories: readonly string[] = [defaultMarketCategory, ...predictionMarketCategories],
): string => {
  const requestedMarket = new URLSearchParams(search).get("market") ?? "";
  if (requestedMarket === "markets") return "Ban";
  if (requestedMarket === "champion") return "2026 AWC Champion";
  if (requestedMarket === "2027-awc-winner") return "2027 AWC";
  return (
    categories.find((category) => marketCategorySlug(category) === requestedMarket) ??
    defaultMarketCategory
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

const winnerPositionForMarket = (market: BettingMarket): WinnerPosition =>
  market.id === winnerNoMarketId ? "no" : "yes";

const formatBettingDeadline = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));

const marketAcceptsBets = (market: BettingMarket, now: number): boolean => {
  return market.status === "open" && (!market.closesAt || Date.parse(market.closesAt) > now);
};

export const BettingPage = () => {
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
  const [selection, setSelection] = useState<Selection | null>(null);
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
  const [predictionQuantityInput, setPredictionQuantityInput] = useState("10");
  const [predictionStakeInput, setPredictionStakeInput] = useState("");
  const [predictionStakeTouched, setPredictionStakeTouched] = useState(false);
  const [predictionDisplayMode, setPredictionDisplayMode] =
    usePersistedState<PredictionDisplayMode>(
      predictionDisplayModeStorageKey,
      predictionDisplayModeSchema,
      "book",
    );
  const [stakeInput, setStakeInput] = useState("");
  const [stakeTouched, setStakeTouched] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const betSlipRef = useRef<HTMLElement>(null);
  const betAmountRef = useRef<HTMLInputElement>(null);
  const predictionStakeRef = useRef<HTMLInputElement>(null);

  const bootstrapQuery = useQuery(bettingBootstrapQueryOptions());
  const marketsQuery = useQuery({
    ...bettingMarketsQueryOptions(),
    enabled: bootstrapQuery.isError,
  });
  const predictionCatalogQuery = useQuery({
    ...predictionMarketCatalogQueryOptions(),
    enabled: bootstrapQuery.isError,
  });
  const predictionMarketGroups = useMemo(
    () => predictionCatalogQuery.data ?? [],
    [predictionCatalogQuery.data],
  );
  const predictionMarkets = useMemo(
    () => predictionMarketGroups.flatMap((group) => group.markets),
    [predictionMarketGroups],
  );
  const betsQuery = useQuery({
    ...tournamentBetsQueryOptions(username),
    enabled: isAuthenticated,
  });
  const allBetsQuery = useQuery({
    ...allTournamentBetsQueryOptions(),
    enabled: bootstrapQuery.isError,
  });
  const predictionPositionsQuery = useQuery({
    ...allPredictionPositionsQueryOptions(),
    enabled: bootstrapQuery.isError || bootstrapQuery.data?.predictionPositionsSupported === true,
  });
  const coinSummaryQuery = useQuery({
    ...coinSummaryQueryOptions(username),
    enabled: isAuthenticated,
  });
  const countriesQuery = useQuery(tournamentPlayerCountriesQueryOptions());
  const awcBracketQuery = useQuery({
    ...tournamentBracketQueryOptions("awc2026"),
    enabled: isAuthenticated && marketCategory === "2026 AWC Champion",
  });
  const predictionMarketIds = useMemo(
    () => predictionMarkets.map((market) => market.id),
    [predictionMarkets],
  );
  useEffect(() => {
    if (!bootstrapQuery.data) return;
    const bootstrapMarketIds = bootstrapQuery.data.predictionMarketGroups.flatMap((group) =>
      group.markets.map((market) => market.id),
    );
    queryClient.setQueryData(bettingQueryKeys.markets, bootstrapQuery.data.markets);
    queryClient.setQueryData(bettingQueryKeys.allBets, bootstrapQuery.data.allBets);
    queryClient.setQueryData(
      bettingQueryKeys.predictionPositions,
      bootstrapQuery.data.predictionPositions,
    );
    queryClient.setQueryData(
      predictionMarketCatalogQueryOptions().queryKey,
      bootstrapQuery.data.predictionMarketGroups,
    );
    queryClient.setQueryData(
      predictionMarketBatchQueryOptions(bootstrapMarketIds).queryKey,
      bootstrapQuery.data.predictionMarketStates,
    );
  }, [bootstrapQuery.data, queryClient]);
  const predictionMarketQuery = useQuery({
    ...predictionMarketBatchQueryOptions(predictionMarketIds),
    refetchOnMount: false,
    enabled:
      predictionMarketIds.length > 0 &&
      (isPredictionMarketCategory(marketCategory) ||
        marketCategory === "2026 AWC Champion" ||
        view === "all" ||
        view === "mine"),
  });
  usePredictionMarketRealtime(queryClient, predictionMarketIds, !bootstrapQuery.data);
  const predictionMarketStates = useMemo(
    () => predictionMarketQuery.data ?? [],
    [predictionMarketQuery.data],
  );
  const predictionStateByMarketId = useMemo(
    () => new Map(predictionMarketStates.map((state) => [state.market.id, state])),
    [predictionMarketStates],
  );
  const countryByPlayer = countriesQuery.data ?? {};
  const markets = useMemo(() => marketsQuery.data ?? [], [marketsQuery.data]);
  const currentTime = useMarketDeadlineClock(markets);
  const allHistoryBets = useMemo(
    () =>
      buildBetHistory({
        tournamentBets: allBetsQuery.data ?? [],
        predictionPositions: predictionPositionsQuery.data ?? [],
        predictionMarketGroups,
        predictionMarketStates,
      }),
    [
      allBetsQuery.data,
      predictionMarketGroups,
      predictionMarketStates,
      predictionPositionsQuery.data,
    ],
  );
  const pendingBetCount = useMemo(
    () => allHistoryBets.filter((bet) => bet.status === "open").length,
    [allHistoryBets],
  );
  const openMarkets = useMemo(
    () => markets.filter((market) => marketAcceptsBets(market, currentTime)),
    [currentTime, markets],
  );
  const marketCategories = useMemo(() => {
    const categories = Array.from(
      new Map(
        [...openMarkets]
          .sort((a, b) => a.categoryOrder - b.categoryOrder)
          .map((market) => [market.category, market.categoryOrder]),
      ).keys(),
    );
    const awcRoundOf16Category = categories.find((category) => category === defaultMarketCategory);
    return Array.from(
      new Set([
        ...(awcRoundOf16Category ? [awcRoundOf16Category] : []),
        ...predictionMarketCategories,
        ...categories.filter(
          (category) =>
            category !== "Banned" &&
            category !== "Markets" &&
            category !== "AWC Champion" &&
            category !== defaultMarketCategory,
        ),
      ]),
    );
  }, [openMarkets]);
  const visibleMarkets = useMemo(
    () =>
      isPredictionMarketCategory(marketCategory)
        ? []
        : openMarkets.filter(
            (market) =>
              market.category === marketCategory &&
              (marketCategory !== "AWC Champion" ||
                winnerPositionForMarket(market) === winnerPosition),
          ),
    [marketCategory, openMarkets, winnerPosition],
  );
  const predictionMarketOnlyCategory = marketCategory === "Shield" || marketCategory === "Ban";
  const activePredictionDisplayMode: PredictionDisplayMode = predictionMarketOnlyCategory
    ? "market"
    : predictionDisplayMode;
  const activePredictionGroupId = isPredictionMarketCategory(marketCategory)
    ? predictionGroupIdByCategory[marketCategory]
    : undefined;
  const activePredictionGroup = predictionMarketGroups.find(
    (group) => group.id === activePredictionGroupId,
  );
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
    const displayedOutcome: PredictionOutcome = isAwcWinnerCategory(marketCategory)
      ? winnerPosition
      : "yes";
    return [...definitions].sort((left, right) => {
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
      side: "buy",
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
      )
    : null;
  const marketGroups = useMemo(() => {
    const groups = new Map<string, BettingMarket[]>();
    visibleMarkets
      .filter((market) => !market.id.startsWith("lichess-ban-"))
      .forEach((market) => {
        const group = groups.get(market.roundName) ?? [];
        group.push(market);
        groups.set(market.roundName, group);
      });
    return Array.from(groups.entries());
  }, [visibleMarkets]);
  const selectedMarket = selection
    ? (openMarkets.find((market) => market.id === selection.marketId) ?? null)
    : null;
  const selectedPrice = selectedMarket
    ? (selectedMarket.outcomes.find((outcome) => outcome.player === selection?.player)
        ?.pricePercent ?? 50)
    : 50;
  const selectedCountryCode = selection
    ? (countryByPlayer[selection.player.toLowerCase()] ?? "")
    : "";
  const marketStakeLimit = selectedMarket?.id.startsWith("lichess-ban-") ? 200 : MAX_BET_STAKE;
  const stake = Number(stakeInput);
  const validStake =
    Number.isInteger(stake) && stake >= MIN_BET_AMOUNT && stake <= marketStakeLimit;
  const quote = quoteTournamentBet(validStake ? stake : 0, selectedPrice);
  const myBets = useMemo(
    () =>
      isAuthenticated
        ? buildBetHistory({
            tournamentBets: betsQuery.data ?? [],
            predictionPositions: (predictionPositionsQuery.data ?? []).filter(
              (position) => position.username.toLowerCase() === username.toLowerCase(),
            ),
            predictionMarketGroups,
            predictionMarketStates,
          })
        : [],
    [
      betsQuery.data,
      isAuthenticated,
      predictionMarketGroups,
      predictionMarketStates,
      predictionPositionsQuery.data,
      username,
    ],
  );
  const myPendingBetCount = myBets.filter((bet) => bet.status === "open").length;
  const personalPredictionPnlByMarketId = useMemo(() => predictionPnlByMarketId(myBets), [myBets]);
  const activePredictionGroupPnl = useMemo(() => {
    if (!isAuthenticated || !activePredictionGroup) return null;

    const values = activePredictionGroup.markets
      .map((market) => personalPredictionPnlByMarketId.get(market.id))
      .filter((value): value is number => value !== undefined);
    if (!values.length) return null;

    const total = values.reduce((sum, value) => sum + value, 0);
    return Math.abs(total) >= 0.005 ? total : null;
  }, [activePredictionGroup, isAuthenticated, personalPredictionPnlByMarketId]);
  const balanceLimitedStake = isAuthenticated ? maxTournamentBetStake(balance) : MAX_BET_STAKE;
  const effectiveStakeLimit = Math.min(balanceLimitedStake, marketStakeLimit);
  const bettingUnavailable = isAuthenticated && effectiveStakeLimit < MIN_BET_AMOUNT;
  const selectionIsOpponent =
    selection && selectedMarket && isAuthenticated
      ? isTournamentBetOnOpponent(selectedMarket, username, selection.player)
      : false;
  const selectionIsSelfNotToWin =
    selection && isAuthenticated
      ? isAwcNotToWinSelfBet(selection.marketId, username, selection.player)
      : false;
  const insufficientBalance = isAuthenticated && validStake && quote.totalCost > balance;

  useEffect(() => {
    const syncViewFromHistory = () => {
      setView(bettingViewFromLocation());
      setMarketCategory(marketCategoryFromSearch(window.location.search, marketCategories));
      setWinnerPosition(winnerPositionFromSearch(window.location.search));
      setSelection(null);
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
      if (isAwcWinnerCategory(marketCategory)) {
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
      if (isAwcWinnerCategory(marketCategory)) {
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
    if (nextCategory === marketCategory) return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("view", "markets");
    nextUrl.searchParams.set("market", marketCategorySlug(nextCategory));
    if (isAwcWinnerCategory(nextCategory)) {
      nextUrl.searchParams.set("side", winnerPosition);
    } else {
      nextUrl.searchParams.delete("side");
    }
    window.history.pushState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    setMarketCategory(nextCategory);
    setSelection(null);
    setPredictionSelection(null);
    setExpandedPredictionMarketId(null);
  };

  const selectWinnerPosition = (nextPosition: WinnerPosition) => {
    if (nextPosition === winnerPosition) return;
    setWinnerPosition(nextPosition);
    setSelection(null);
    setPredictionSelection(null);
  };

  const placeBetMutation = useMutation({
    mutationFn: placeTournamentBet,
    onSuccess: async (result, variables) => {
      const placedCost = quoteTournamentBet(variables.stake, result.bet.priceCents).totalCost;
      setSuccessMessage(
        `Bet placed on ${result.bet.selection} for ${formatCoinValue(placedCost)} coins.`,
      );
      setStakeInput("");
      setStakeTouched(false);
      updateCachedCoinBalance(queryClient, username, result.balance);
      await queryClient.invalidateQueries({ queryKey: bettingQueryKeys.bets(username) });
      await queryClient.invalidateQueries({ queryKey: bettingQueryKeys.allBets });
    },
  });

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

  if (marketsQuery.isPending && markets.length === 0) return <RouteLoadingFallback />;

  const chooseOutcome = (marketId: string, player: string) => {
    setSelection({ marketId, player });
    setSuccessMessage("");
    placeBetMutation.reset();
    const isMobile = window.matchMedia("(max-width: 760px)").matches;
    if (isMobile) {
      window.setTimeout(() => {
        betSlipRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    } else {
      window.setTimeout(() => betAmountRef.current?.focus(), 0);
    }
  };

  const choosePredictionOutcome = (
    marketId: string,
    outcome: PredictionOutcome,
    suggestedPrice: number,
  ) => {
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
      selectedPredictionRestriction ||
      !selectedPredictionOpen
    )
      return;
    placePredictionMutation.mutate({
      marketId: predictionSelection.marketId,
      outcome: predictionSelection.outcome,
      side: "buy",
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
      marketId: predictionSelection.marketId,
      outcome: predictionSelection.outcome,
      side: "buy",
      priceCents: predictionPrice,
      quantity: predictionSportsbookQuantity,
    });
  };

  const submitBet = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMarket || !selection || !validStake || selectionIsOpponent || insufficientBalance)
      return;
    setSuccessMessage("");
    placeBetMutation.mutate({
      marketId: selectedMarket.id,
      selection: selection.player,
      stake,
    });
  };

  return (
    <div className="sitePage bettingPage">
      <Seo
        title="Betting"
        description="Use Atomic Coins to make fixed-price predictions."
        path="/betting"
      />
      <div className="bettingPanel">
        <header className="bettingHeader">
          <div>
            <h1>Betting</h1>
            <nav className="bettingHeaderLinks" aria-label="Betting links">
              <Link
                to="/tournaments/$tournamentId/$tournamentTab"
                params={{ tournamentId: "awc2026", tournamentTab: "main" }}
              >
                View bracket
              </Link>
            </nav>
          </div>
          <BettingAccountSummary />
        </header>

        <div className="bettingTabs" role="tablist" aria-label="Betting views">
          <button
            type="button"
            role="tab"
            aria-selected={view === "markets"}
            onClick={() => selectView("markets")}
          >
            Markets
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "mine"}
            onClick={() => selectView("mine")}
          >
            My bets{myPendingBetCount ? ` (${myPendingBetCount})` : ""}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "all"}
            onClick={() => selectView("all")}
          >
            All bets{allBetsQuery.data ? ` (${pendingBetCount})` : ""}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "suggestions"}
            onClick={() => selectView("suggestions")}
          >
            Suggestions
          </button>
        </div>

        {marketsQuery.error ? (
          <InlineState kind="error">
            {getErrorMessage(marketsQuery.error, "Unable to load betting markets.")}
          </InlineState>
        ) : null}

        {view === "markets" ? (
          <section
            className={`bettingMarketView${
              isPredictionMarketCategory(marketCategory) ? " bettingMarketView--exchange" : ""
            }`}
            role="tabpanel"
          >
            <div className="bettingMarketColumn">
              <div className="bettingCategories" aria-label="Market categories">
                {marketCategories.map((category) => (
                  <button
                    type="button"
                    aria-pressed={marketCategory === category}
                    onClick={() => selectMarketCategory(category)}
                    key={category}
                  >
                    {category}
                  </button>
                ))}
              </div>
              {activePredictionGroup && !predictionMarketOnlyCategory ? (
                <div className="bettingPredictionViewControl">
                  <div
                    className="bettingPredictionModeToggle"
                    role="group"
                    aria-label="Betting view"
                  >
                    {(["book", "market"] as const).map((mode) => (
                      <button
                        type="button"
                        aria-pressed={predictionDisplayMode === mode}
                        onClick={() => {
                          setPredictionDisplayMode(mode);
                          setExpandedPredictionMarketId(null);
                          setPredictionSelection(null);
                          setSuccessMessage("");
                        }}
                        key={mode}
                      >
                        {predictionDisplayMode === mode ? (
                          <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
                        ) : null}
                        {mode === "book" ? "Sportsbook view" : "Order book view"}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="bettingMarketList">
                {activePredictionGroup && activePredictionDisplayMode === "book" ? (
                  <section
                    className={`bettingMarketGroup bettingPredictionBookGroup${
                      activePredictionGroup.id === "awc-2026-round-of-16"
                        ? " bettingPredictionBookGroup--singleColumn"
                        : ""
                    }`}
                  >
                    <PredictionMarketGroupHeader
                      iconSrc={
                        activePredictionGroup.id === "november-atomic-shield-2026"
                          ? appAssetPath("/images/arenas/atomic-shield.png")
                          : undefined
                      }
                      isLoading={activePredictionGroupLoading}
                      isOpen={activePredictionGroupOpen}
                      middle={
                        isAwcWinnerCategory(marketCategory) ? (
                          <div
                            className="bettingPositionToggle"
                            role="group"
                            aria-label="AWC winner side"
                          >
                            <button
                              type="button"
                              aria-pressed={winnerPosition === "yes"}
                              onClick={() => selectWinnerPosition("yes")}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              aria-pressed={winnerPosition === "no"}
                              onClick={() => selectWinnerPosition("no")}
                            >
                              No
                            </button>
                          </div>
                        ) : undefined
                      }
                      path={activePredictionGroup.path}
                      pnl={activePredictionGroupPnl}
                      showExplainer={false}
                      title={activePredictionGroup.title}
                      volume={formatCoinValue(activePredictionVolume)}
                    />
                    {sortedActivePredictionMarkets.map((definition) => {
                      const state = predictionStateByMarketId.get(definition.id);
                      const yesAsk = state?.book.yes.asks[0]?.priceCents;
                      const noAsk = state?.book.no.asks[0]?.priceCents;
                      const isResolved = state?.market.status === "resolved";
                      if (isResolved) {
                        const userProfit = personalPredictionPnlByMarketId.get(definition.id);
                        const resolvedOutcome = state.market.outcome ?? "no";
                        const settlementPrice = state.market.settlementPriceCents;
                        const invertChampionOutcome =
                          isAwcWinnerCategory(marketCategory) && winnerPosition === "no";
                        const displayedResolvedOutcome = invertChampionOutcome
                          ? resolvedOutcome === "yes"
                            ? "no"
                            : "yes"
                          : resolvedOutcome;
                        const displayedSettlementPrice =
                          settlementPrice === null
                            ? null
                            : invertChampionOutcome
                              ? 100 - settlementPrice
                              : settlementPrice;
                        return (
                          <article className="bettingPredictionBookResolvedRow" key={definition.id}>
                            <PredictionResolvedMarket
                              definition={definition}
                              density="compact"
                              displayedOutcome={displayedResolvedOutcome}
                              displayedSettlementPriceCents={displayedSettlementPrice}
                              pnl={userProfit}
                              state={state}
                            />
                          </article>
                        );
                      }
                      const sportsbookOutcome: PredictionOutcome = isAwcWinnerCategory(
                        marketCategory,
                      )
                        ? winnerPosition
                        : "yes";
                      const compactSportsbookCard =
                        isAwcWinnerCategory(marketCategory) || marketCategory === "Ban";
                      const sportsbookOutcomes = compactSportsbookCard
                        ? [sportsbookOutcome]
                        : predictionOutcomes;
                      return (
                        <article className="bettingMarketCard" key={definition.id}>
                          <div
                            className={`bettingOutcomes${
                              compactSportsbookCard ? " bettingPredictionBookOutcome" : ""
                            }`}
                          >
                            {sportsbookOutcomes.map((entry) => {
                              const entryPrice = entry === "yes" ? yesAsk : noAsk;
                              const entrySuggestedPrice = suggestedPredictionPrice(
                                definition,
                                state,
                                entry,
                              );
                              const entrySelected =
                                predictionSelection?.marketId === definition.id &&
                                predictionSelection.outcome === entry;
                              const entryRestriction = predictionRestrictionFor(
                                activePredictionGroup.id,
                                definition.username,
                                entry,
                              );
                              const entryCountryCode = compactSportsbookCard
                                ? definition.countryCode
                                : predictionOutcomeCountryCode(definition, entry);
                              const entryLabel = compactSportsbookCard
                                ? definition.username
                                : predictionOutcomeLabel(definition, entry);
                              return (
                                <button
                                  type="button"
                                  className={entrySelected ? "isSelected" : ""}
                                  aria-pressed={entrySelected}
                                  disabled={Boolean(entryRestriction) || entryPrice === undefined}
                                  title={
                                    predictionRestrictionTitle(entryRestriction) ??
                                    (entryPrice === undefined
                                      ? "No liquidity is available."
                                      : undefined)
                                  }
                                  onClick={() =>
                                    choosePredictionOutcome(
                                      definition.id,
                                      entry,
                                      entrySuggestedPrice,
                                    )
                                  }
                                  key={entry}
                                >
                                  <span className="bettingOutcomePlayer">
                                    <img
                                      src={countryCodeToFlagUrl(entryCountryCode)}
                                      alt=""
                                      crossOrigin="anonymous"
                                      loading="lazy"
                                      decoding="async"
                                      aria-hidden="true"
                                    />
                                    <span>{entryLabel}</span>
                                  </span>
                                  <span className="bettingOutcomeQuote">
                                    <strong>{formatPredictionChance(entryPrice)}</strong>
                                    {entryRestriction ? (
                                      <small>Unavailable</small>
                                    ) : entryPrice === undefined ? (
                                      <small>No liquidity</small>
                                    ) : marketCategory === "Ban" ? (
                                      <small>to be banned</small>
                                    ) : null}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </article>
                      );
                    })}
                  </section>
                ) : null}
                {activePredictionGroup && activePredictionDisplayMode === "market" ? (
                  <section className="bettingExchangeGroup">
                    {[activePredictionGroup].map((group) => (
                      <div
                        className="bettingExchangeCard bettingExchangeCard--strikes"
                        key={group.id}
                      >
                        <PredictionMarketGroupHeader
                          iconSrc={
                            group.id === "november-atomic-shield-2026"
                              ? appAssetPath("/images/arenas/atomic-shield.png")
                              : undefined
                          }
                          isLoading={activePredictionGroupLoading}
                          isOpen={activePredictionGroupOpen}
                          path={group.path}
                          pnl={activePredictionGroupPnl}
                          title={group.title}
                          volume={formatCoinValue(activePredictionVolume)}
                        />
                        <PredictionMarketTable
                          activeMarketId={predictionSelection?.marketId}
                          definitions={group.markets}
                          density="compact"
                          expandedMarketId={expandedPredictionMarketId}
                          expandedOutcome={expandedPredictionOutcome}
                          isAuthenticated={isAuthenticated}
                          resolvedPnlByMarketId={personalPredictionPnlByMarketId}
                          states={predictionStateByMarketId}
                          selectedOutcome={predictionSelection?.outcome}
                          onToggleMarket={(definition) => togglePredictionStrike(definition.id)}
                          onSelectOutcome={(definition, outcome, suggestedPrice) =>
                            choosePredictionOutcome(definition.id, outcome, suggestedPrice)
                          }
                          outcomeAvailability={(definition, outcome) => {
                            const restriction = predictionRestrictionFor(
                              group.id,
                              definition.username,
                              outcome,
                            );
                            return {
                              disabled: Boolean(restriction),
                              title: predictionRestrictionTitle(restriction),
                            };
                          }}
                          renderExpandedContent={(definition, state, outcome) => (
                            <PredictionOrderBook
                              asks={state.book[outcome].asks}
                              bids={state.book[outcome].bids}
                              density="compact"
                              headingLevel={2}
                              outcome={outcome}
                              outcomeName={predictionOutcomeLabel(definition, outcome)}
                              ownOrders={state.orders}
                              onEditOrders={(orders) =>
                                setEditingOrderContext({
                                  marketId: definition.id,
                                  outcome,
                                  orders,
                                })
                              }
                              onSelect={(side, priceCents, quantity) => {
                                choosePredictionOutcome(definition.id, outcome, priceCents);
                                if (side === "ask") {
                                  setPredictionQuantityInput(String(quantity));
                                }
                              }}
                            />
                          )}
                        />
                      </div>
                    ))}
                  </section>
                ) : null}
                {marketGroups.length ? (
                  marketGroups.map(([roundName, roundMarkets]) => (
                    <section className="bettingMarketGroup" key={roundName}>
                      <h2>
                        {marketCategory === "AWC Champion" ? "Who will win 2026 AWC" : roundName}
                      </h2>
                      {roundMarkets.map((market, marketIndex) => (
                        <article className="bettingMarketCard" key={market.id}>
                          {market.closesAt &&
                          (marketIndex === 0 ||
                            market.closesAt !== roundMarkets[marketIndex - 1]?.closesAt) ? (
                            <p className="bettingMarketDeadline">
                              <span>Bets close</span>
                              <time dateTime={market.closesAt}>
                                {formatBettingDeadline(market.closesAt)}
                              </time>
                            </p>
                          ) : null}
                          <div className="bettingOutcomes">
                            {market.outcomes.map((outcome) => {
                              const isSelected =
                                selection?.marketId === market.id &&
                                selection.player === outcome.player;
                              const isOwnOutcome =
                                isAuthenticated &&
                                outcome.player.toLowerCase() === username.toLowerCase();
                              const isOpponentOutcome =
                                isAuthenticated &&
                                isTournamentBetOnOpponent(market, username, outcome.player);
                              const isSelfNotToWinOutcome =
                                isAuthenticated &&
                                isAwcNotToWinSelfBet(market.id, username, outcome.player);
                              const unavailableReason = isSelfNotToWinOutcome
                                ? "You can’t bet on yourself not to win AWC."
                                : isOpponentOutcome
                                  ? "You can’t bet on your opponent."
                                  : undefined;
                              const countryCode =
                                countryByPlayer[outcome.player.toLowerCase()] ?? "";
                              return (
                                <button
                                  type="button"
                                  className={isSelected ? "isSelected" : ""}
                                  aria-pressed={isSelected}
                                  disabled={Boolean(unavailableReason)}
                                  title={unavailableReason}
                                  onClick={() => chooseOutcome(market.id, outcome.player)}
                                  key={outcome.player}
                                >
                                  <span className="bettingOutcomePlayer">
                                    <img
                                      src={countryCodeToFlagUrl(countryCode)}
                                      alt={
                                        countryCode ? `${countryCode} flag` : "Country unavailable"
                                      }
                                      crossOrigin="anonymous"
                                      loading="lazy"
                                      decoding="async"
                                    />
                                    <span>{outcome.player}</span>
                                  </span>
                                  <span className="bettingOutcomeQuote">
                                    <strong>
                                      {market.id.startsWith("lichess-ban-") ? "Yes · " : ""}
                                      {outcome.pricePercent}%
                                    </strong>
                                    {isSelfNotToWinOutcome ? (
                                      <small>Your outcome</small>
                                    ) : isOpponentOutcome ? (
                                      <small>Your opponent</small>
                                    ) : isOwnOutcome ? (
                                      <small>Your outcome</small>
                                    ) : null}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </article>
                      ))}
                    </section>
                  ))
                ) : !isPredictionMarketCategory(marketCategory) ? (
                  <InlineState kind="empty">No AWC 2026 markets are open.</InlineState>
                ) : null}
              </div>
            </div>

            <aside
              className={`betSlip${
                activePredictionGroup && activePredictionDisplayMode === "market"
                  ? " betSlip--predictionOrder"
                  : ""
              }`}
              aria-labelledby="bet-slip-title"
              ref={betSlipRef}
            >
              <h2
                id="bet-slip-title"
                className={
                  activePredictionGroup && activePredictionDisplayMode === "market"
                    ? "betSlipVisuallyHiddenTitle"
                    : undefined
                }
              >
                {activePredictionGroup && activePredictionDisplayMode === "book"
                  ? "Sportsbook bet"
                  : "Bet slip"}
              </h2>
              {activePredictionGroup ? (
                selectedPredictionDefinition && predictionSelection ? (
                  <form
                    onSubmit={
                      activePredictionDisplayMode === "book"
                        ? submitPredictionSportsbookBet
                        : submitPredictionOrder
                    }
                  >
                    {activePredictionDisplayMode === "book" ? (
                      <div className="betSlipSelection">
                        {activePredictionDisplayMode === "book" ? (
                          <small>{selectedPredictionGroup?.title ?? "Prediction market"}</small>
                        ) : null}
                        <div className="betSlipContract">
                          <span>
                            <img
                              src={countryCodeToFlagUrl(
                                predictionOutcomeCountryCode(
                                  selectedPredictionDefinition,
                                  predictionSelection.outcome,
                                ),
                              )}
                              alt=""
                              crossOrigin="anonymous"
                              aria-hidden="true"
                            />
                            <strong>
                              {predictionOutcomeLabel(
                                selectedPredictionDefinition,
                                predictionSelection.outcome,
                              )}
                            </strong>
                            {activePredictionDisplayMode === "book" ? (
                              <em>
                                {selectedPredictionGroup?.id === "awc-2026-champion" ||
                                selectedPredictionGroup?.id === "awc-2027-champion"
                                  ? predictionSelection.outcome === "yes"
                                    ? "to win"
                                    : "not to win"
                                  : selectedPredictionGroup?.id === "awc-2026-round-of-16"
                                    ? "to win"
                                    : selectedPredictionGroup?.id === "ban-2026"
                                      ? predictionSelection.outcome === "yes"
                                        ? "banned"
                                        : "not banned"
                                      : predictionSelection.outcome === "yes"
                                        ? "to win"
                                        : "not to win"}
                              </em>
                            ) : null}
                          </span>
                          {activePredictionDisplayMode === "book" ? (
                            <b>{validPredictionPrice ? `${predictionPrice}%` : "—"}</b>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {activePredictionDisplayMode === "book" ? (
                      <>
                        <label htmlFor="prediction-sportsbook-stake">Bet amount</label>
                        <div className="betAmountField">
                          <input
                            ref={predictionStakeRef}
                            id="prediction-sportsbook-stake"
                            type="number"
                            inputMode="numeric"
                            min={MIN_BET_AMOUNT}
                            max={predictionSportsbookStakeLimit}
                            step="1"
                            placeholder="0"
                            value={predictionStakeInput}
                            onChange={(event) => {
                              setPredictionStakeInput(event.target.value);
                              setPredictionStakeTouched(true);
                            }}
                            aria-describedby="prediction-sportsbook-help"
                          />
                          <span>coins</span>
                        </div>
                        <small id="prediction-sportsbook-help" className="betSlipHelp">
                          Your bet fills immediately at the displayed price. A 2% taker fee applies.
                        </small>
                        <dl className="betQuote">
                          <div>
                            <dt>Average price</dt>
                            <dd>
                              {predictionSportsbookQuote.averageFillPriceCents === undefined
                                ? "—"
                                : `${predictionSportsbookQuote.averageFillPriceCents.toFixed(1)}¢`}
                            </dd>
                          </div>
                          <div>
                            <dt>Payout if correct</dt>
                            <dd>
                              {predictionSportsbookQuantity > 0
                                ? `${predictionSportsbookQuantity.toLocaleString()} coins`
                                : "—"}
                            </dd>
                          </div>
                          <div className="betQuoteTotal">
                            <dt>Total cost</dt>
                            <dd>
                              {validPredictionStake && predictionSportsbookFullyMatched
                                ? `${formatCoinValue(predictionSportsbookTotal)} coins`
                                : "—"}
                            </dd>
                          </div>
                          <div className="betQuoteFee">
                            <dt>Includes 2% fee</dt>
                            <dd>
                              {validPredictionStake && predictionSportsbookFullyMatched
                                ? `${formatCoinValue(predictionSportsbookFee)} coins`
                                : "—"}
                            </dd>
                          </div>
                        </dl>
                        {predictionStakeTouched && !validPredictionStake ? (
                          <InlineState kind="error">
                            {`Enter a whole coin amount from ${MIN_BET_AMOUNT} to ${predictionSportsbookStakeLimit}.`}
                          </InlineState>
                        ) : null}
                        {validPredictionStake && predictionSportsbookQuantity === 0 ? (
                          <InlineState kind="error">
                            Increase the bet amount to buy at least one contract.
                          </InlineState>
                        ) : null}
                        {validPredictionStake &&
                        predictionSportsbookQuantity > 0 &&
                        !predictionSportsbookFullyMatched ? (
                          <InlineState kind="error">
                            {predictionSportsbookQuote.availableQuantity > 0
                              ? `Only ${predictionSportsbookQuote.availableQuantity.toLocaleString()} contracts are available at this price. Lower the bet amount or use Order book view.`
                              : "No contracts are available at this price. Use Order book view to place a limit order."}
                          </InlineState>
                        ) : null}
                        {predictionSportsbookInsufficientBalance ? (
                          <InlineState kind="error">
                            You need {formatCoinValue(predictionSportsbookTotal)} coins including
                            the fee.
                          </InlineState>
                        ) : null}
                      </>
                    ) : (
                      <PredictionOrderComposer
                        definition={selectedPredictionDefinition}
                        density="compact"
                        idPrefix="prediction-betting-order"
                        outcome={predictionSelection.outcome}
                        outcomePrices={{
                          yes: selectedPredictionState?.book.yes.asks[0]?.priceCents,
                          no: selectedPredictionState?.book.no.asks[0]?.priceCents,
                        }}
                        quantityInput={predictionQuantityInput}
                        priceInput={predictionPriceInput}
                        primaryLabel="Cost"
                        primaryValue={
                          validPredictionPrice && validPredictionQuantity
                            ? `${formatCoinValue(predictionEstimatedTotal)} coins`
                            : "—"
                        }
                        secondaryLabel="Max payout"
                        secondaryValue={
                          validPredictionQuantity
                            ? `${predictionQuantity.toLocaleString()} coins`
                            : "—"
                        }
                        secondaryNote={
                          validPredictionPrice && validPredictionQuantity ? (
                            <span
                              className={
                                predictionEstimatedProfit >= 0 ? "isPositive" : "isNegative"
                              }
                            >
                              {predictionEstimatedProfit >= 0 ? "+" : ""}
                              {formatCoinValue(predictionEstimatedProfit)} coins
                            </span>
                          ) : undefined
                        }
                        onOutcomeChange={(entry) =>
                          choosePredictionOutcome(
                            selectedPredictionDefinition.id,
                            entry,
                            suggestedPredictionPrice(
                              selectedPredictionDefinition,
                              selectedPredictionState,
                              entry,
                            ),
                          )
                        }
                        onQuantityChange={setPredictionQuantityInput}
                        onPriceChange={setPredictionPriceInput}
                      />
                    )}
                    {placePredictionMutation.error ? (
                      <InlineState kind="error">
                        {getErrorMessage(
                          placePredictionMutation.error,
                          "Unable to place this order.",
                        )}
                      </InlineState>
                    ) : null}
                    {selectedPredictionRestriction ? (
                      <InlineState kind="error">
                        {predictionOrderRestrictionMessage(selectedPredictionRestriction)}
                      </InlineState>
                    ) : null}
                    {successMessage ? (
                      <InlineState kind="success">{successMessage}</InlineState>
                    ) : null}
                    {activePredictionDisplayMode === "book" ? (
                      isAuthenticated ? (
                        <button
                          className="betSubmitButton"
                          type="submit"
                          disabled={
                            !validPredictionPrice ||
                            !validPredictionStake ||
                            !predictionSportsbookFullyMatched ||
                            predictionSportsbookInsufficientBalance ||
                            Boolean(selectedPredictionRestriction) ||
                            !selectedPredictionOpen ||
                            placePredictionMutation.isPending
                          }
                        >
                          {placePredictionMutation.isPending
                            ? "Placing bet…"
                            : validPredictionStake && predictionSportsbookFullyMatched
                              ? `Place bet · ${formatCoinValue(predictionSportsbookTotal)} coins`
                              : "Place bet"}
                        </button>
                      ) : (
                        <button
                          className="betSubmitButton"
                          type="button"
                          disabled={authLoading}
                          onClick={() => void login("/betting")}
                        >
                          Log in to bet
                        </button>
                      )
                    ) : isAuthenticated ? (
                      <button
                        className="betSubmitButton bettingPredictionOrderSubmit"
                        type="submit"
                        disabled={
                          !validPredictionPrice ||
                          !validPredictionQuantity ||
                          Boolean(selectedPredictionRestriction) ||
                          !selectedPredictionOpen ||
                          placePredictionMutation.isPending
                        }
                      >
                        {placePredictionMutation.isPending
                          ? "Placing order…"
                          : `${predictionBuyQuote.filledQuantity > 0 ? "Buy" : "Bid"} ${selectedPredictionOutcome === "yes" ? "Yes" : "No"} · ${validPredictionPrice ? `${predictionPrice}¢` : "—"}`}
                      </button>
                    ) : (
                      <button
                        className="betSubmitButton bettingPredictionOrderSubmit"
                        type="button"
                        disabled={authLoading}
                        onClick={() => void login("/betting")}
                      >
                        Log in to trade
                      </button>
                    )}
                  </form>
                ) : (
                  <p className="betSlipEmpty">
                    {activePredictionDisplayMode === "book"
                      ? "Choose an outcome to add it to the bet slip."
                      : "Choose Yes or No beside a player to start an order."}
                  </p>
                )
              ) : selectedMarket && selection ? (
                <form onSubmit={submitBet}>
                  <div className="betSlipSelection">
                    <small>
                      {selectedMarket.marketKind === "outright"
                        ? selectedMarket.label
                        : `${selectedMarket.roundName} · ${selectedMarket.label}`}
                    </small>
                    <div className="betSlipContract">
                      <span>
                        <img
                          src={countryCodeToFlagUrl(selectedCountryCode)}
                          alt={
                            selectedCountryCode
                              ? `${selectedCountryCode} flag`
                              : "Country unavailable"
                          }
                          crossOrigin="anonymous"
                        />
                        <strong>{selection.player}</strong>
                        <em>
                          {selectedMarket.id.startsWith("lichess-ban-")
                            ? "Yes"
                            : selectedMarket.id === winnerNoMarketId
                              ? "not to win"
                              : "to win"}
                        </em>
                      </span>
                      <b>{selectedPrice}%</b>
                    </div>
                  </div>
                  <label htmlFor="bet-stake">Amount</label>
                  <div className="betAmountField">
                    <input
                      ref={betAmountRef}
                      id="bet-stake"
                      type="number"
                      inputMode="numeric"
                      min={MIN_BET_AMOUNT}
                      max={effectiveStakeLimit}
                      step="1"
                      placeholder="0"
                      value={stakeInput}
                      onChange={(event) => {
                        setStakeInput(event.target.value);
                        setStakeTouched(true);
                      }}
                      aria-describedby="bet-stake-help"
                    />
                    <span>coins</span>
                  </div>
                  <small id="bet-stake-help">
                    {isAuthenticated
                      ? `Max bet: ${formatCoinValue(effectiveStakeLimit)} coins`
                      : "Log in to see max bet"}
                  </small>

                  <dl className="betQuote">
                    <div>
                      <dt>Potential payout</dt>
                      <dd>{validStake ? formatCoinValue(quote.potentialPayout) : "—"}</dd>
                    </div>
                    <div className="betQuoteTotal">
                      <dt>Total cost</dt>
                      <dd>{validStake ? formatCoinValue(quote.totalCost) : "—"}</dd>
                    </div>
                    <div className="betQuoteFee">
                      <dt>Includes 2% fee</dt>
                      <dd>{validStake ? formatCoinValue(quote.fee) : "—"}</dd>
                    </div>
                  </dl>

                  {stakeTouched && !validStake ? (
                    <InlineState kind="error">
                      Enter a whole coin amount from 1 to {formatCoinValue(marketStakeLimit)}.
                    </InlineState>
                  ) : null}
                  {insufficientBalance ? (
                    <InlineState kind="error">
                      You need {formatCoinValue(quote.totalCost)} coins including the fee.
                    </InlineState>
                  ) : null}
                  {bettingUnavailable ? (
                    <InlineState kind="info">
                      You do not have enough coins to place this bet.
                    </InlineState>
                  ) : null}
                  {selectionIsOpponent ? (
                    <InlineState kind="error">
                      You can’t bet on your opponent. Choose another outcome.
                    </InlineState>
                  ) : null}
                  {selectionIsSelfNotToWin ? (
                    <InlineState kind="error">
                      You can’t bet on yourself not to win AWC. Choose another player.
                    </InlineState>
                  ) : null}
                  {placeBetMutation.error ? (
                    <InlineState kind="error">
                      {getErrorMessage(placeBetMutation.error, "Unable to place your bet.")}
                    </InlineState>
                  ) : null}
                  {successMessage ? (
                    <InlineState kind="success">{successMessage}</InlineState>
                  ) : null}

                  {isAuthenticated ? (
                    <button
                      className="betSubmitButton"
                      type="submit"
                      disabled={
                        !validStake ||
                        insufficientBalance ||
                        bettingUnavailable ||
                        selectionIsOpponent ||
                        selectionIsSelfNotToWin ||
                        placeBetMutation.isPending
                      }
                    >
                      {placeBetMutation.isPending
                        ? "Placing bet…"
                        : validStake
                          ? `Place bet · ${formatCoinValue(quote.totalCost)} coins`
                          : "Place bet"}
                    </button>
                  ) : (
                    <button
                      className="betSubmitButton"
                      type="button"
                      disabled={authLoading}
                      onClick={() => void login("/betting")}
                    >
                      Log in to bet
                    </button>
                  )}
                </form>
              ) : (
                <p className="betSlipEmpty">Choose a player to see the exact cost and payout.</p>
              )}
            </aside>
          </section>
        ) : view === "suggestions" ? (
          <BettingSuggestions
            isAuthenticated={isAuthenticated}
            authLoading={authLoading}
            onLogin={() => void login("/betting")}
          />
        ) : (
          <BettingHistory
            key={view}
            view={view}
            isAuthenticated={isAuthenticated}
            authLoading={authLoading}
            onLogin={() => void login("/betting")}
            myBets={myBets}
            allBets={allHistoryBets}
            markets={markets}
            predictionMarketGroups={predictionMarketGroups}
            predictionMarketStates={predictionMarketStates}
            countryByPlayer={countryByPlayer}
            myBetsLoading={betsQuery.isPending || predictionPositionsQuery.isPending}
            allBetsLoading={allBetsQuery.isPending || predictionPositionsQuery.isPending}
            myBetsError={betsQuery.error ?? predictionPositionsQuery.error}
            allBetsError={allBetsQuery.error ?? predictionPositionsQuery.error}
          />
        )}
      </div>
      {editingOrderContext ? (
        <PredictionOrderEditor
          marketId={editingOrderContext.marketId}
          outcome={editingOrderContext.outcome}
          orders={editingOrderContext.orders}
          onClose={() => setEditingOrderContext(null)}
          onUpdated={(result) => {
            updateCachedCoinBalance(queryClient, username, result.balance);
            patchPredictionMarketState(queryClient, result.state);
            void queryClient.invalidateQueries({ queryKey: bettingQueryKeys.predictionPositions });
          }}
        />
      ) : null}
    </div>
  );
};
