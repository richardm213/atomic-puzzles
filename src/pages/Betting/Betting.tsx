import "./Betting.css";

import { faPlus, faThumbsDown, faThumbsUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { InlineState } from "../../components/InlineState/InlineState";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { usePersistedState } from "../../hooks/usePersistedState";
import { useUnderscoreUsernameCutoff } from "../../hooks/useUnderscoreUsernameCutoff";
import {
  AWC_NOT_TO_WIN_MARKET_ID,
  BET_NET_WORTH_LIMIT_RATE,
  type BettingMarket,
  findCurrentTournamentOpponent,
  isAwcNotToWinSelfBet,
  isRestrictedAwcChampionOrder,
  isTournamentBetOnOpponent,
  type MarketSuggestion,
  MAX_BET_STAKE,
  maxTournamentBetStake,
  MIN_BET_AMOUNT,
  placeTournamentBet,
  predictionOrderRestrictionMessage,
  quoteTournamentBet,
  suggestMarket,
  type TournamentBet,
  voteOnMarketSuggestion,
} from "../../lib/betting/betting";
import {
  allTournamentBetsQueryOptions,
  bettingMarketsQueryOptions,
  bettingQueryKeys,
  marketSuggestionsQueryOptions,
  tournamentBetsQueryOptions,
} from "../../lib/betting/bettingQueries";
import { formatCoinBalance } from "../../lib/coins/coinDisplay";
import { coinQueryKeys, coinSummaryQueryOptions } from "../../lib/coins/coinQueries";
import {
  tournamentBracketQueryOptions,
  tournamentPlayerCountriesQueryOptions,
} from "../../lib/matches/tournamentQueries";
import {
  predictionMarketCatalogQueryOptions,
  predictionMarketQueryOptions,
  predictionMarketQueryRoot,
} from "../../lib/predictionMarkets/predictionMarketQueries";
import { usePredictionMarketRealtime } from "../../lib/predictionMarkets/predictionMarketRealtime";
import {
  placePredictionOrder,
  type PredictionMarketState,
  predictionMarketVolume,
  type PredictionOutcome,
  predictionOutcomes,
  predictionTakerFee,
  predictionYesChance,
  quotePredictionBuy,
  suggestedPredictionPrice,
} from "../../lib/predictionMarkets/predictionMarkets";
import { appAssetPath } from "../../utils/appAssetPath";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { formatLocalDateTime } from "../../utils/formatters";

type BettingView = "markets" | "mine" | "all" | "suggestions";
type WinnerPosition = "yes" | "no";
type PredictionDisplayMode = "book" | "market";
type PredictionMarketCategory = (typeof predictionMarketCategories)[number];
type Selection = { marketId: string; player: string };
type PredictionSelection = { marketId: string; outcome: PredictionOutcome };
type SuggestionDraftOutcome = { label: string; odds: string };
type BetHistoryEntry = TournamentBet & {
  kind?: "prediction";
  predictionUsername?: string;
  predictionMarketTitle?: string | undefined;
  predictionSettlementPriceCents?: number | undefined;
};

const bettingViews: readonly BettingView[] = ["markets", "mine", "all", "suggestions"];
const predictionDisplayModeSchema = z.enum(["book", "market"]);
const predictionDisplayModeStorageKey = "betting:prediction-display-mode";
const defaultMarketCategory = "AWC Round of 16";
const predictionMarketCategories = ["AWC Champion", "Ban", "Shield"] as const;
const predictionGroupIdByCategory: Record<PredictionMarketCategory, string> = {
  "AWC Champion": "awc-2026-champion",
  Ban: "ban-2026",
  Shield: "november-atomic-shield-2026",
};
const winnerNoMarketId = AWC_NOT_TO_WIN_MARKET_ID;
const defaultSuggestionOutcomes = (): SuggestionDraftOutcome[] => [
  { label: "", odds: "50" },
  { label: "", odds: "50" },
];

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

const formatBetCoins = (value: number): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

const formatBettingDeadline = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));

const QuickPredictionOrderBook = ({
  state,
  outcome,
  onSelectPrice,
}: {
  state: PredictionMarketState;
  outcome: PredictionOutcome;
  onSelectPrice: (priceCents: number) => void;
}) => {
  const book = state.book[outcome];
  const renderLevels = (levels: typeof book.asks, side: "ask" | "bid") => {
    if (!levels.length) return <p className="bettingInlineBookEmpty">No {side}s</p>;
    const totalQuantity = levels.reduce((total, level) => total + level.quantity, 0);
    return levels.map((level, index) => {
      const coinValue = (level.priceCents * level.quantity) / 100;
      const cumulativeQuantity =
        side === "ask"
          ? levels.slice(index).reduce((total, entry) => total + entry.quantity, 0)
          : levels.slice(0, index + 1).reduce((total, entry) => total + entry.quantity, 0);
      const barWidth = Math.max(2, (cumulativeQuantity / totalQuantity) * 72);
      return (
        <button
          type="button"
          className={`bettingInlineBookLevel bettingInlineBookLevel--${side}`}
          style={{ "--betting-book-bar": `${barWidth}%` } as CSSProperties}
          aria-label={`${side === "ask" ? "Ask" : "Bid"} ${level.priceCents} cents, ${level.quantity.toLocaleString()} contracts, ${formatBetCoins(coinValue)} coins`}
          onClick={() => onSelectPrice(level.priceCents)}
          key={`${side}-${level.priceCents}`}
        >
          <strong>{level.priceCents}¢</strong>
          <span>{side === "ask" ? "Ask" : "Bid"}</span>
          <b>{level.quantity.toLocaleString()}</b>
          <b>{formatBetCoins(coinValue)} coins</b>
        </button>
      );
    });
  };

  return (
    <div className="bettingInlineBook">
      <div className="bettingInlineBookHeader">
        <strong>Order book</strong>
      </div>
      <div className="bettingInlineBookLabels" aria-hidden="true">
        <span>Price</span>
        <span>Side</span>
        <span>Contracts</span>
        <span>Coin value</span>
      </div>
      <div className="bettingInlineBookLevels">
        {renderLevels([...book.asks].reverse(), "ask")}
        <div
          className={`bettingInlineBookTrade bettingInlineBookTrade--${outcome}`}
          aria-label={`Trading ${outcome === "yes" ? "Yes" : "No"}`}
        >
          Trade {outcome === "yes" ? "Yes" : "No"}
        </div>
        {renderLevels(book.bids, "bid")}
      </div>
    </div>
  );
};

const marketAcceptsBets = (market: BettingMarket, now: number): boolean => {
  return market.status === "open" && (!market.closesAt || Date.parse(market.closesAt) > now);
};

const abbreviateBetRound = (roundName: string): string => {
  const normalizedRound = roundName.trim().toLowerCase();
  const numberedRound = /^round of (\d+)$/.exec(normalizedRound);
  if (numberedRound) return `R${numberedRound[1]}`;
  if (normalizedRound === "quarterfinals" || normalizedRound === "quarterfinal") return "QF";
  if (normalizedRound === "semifinals" || normalizedRound === "semifinal") return "SF";
  if (normalizedRound === "finals" || normalizedRound === "final") return "F";
  return roundName;
};

const marketForBet = (markets: BettingMarket[], bet: TournamentBet) =>
  markets.find((market) => market.id === bet.marketId);

const BetHistoryUsername = ({ username }: { username: string }) => {
  const { displayName, elementRef } = useUnderscoreUsernameCutoff<HTMLSpanElement>(username);
  return (
    <span
      ref={elementRef}
      className="betHistoryUsernameCutoff"
      title={username}
      aria-label={username}
    >
      {displayName}
    </span>
  );
};

const MarketSuggestionList = ({
  suggestions,
  isAuthenticated,
  votingSuggestionId,
  onLogin,
  onVote,
}: {
  suggestions: MarketSuggestion[];
  isAuthenticated: boolean;
  votingSuggestionId: number | undefined;
  onLogin: () => void;
  onVote: (suggestion: MarketSuggestion, vote: -1 | 1) => void;
}) => {
  if (!suggestions.length) {
    return <InlineState kind="empty">No markets have been suggested yet.</InlineState>;
  }
  return (
    <div className="marketSuggestionList">
      {suggestions.map((suggestion) => (
        <article className="marketSuggestionCard" key={suggestion.id}>
          <div className="marketSuggestionContent">
            <div className="marketSuggestionMeta">
              <Link to="/@/$username" params={{ username: suggestion.username }}>
                {suggestion.username}
              </Link>
              <span aria-hidden="true">·</span>
              <time dateTime={suggestion.createdAt}>
                {formatLocalDateTime(suggestion.createdAt)}
              </time>
            </div>
            <h3>{suggestion.question}</h3>
            <div className="marketSuggestionOutcomes" aria-label="Proposed outcomes">
              {suggestion.outcomes.map((outcome) => (
                <span key={`${outcome.label}-${outcome.odds}`}>
                  {outcome.label}
                  <strong>{outcome.odds}%</strong>
                </span>
              ))}
            </div>
          </div>
          <div className="marketSuggestionVotes" aria-label={`Votes: ${suggestion.score}`}>
            <button
              type="button"
              className={suggestion.userVote === 1 ? "isSelected" : ""}
              aria-label={`Upvote suggestion by ${suggestion.username}`}
              aria-pressed={suggestion.userVote === 1}
              disabled={votingSuggestionId === suggestion.id}
              onClick={() => (isAuthenticated ? onVote(suggestion, 1) : onLogin())}
            >
              <FontAwesomeIcon icon={faThumbsUp} aria-hidden="true" />
              <span>{suggestion.upvotes}</span>
            </button>
            <strong aria-label={`${suggestion.score} net votes`}>{suggestion.score}</strong>
            <button
              type="button"
              className={suggestion.userVote === -1 ? "isSelected" : ""}
              aria-label={`Downvote suggestion by ${suggestion.username}`}
              aria-pressed={suggestion.userVote === -1}
              disabled={votingSuggestionId === suggestion.id}
              onClick={() => (isAuthenticated ? onVote(suggestion, -1) : onLogin())}
            >
              <FontAwesomeIcon icon={faThumbsDown} aria-hidden="true" />
              <span>{suggestion.downvotes}</span>
            </button>
          </div>
        </article>
      ))}
    </div>
  );
};

const BetHistory = ({
  bets,
  markets,
  countryByPlayer,
  emptyMessage,
  showUsername = false,
}: {
  bets: BetHistoryEntry[];
  markets: BettingMarket[];
  countryByPlayer: Record<string, string>;
  emptyMessage: string;
  showUsername?: boolean;
}) => {
  if (!bets.length) return <InlineState kind="empty">{emptyMessage}</InlineState>;
  return (
    <div className={`betHistoryTableWrap${showUsername ? " betHistoryTableWrap--all" : ""}`}>
      <table className="betHistoryTable">
        <caption className="betHistoryCaption">{showUsername ? "All bets" : "My bets"}</caption>
        <thead>
          <tr>
            <th scope="col">Selection</th>
            {showUsername ? <th scope="col">Bettor</th> : null}
            <th scope="col">Price</th>
            <th scope="col">Cost</th>
            <th scope="col">Return</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {bets.map((bet) => {
            const isPredictionBet = bet.kind === "prediction";
            const market = marketForBet(markets, bet);
            const historyContext = isPredictionBet
              ? ""
              : market?.marketKind === "outright"
                ? ""
                : (market?.roundName ?? "AWC 2026");
            const countryCode = countryByPlayer[bet.selection.toLowerCase()] ?? "";
            const payout = bet.status === "open" ? bet.potentialPayout : bet.payout;
            return (
              <tr key={`${bet.kind ?? "tournament"}-${bet.id}`}>
                <th className="betHistorySelection" scope="row">
                  {isPredictionBet ? (
                    <span
                      className={`betHistoryPlayer betHistoryPlayer--prediction betHistoryPlayer--${bet.selection}`}
                    >
                      <span aria-hidden="true" />
                      <strong>
                        {bet.predictionUsername ?? "Prediction"} ·
                        {bet.selection === "yes" ? "Yes" : "No"}
                      </strong>
                    </span>
                  ) : (
                    <span className="betHistoryPlayer">
                      <img
                        src={countryCodeToFlagUrl(countryCode)}
                        alt={countryCode ? `${countryCode} flag` : "Country unavailable"}
                        crossOrigin="anonymous"
                        loading="lazy"
                        decoding="async"
                      />
                      <strong>
                        <BetHistoryUsername username={bet.selection} />
                      </strong>
                    </span>
                  )}
                  <span className="betHistoryMarket">
                    {isPredictionBet
                      ? (bet.predictionMarketTitle ?? "Prediction market")
                      : market?.label || bet.marketId}
                    {historyContext ? <small> · {abbreviateBetRound(historyContext)}</small> : null}
                  </span>
                </th>
                {showUsername ? (
                  <td className="betHistoryBettor" data-label="Bettor">
                    <Link to="/@/$username" params={{ username: bet.username }}>
                      <BetHistoryUsername username={bet.username} />
                    </Link>
                  </td>
                ) : null}
                <td className="betHistoryNumber" data-label="Price">
                  <strong>
                    {bet.priceCents}
                    <span className="betHistoryPriceSuffix">{isPredictionBet ? "¢" : "%"}</span>
                  </strong>
                </td>
                <td className="betHistoryNumber" data-label="Cost">
                  <strong>{formatBetCoins(bet.totalCost)}</strong>
                  <small>coins</small>
                </td>
                <td className="betHistoryNumber betHistoryReturn" data-label="Return">
                  <strong>{formatBetCoins(payout)}</strong>
                  <small>{bet.status === "open" ? "possible" : "paid"}</small>
                </td>
                <td className="betHistoryState" data-label="Status">
                  <span
                    className={`betStatus betStatus--${bet.status}${isPredictionBet ? " betStatus--prediction" : ""}`}
                  >
                    {bet.status === "open" ? (isPredictionBet ? "Trading" : "Open") : bet.status}
                  </span>
                  <time dateTime={bet.placedAt}>{formatLocalDateTime(bet.placedAt)}</time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
  const [suggestionQuestion, setSuggestionQuestion] = useState("");
  const [suggestionOutcomes, setSuggestionOutcomes] =
    useState<SuggestionDraftOutcome[]>(defaultSuggestionOutcomes);
  const [suggestionSubmitted, setSuggestionSubmitted] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const betSlipRef = useRef<HTMLElement>(null);
  const betAmountRef = useRef<HTMLInputElement>(null);
  const predictionStakeRef = useRef<HTMLInputElement>(null);

  const marketsQuery = useQuery(bettingMarketsQueryOptions());
  const predictionCatalogQuery = useQuery(predictionMarketCatalogQueryOptions());
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
  });
  const suggestionsQuery = useQuery({
    ...marketSuggestionsQueryOptions(),
    enabled: view === "suggestions",
  });
  const coinSummaryQuery = useQuery({
    ...coinSummaryQueryOptions(username),
    enabled: isAuthenticated,
  });
  const countriesQuery = useQuery(tournamentPlayerCountriesQueryOptions());
  const awcBracketQuery = useQuery({
    ...tournamentBracketQueryOptions("awc2026"),
    enabled: isAuthenticated && marketCategory === "AWC Champion",
  });
  const predictionMarketQueries = useQueries({
    queries: predictionMarkets.map((market) => ({
      ...predictionMarketQueryOptions(market.id),
      enabled:
        isPredictionMarketCategory(marketCategory) ||
        marketCategory === "AWC Champion" ||
        view === "all",
    })),
  });
  usePredictionMarketRealtime(
    queryClient,
    predictionMarkets.map((market) => market.id),
  );
  const predictionMarketStates = predictionMarketQueries.map((query) => query.data);
  const predictionStateByMarketId = new Map(
    predictionMarkets.map((market, index) => [market.id, predictionMarketStates[index]]),
  );
  const countryByPlayer = countriesQuery.data ?? {};
  const markets = useMemo(() => marketsQuery.data ?? [], [marketsQuery.data]);
  const allHistoryBets = useMemo<BetHistoryEntry[]>(() => {
    const tournamentBets = allBetsQuery.data ?? [];
    const predictionBets = predictionMarkets.flatMap((definition, index) => {
      const predictionState = predictionMarketStates[index];
      const predictionGroup = predictionMarketGroups.find((group) =>
        group.markets.some((market) => market.id === definition.id),
      );
      return (predictionState?.fills ?? []).map((fill): BetHistoryEntry => {
        const totalCost = Math.round(fill.priceCents * fill.quantity * 10_000) / 1_000_000;
        const resolvedOutcome = predictionState?.market.outcome;
        const settlementPrice = predictionState?.market.settlementPriceCents;
        const status: TournamentBet["status"] =
          predictionState?.market.status === "refunded"
            ? "refunded"
            : predictionState?.market.status === "resolved"
              ? settlementPrice !== null && settlementPrice !== undefined
                ? "settled"
                : resolvedOutcome === fill.outcome
                  ? "won"
                  : "lost"
              : "open";
        const settlementPayout =
          settlementPrice !== null && settlementPrice !== undefined
            ? (fill.quantity * (fill.outcome === "yes" ? settlementPrice : 100 - settlementPrice)) /
              100
            : 0;
        return {
          id: fill.id,
          marketId: definition.id,
          username: fill.buyerUsername,
          selection: fill.outcome,
          priceCents: fill.priceCents,
          stake: totalCost,
          fee: 0,
          totalCost,
          potentialPayout: fill.quantity,
          status,
          payout:
            status === "won"
              ? fill.quantity
              : status === "settled"
                ? settlementPayout
                : status === "refunded"
                  ? totalCost
                  : 0,
          placedAt: fill.createdAt,
          settledAt:
            status === "open" ? null : (predictionState?.market.resolvedAt ?? fill.createdAt),
          kind: "prediction",
          predictionUsername: definition.username,
          predictionMarketTitle: predictionGroup?.title,
          predictionSettlementPriceCents: settlementPrice ?? undefined,
        };
      });
    });
    return [...tournamentBets, ...predictionBets].sort(
      (left, right) => Date.parse(right.placedAt) - Date.parse(left.placedAt),
    );
  }, [allBetsQuery.data, predictionMarketGroups, predictionMarkets, predictionMarketStates]);
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
    return [
      ...(awcRoundOf16Category ? [awcRoundOf16Category] : []),
      ...predictionMarketCategories,
      ...categories.filter(
        (category) =>
          category !== "Banned" &&
          category !== "Markets" &&
          category !== "AWC Champion" &&
          category !== defaultMarketCategory,
      ),
    ];
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
  const activePredictionDisplayMode: PredictionDisplayMode =
    marketCategory === "Shield" ? "market" : predictionDisplayMode;
  const showWinnerPositionToggle =
    marketCategory === "AWC Champion" &&
    (activePredictionDisplayMode === "book" ||
      (!isPredictionMarketCategory(marketCategory) &&
        openMarkets.some((market) => market.id === winnerNoMarketId)));
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
    Number.isInteger(predictionQuantity) && predictionQuantity >= 1 && predictionQuantity <= 10_000;
  const selectedPredictionOutcome = predictionSelection?.outcome ?? "yes";
  const predictionBuyQuote = quotePredictionBuy(
    selectedPredictionState?.book[selectedPredictionOutcome].asks ?? [],
    validPredictionPrice ? predictionPrice : 0,
    validPredictionQuantity ? predictionQuantity : 0,
  );
  const predictionOrderValue =
    validPredictionPrice && validPredictionQuantity
      ? (predictionPrice * predictionQuantity) / 100
      : 0;
  const predictionEstimatedFee = predictionTakerFee(predictionBuyQuote.fillCostCoins);
  const predictionEstimatedTotal = predictionOrderValue + predictionEstimatedFee;
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
  ) =>
    isRestrictedAwcChampionOrder({
      groupId,
      marketPlayer,
      username,
      currentOpponent: currentAwcOpponent,
      outcome,
      side: "buy",
    });
  const predictionRestrictionTitle = (
    restriction: ReturnType<typeof isRestrictedAwcChampionOrder>,
  ) => (restriction ? predictionOrderRestrictionMessage(restriction) : undefined);
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
  const myBets = betsQuery.data ?? [];
  const openBetCost = myBets.reduce(
    (total, bet) => total + (bet.status === "open" ? bet.totalCost : 0),
    0,
  );
  const netWorth = balance + openBetCost;
  const betCostLimit = netWorth * BET_NET_WORTH_LIMIT_RATE;
  const selectedPositionCost = selection
    ? myBets.reduce(
        (total, bet) =>
          total +
          (bet.status === "open" &&
          bet.marketId === selection.marketId &&
          bet.selection.toLowerCase() === selection.player.toLowerCase()
            ? bet.totalCost
            : 0),
        0,
      )
    : 0;
  const remainingPositionBudget = Math.max(0, betCostLimit - selectedPositionCost);
  const balanceLimitedStake = isAuthenticated
    ? maxTournamentBetStake(balance, openBetCost, selectedPositionCost)
    : MAX_BET_STAKE;
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
  const exceedsPositionLimit =
    isAuthenticated && validStake && quote.totalCost > remainingPositionBudget;
  const insufficientBalance = isAuthenticated && validStake && quote.totalCost > balance;

  useEffect(() => {
    const nextDeadline = markets
      .filter((market) => market.status === "open" && market.closesAt)
      .map((market) => Date.parse(market.closesAt ?? ""))
      .filter((deadline) => Number.isFinite(deadline) && deadline > Date.now())
      .sort((a, b) => a - b)[0];
    if (!nextDeadline) return;
    const timeout = window.setTimeout(
      () => setCurrentTime(Date.now()),
      Math.min(nextDeadline - Date.now() + 250, 2_147_483_647),
    );
    return () => window.clearTimeout(timeout);
  }, [markets]);

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
      if (marketCategory === "AWC Champion") {
        currentUrl.searchParams.set("side", winnerPosition);
      } else {
        currentUrl.searchParams.delete("side");
      }
    } else {
      currentUrl.searchParams.delete("market");
      currentUrl.searchParams.delete("side");
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
      if (marketCategory === "AWC Champion") {
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
    if (nextCategory === "AWC Champion") {
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
        `Bet placed on ${result.bet.selection} for ${formatBetCoins(placedCost)} coins.`,
      );
      setStakeInput("");
      setStakeTouched(false);
      queryClient.setQueryData(coinQueryKeys.summary(username), (current: unknown) =>
        current && typeof current === "object" ? { ...current, balance: result.balance } : current,
      );
      await queryClient.invalidateQueries({ queryKey: bettingQueryKeys.bets(username) });
      await queryClient.invalidateQueries({ queryKey: bettingQueryKeys.allBets });
    },
  });

  const placePredictionMutation = useMutation({
    mutationFn: placePredictionOrder,
    onSuccess: async () => {
      setSuccessMessage(
        activePredictionDisplayMode === "book" ? "Bet placed." : "Prediction order placed.",
      );
      setPredictionStakeInput("");
      setPredictionStakeTouched(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: predictionMarketQueryRoot }),
        queryClient.invalidateQueries({ queryKey: coinQueryKeys.summary(username) }),
      ]);
    },
  });

  const suggestMarketMutation = useMutation({
    mutationFn: suggestMarket,
    onSuccess: async () => {
      setSuggestionQuestion("");
      setSuggestionOutcomes(defaultSuggestionOutcomes());
      setSuggestionSubmitted(true);
      await queryClient.invalidateQueries({ queryKey: bettingQueryKeys.suggestions });
    },
  });

  const suggestionVoteMutation = useMutation({
    mutationFn: voteOnMarketSuggestion,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: bettingQueryKeys.suggestions });
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
    if (
      !selectedMarket ||
      !selection ||
      !validStake ||
      selectionIsOpponent ||
      exceedsPositionLimit ||
      insufficientBalance
    )
      return;
    setSuccessMessage("");
    placeBetMutation.mutate({
      marketId: selectedMarket.id,
      selection: selection.player,
      stake,
    });
  };

  const updateSuggestionOutcome = (
    index: number,
    field: keyof SuggestionDraftOutcome,
    value: string,
  ) => {
    setSuggestionSubmitted(false);
    setSuggestionOutcomes((current) =>
      current.map((outcome, outcomeIndex) =>
        outcomeIndex === index ? { ...outcome, [field]: value } : outcome,
      ),
    );
  };

  const submitMarketSuggestion = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const outcomes = suggestionOutcomes.map((outcome) => ({
      label: outcome.label.trim(),
      odds: Number(outcome.odds),
    }));
    if (
      suggestionQuestion.trim().length < 8 ||
      outcomes.some(
        (outcome) =>
          !outcome.label ||
          !Number.isInteger(outcome.odds) ||
          outcome.odds < 1 ||
          outcome.odds > 99,
      )
    )
      return;
    setSuggestionSubmitted(false);
    suggestMarketMutation.mutate({ question: suggestionQuestion.trim(), outcomes });
  };

  const voteOnSuggestion = (suggestion: MarketSuggestion, vote: -1 | 1) => {
    suggestionVoteMutation.mutate({
      suggestionId: suggestion.id,
      vote: suggestion.userVote === vote ? 0 : vote,
    });
  };

  return (
    <main className="sitePage bettingPage">
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
          {isAuthenticated ? (
            <div className="bettingBalance" aria-live="polite">
              <img src={appAssetPath("/images/coins/gold-coin-stack-v2.png")} alt="" />
              <span>
                <strong>{formatCoinBalance(balance)}</strong>
                coins available
                <small>50% limit per outcome · {formatBetCoins(netWorth)} net worth</small>
              </span>
            </div>
          ) : null}
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
            My bets{myBets.length ? ` (${myBets.length})` : ""}
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
            {marketsQuery.error instanceof Error
              ? marketsQuery.error.message
              : "Unable to load betting markets."}
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
              {activePredictionGroup && marketCategory !== "Shield" ? (
                <div className="bettingPredictionViewControl">
                  <span>View style</span>
                  <div className="bettingPredictionModeToggle" role="group" aria-label="View style">
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
                        {mode === "book" ? "Sportsbook" : "Order book"}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {showWinnerPositionToggle ? (
                <div className="bettingPositionToggle" role="group" aria-label="AWC winner side">
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
              ) : null}
              <div className="bettingMarketList">
                {activePredictionGroup && activePredictionDisplayMode === "book" ? (
                  <section className="bettingMarketGroup bettingPredictionBookGroup">
                    <h2>
                      <span>
                        {marketCategory === "AWC Champion"
                          ? winnerPosition === "yes"
                            ? "Who will win AWC 2026?"
                            : "Who will not win AWC 2026?"
                          : activePredictionGroup.title}
                      </span>
                      <Link to={activePredictionGroup.path}>View market →</Link>
                    </h2>
                    {activePredictionGroup.markets.map((definition) => {
                      const state = predictionStateByMarketId.get(definition.id);
                      const yesAsk = state?.book.yes.asks[0]?.priceCents;
                      const noAsk = state?.book.no.asks[0]?.priceCents;
                      const yesChance = predictionYesChance(definition, state);
                      const isResolved = state?.market.status === "resolved";
                      if (isResolved) {
                        const resolvedOutcome = state.market.outcome ?? "no";
                        const settlementPrice = state.market.settlementPriceCents;
                        const invertChampionOutcome =
                          marketCategory === "AWC Champion" && winnerPosition === "no";
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
                            <span className="bettingExchangeStrikePlayer">
                              <img
                                src={countryCodeToFlagUrl(definition.countryCode)}
                                alt=""
                                crossOrigin="anonymous"
                                loading="lazy"
                                decoding="async"
                                aria-hidden="true"
                              />
                              <strong>{definition.username}</strong>
                            </span>
                            <span
                              className={`bettingPredictionBookResolved ${
                                displayedSettlementPrice === null
                                  ? `bettingPredictionBookResolved--${displayedResolvedOutcome}`
                                  : "bettingPredictionBookResolved--price"
                              }`}
                            >
                              {displayedSettlementPrice === null
                                ? displayedResolvedOutcome === "yes"
                                  ? "Yes"
                                  : "No"
                                : `Settled ${displayedSettlementPrice}¢`}
                            </span>
                          </article>
                        );
                      }
                      const sportsbookOutcome: PredictionOutcome =
                        marketCategory === "AWC Champion" ? winnerPosition : "yes";
                      const sportsbookPrice = sportsbookOutcome === "yes" ? yesAsk : noAsk;
                      const displayedChance =
                        marketCategory === "Ban"
                          ? (yesChance ?? yesAsk)
                          : sportsbookOutcome === "yes"
                            ? yesChance
                            : yesChance === undefined
                              ? undefined
                              : 100 - yesChance;
                      const suggestedPrice = suggestedPredictionPrice(
                        definition,
                        state,
                        sportsbookOutcome,
                      );
                      const selected =
                        predictionSelection?.marketId === definition.id &&
                        predictionSelection.outcome === sportsbookOutcome;
                      const sportsbookRestriction = predictionRestrictionFor(
                        activePredictionGroup.id,
                        definition.username,
                        sportsbookOutcome,
                      );
                      return (
                        <article className="bettingMarketCard" key={definition.id}>
                          {marketCategory === "AWC Champion" || marketCategory === "Ban" ? (
                            <div className="bettingOutcomes bettingPredictionBookOutcome">
                              <button
                                type="button"
                                className={selected ? "isSelected" : ""}
                                aria-pressed={selected}
                                disabled={
                                  Boolean(sportsbookRestriction) || sportsbookPrice === undefined
                                }
                                title={
                                  predictionRestrictionTitle(sportsbookRestriction) ??
                                  (sportsbookPrice === undefined
                                    ? "No liquidity is available."
                                    : undefined)
                                }
                                onClick={() =>
                                  choosePredictionOutcome(
                                    definition.id,
                                    sportsbookOutcome,
                                    suggestedPrice,
                                  )
                                }
                              >
                                <span className="bettingOutcomePlayer">
                                  <img
                                    src={countryCodeToFlagUrl(definition.countryCode)}
                                    alt=""
                                    crossOrigin="anonymous"
                                    loading="lazy"
                                    decoding="async"
                                    aria-hidden="true"
                                  />
                                  <span>{definition.username}</span>
                                </span>
                                <span className="bettingOutcomeQuote">
                                  <strong>
                                    {displayedChance === undefined ? "—" : `${displayedChance}%`}
                                  </strong>
                                  {sportsbookRestriction ? (
                                    <small>Unavailable</small>
                                  ) : sportsbookPrice === undefined ? (
                                    <small>No liquidity</small>
                                  ) : marketCategory === "Ban" ? (
                                    <small>to be banned</small>
                                  ) : null}
                                </span>
                              </button>
                            </div>
                          ) : (
                            <div className="bettingOutcomes">
                              {predictionOutcomes.map((entry) => {
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
                                return (
                                  <button
                                    type="button"
                                    className={entrySelected ? "isSelected" : ""}
                                    aria-pressed={entrySelected}
                                    disabled={Boolean(entryRestriction)}
                                    title={predictionRestrictionTitle(entryRestriction)}
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
                                      <span>{entry === "yes" ? "Yes" : "No"}</span>
                                    </span>
                                    <span className="bettingOutcomeQuote">
                                      <strong>
                                        {entryPrice === undefined ? "—" : `${entryPrice}¢`}
                                      </strong>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
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
                        <div className="bettingExchangeQuestion">
                          <span className="bettingExchangeTitle">
                            {group.id === "november-atomic-shield-2026" ? (
                              <img
                                src={appAssetPath("/images/arenas/atomic-shield.png")}
                                alt=""
                                aria-hidden="true"
                              />
                            ) : null}
                            <strong>{group.title}</strong>
                          </span>
                          <span className="bettingExchangeMeta">
                            <small
                              className={`bettingExchangeStatus${
                                activePredictionGroupOpen ? "" : " bettingExchangeStatus--closed"
                              }`}
                            >
                              {activePredictionGroupOpen ? "Open" : "Closed"}
                            </small>
                            <small>Volume {formatBetCoins(activePredictionVolume)} coins</small>
                          </span>
                        </div>
                        <Link className="bettingExchangeAction" to={group.path}>
                          Open market →
                        </Link>
                        <div className="bettingExchangeStrikes">
                          <div className="bettingExchangeStrikeHeader" aria-hidden="true">
                            <span />
                            <span>Chance</span>
                            <span />
                          </div>
                          {group.markets.map((definition) => {
                            const state = predictionStateByMarketId.get(definition.id);
                            const yesChance = predictionYesChance(definition, state);
                            const yesAsk = state?.book.yes.asks[0]?.priceCents;
                            const noAsk = state?.book.no.asks[0]?.priceCents;
                            const isResolved = state?.market.status === "resolved";
                            return (
                              <div className="bettingExchangeStrike" key={definition.id}>
                                {isResolved ? (
                                  <div className="bettingExchangeStrikeToggle bettingExchangeStrikeToggle--resolved">
                                    <span className="bettingExchangeStrikePlayer">
                                      <img
                                        src={countryCodeToFlagUrl(definition.countryCode)}
                                        alt=""
                                        crossOrigin="anonymous"
                                        loading="lazy"
                                        decoding="async"
                                        aria-hidden="true"
                                      />
                                      <strong>{definition.username}</strong>
                                    </span>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="bettingExchangeStrikeToggle"
                                    aria-expanded={expandedPredictionMarketId === definition.id}
                                    aria-controls={`betting-strike-book-${definition.id}`}
                                    onClick={() => togglePredictionStrike(definition.id)}
                                  >
                                    <span className="bettingExchangeStrikePlayer">
                                      <img
                                        src={countryCodeToFlagUrl(definition.countryCode)}
                                        alt=""
                                        crossOrigin="anonymous"
                                        loading="lazy"
                                        decoding="async"
                                        aria-hidden="true"
                                      />
                                      <strong>{definition.username}</strong>
                                    </span>
                                    <span className="bettingExchangeStrikeChance">
                                      <strong>
                                        {yesChance === undefined ? "—" : `${yesChance}%`}
                                      </strong>
                                    </span>
                                  </button>
                                )}
                                {isResolved ? (
                                  <span
                                    className={`bettingExchangeResolved ${
                                      state?.market.settlementPriceCents === null
                                        ? `bettingExchangeResolved--${state?.market.outcome ?? "no"}`
                                        : "bettingExchangeResolved--price"
                                    }`}
                                  >
                                    {state?.market.settlementPriceCents === null
                                      ? state?.market.outcome === "yes"
                                        ? "Yes"
                                        : "No"
                                      : `Settled ${state?.market.settlementPriceCents}¢`}
                                  </span>
                                ) : (
                                  <span className="bettingExchangeStrikePrices">
                                    {predictionOutcomes.map((entry) => {
                                      const displayedPrice = entry === "yes" ? yesAsk : noAsk;
                                      const suggestedPrice = suggestedPredictionPrice(
                                        definition,
                                        state,
                                        entry,
                                      );
                                      const selected =
                                        predictionSelection?.marketId === definition.id &&
                                        predictionSelection.outcome === entry;
                                      const entryRestriction = predictionRestrictionFor(
                                        group.id,
                                        definition.username,
                                        entry,
                                      );
                                      return (
                                        <button
                                          type="button"
                                          className={selected ? "isSelected" : ""}
                                          aria-pressed={selected}
                                          disabled={Boolean(entryRestriction)}
                                          title={predictionRestrictionTitle(entryRestriction)}
                                          onClick={() =>
                                            choosePredictionOutcome(
                                              definition.id,
                                              entry,
                                              suggestedPrice,
                                            )
                                          }
                                          key={entry}
                                        >
                                          <span>{entry === "yes" ? "Yes" : "No"}</span>
                                          <span>
                                            {displayedPrice === undefined
                                              ? "—"
                                              : `${displayedPrice}¢`}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </span>
                                )}
                                {!isResolved &&
                                state &&
                                expandedPredictionMarketId === definition.id ? (
                                  <div
                                    className="bettingInlineBookDrawer"
                                    id={`betting-strike-book-${definition.id}`}
                                  >
                                    <QuickPredictionOrderBook
                                      state={state}
                                      outcome={expandedPredictionOutcome}
                                      onSelectPrice={(priceCents) =>
                                        choosePredictionOutcome(
                                          definition.id,
                                          expandedPredictionOutcome,
                                          priceCents,
                                        )
                                      }
                                    />
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </section>
                ) : null}
                {marketGroups.length ? (
                  marketGroups.map(([roundName, roundMarkets]) => (
                    <section className="bettingMarketGroup" key={roundName}>
                      <h2>
                        {marketCategory === "AWC Champion"
                          ? winnerPosition === "yes"
                            ? "Who will win AWC 2026?"
                            : "Who will not win AWC 2026?"
                          : roundName}
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
                              const positionCost = myBets.reduce(
                                (total, bet) =>
                                  total +
                                  (bet.status === "open" &&
                                  bet.marketId === market.id &&
                                  bet.selection.toLowerCase() === outcome.player.toLowerCase()
                                    ? bet.totalCost
                                    : 0),
                                0,
                              );
                              const positionLimitReached =
                                isAuthenticated &&
                                maxTournamentBetStake(balance, openBetCost, positionCost) <
                                  MIN_BET_AMOUNT;
                              const unavailableReason = isSelfNotToWinOutcome
                                ? "You can’t bet on yourself not to win AWC."
                                : isOpponentOutcome
                                  ? "You can’t bet on your opponent."
                                  : positionLimitReached
                                    ? "This position has reached 50% of your net worth."
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
                                    ) : positionLimitReached ? (
                                      <small>Limit reached</small>
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

            <aside className="betSlip" aria-labelledby="bet-slip-title" ref={betSlipRef}>
              <h2 id="bet-slip-title">
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
                    <div className="betSlipSelection">
                      <small>{selectedPredictionGroup?.title ?? "Prediction market"}</small>
                      <div className="betSlipContract">
                        <span>
                          <img
                            src={countryCodeToFlagUrl(selectedPredictionDefinition.countryCode)}
                            alt=""
                            crossOrigin="anonymous"
                            aria-hidden="true"
                          />
                          <strong>{selectedPredictionDefinition.username}</strong>
                          <em>
                            {selectedPredictionGroup?.id === "awc-2026-champion"
                              ? predictionSelection.outcome === "yes"
                                ? "to win"
                                : "not to win"
                              : selectedPredictionGroup?.id === "ban-2026"
                                ? predictionSelection.outcome === "yes"
                                  ? "banned"
                                  : "not banned"
                                : predictionSelection.outcome === "yes"
                                  ? "to win"
                                  : "not to win"}
                          </em>
                        </span>
                        <b>
                          {validPredictionPrice
                            ? `${predictionPrice}${activePredictionDisplayMode === "book" ? "%" : "¢"}`
                            : "—"}
                        </b>
                      </div>
                    </div>
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
                                ? `${formatBetCoins(predictionSportsbookTotal)} coins`
                                : "—"}
                            </dd>
                          </div>
                          <div className="betQuoteFee">
                            <dt>Includes 2% fee</dt>
                            <dd>
                              {validPredictionStake && predictionSportsbookFullyMatched
                                ? `${formatBetCoins(predictionSportsbookFee)} coins`
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
                            You need {formatBetCoins(predictionSportsbookTotal)} coins including the
                            fee.
                          </InlineState>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div
                          className="bettingPredictionOutcomePicker"
                          role="group"
                          aria-label="Prediction outcome"
                        >
                          {predictionOutcomes.map((entry) => {
                            const availablePrice =
                              selectedPredictionState?.book[entry].asks[0]?.priceCents;
                            const suggestedPrice = suggestedPredictionPrice(
                              selectedPredictionDefinition,
                              selectedPredictionState,
                              entry,
                            );
                            return (
                              <button
                                type="button"
                                aria-pressed={predictionSelection.outcome === entry}
                                onClick={() =>
                                  choosePredictionOutcome(
                                    selectedPredictionDefinition.id,
                                    entry,
                                    suggestedPrice,
                                  )
                                }
                                key={entry}
                              >
                                <span>{entry === "yes" ? "Yes" : "No"}</span>
                                <span>
                                  {availablePrice === undefined ? "—" : `${availablePrice}¢`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <label htmlFor="prediction-quick-price">Limit price</label>
                        <div className="betAmountField">
                          <input
                            id="prediction-quick-price"
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="99"
                            step="1"
                            value={predictionPriceInput}
                            onChange={(event) => setPredictionPriceInput(event.target.value)}
                          />
                          <span>¢</span>
                        </div>
                        <label htmlFor="prediction-quick-quantity">Contracts</label>
                        <input
                          id="prediction-quick-quantity"
                          className="bettingPredictionQuantity"
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="10000"
                          step="1"
                          value={predictionQuantityInput}
                          onChange={(event) => setPredictionQuantityInput(event.target.value)}
                        />
                        <dl className="betQuote">
                          <div>
                            <dt>Available now</dt>
                            <dd>{predictionBuyQuote.availableQuantity.toLocaleString()}</dd>
                          </div>
                          <div>
                            <dt>Average buy price</dt>
                            <dd>
                              {predictionBuyQuote.averageFillPriceCents === undefined
                                ? "—"
                                : `${predictionBuyQuote.averageFillPriceCents.toFixed(1)}¢`}
                            </dd>
                          </div>
                          <div className="betQuoteTotal">
                            <dt>Maximum cost</dt>
                            <dd>
                              {validPredictionPrice && validPredictionQuantity
                                ? `${formatBetCoins(predictionEstimatedTotal)} coins`
                                : "—"}
                            </dd>
                          </div>
                          <div className="betQuoteFee">
                            <dt>Taker fee (2%)</dt>
                            <dd>
                              {validPredictionPrice && validPredictionQuantity
                                ? `${formatBetCoins(predictionEstimatedFee)} coins`
                                : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt>Potential payout</dt>
                            <dd>
                              {validPredictionQuantity
                                ? `${predictionQuantity.toLocaleString()} coins`
                                : "—"}
                            </dd>
                          </div>
                        </dl>
                        {validPredictionQuantity && predictionBuyQuote.restingQuantity > 0 ? (
                          <InlineState kind="info">
                            Only {predictionBuyQuote.availableQuantity.toLocaleString()} contracts
                            are available at or below this price. The remaining
                            {predictionBuyQuote.restingQuantity.toLocaleString()} will stay open as
                            a bid.
                          </InlineState>
                        ) : null}
                      </>
                    )}
                    {placePredictionMutation.error ? (
                      <InlineState kind="error">
                        {placePredictionMutation.error instanceof Error
                          ? placePredictionMutation.error.message
                          : "Unable to place this order."}
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
                    {isAuthenticated ? (
                      <button
                        className="betSubmitButton"
                        type="submit"
                        disabled={
                          !validPredictionPrice ||
                          (activePredictionDisplayMode === "book"
                            ? !validPredictionStake ||
                              !predictionSportsbookFullyMatched ||
                              predictionSportsbookInsufficientBalance
                            : !validPredictionQuantity) ||
                          Boolean(selectedPredictionRestriction) ||
                          !selectedPredictionOpen ||
                          placePredictionMutation.isPending
                        }
                      >
                        {placePredictionMutation.isPending
                          ? activePredictionDisplayMode === "book"
                            ? "Placing bet…"
                            : "Placing order…"
                          : activePredictionDisplayMode === "book"
                            ? validPredictionStake && predictionSportsbookFullyMatched
                              ? `Place bet · ${formatBetCoins(predictionSportsbookTotal)} coins`
                              : "Place bet"
                            : "Place buy order"}
                      </button>
                    ) : (
                      <button
                        className="betSubmitButton"
                        type="button"
                        disabled={authLoading}
                        onClick={() => void login("/betting")}
                      >
                        {activePredictionDisplayMode === "book"
                          ? "Log in to bet"
                          : "Log in to trade"}
                      </button>
                    )}
                    {selectedPredictionGroup ? (
                      <Link
                        className="bettingPredictionFullMarket"
                        to={selectedPredictionGroup.path}
                      >
                        View full order book →
                      </Link>
                    ) : null}
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
                      ? bettingUnavailable
                        ? "This position has reached 50% of your net worth. Other outcomes remain available."
                        : `Up to ${formatBetCoins(effectiveStakeLimit)} coins before the fee. Each outcome is limited to 50% of net worth.`
                      : selectedMarket.id.startsWith("lichess-ban-")
                        ? "200 coin maximum · 2% fee · 50% net worth limit"
                        : "2% fee · 50% net worth limit"}
                  </small>

                  <dl className="betQuote">
                    <div>
                      <dt>Potential payout</dt>
                      <dd>{validStake ? formatBetCoins(quote.potentialPayout) : "—"}</dd>
                    </div>
                    <div className="betQuoteTotal">
                      <dt>Total cost</dt>
                      <dd>{validStake ? formatBetCoins(quote.totalCost) : "—"}</dd>
                    </div>
                    <div className="betQuoteFee">
                      <dt>Includes 2% fee</dt>
                      <dd>{validStake ? formatBetCoins(quote.fee) : "—"}</dd>
                    </div>
                  </dl>

                  {stakeTouched && !validStake ? (
                    <InlineState kind="error">
                      Enter a whole coin amount from 1 to {formatBetCoins(marketStakeLimit)}.
                    </InlineState>
                  ) : null}
                  {insufficientBalance && !exceedsPositionLimit ? (
                    <InlineState kind="error">
                      You need {formatBetCoins(quote.totalCost)} coins including the fee.
                    </InlineState>
                  ) : null}
                  {exceedsPositionLimit ? (
                    <InlineState kind="error">
                      One position can use up to 50% of your net worth. You have
                      {` ${formatBetCoins(remainingPositionBudget)} coins`} left for this outcome,
                      including the fee.
                    </InlineState>
                  ) : null}
                  {bettingUnavailable ? (
                    <InlineState kind="info">
                      This position has reached its limit. Choose another outcome, earn more coins,
                      or wait for it to settle.
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
                      {placeBetMutation.error instanceof Error
                        ? placeBetMutation.error.message
                        : "Unable to place your bet."}
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
                        exceedsPositionLimit ||
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
                          ? `Place bet · ${formatBetCoins(quote.totalCost)} coins`
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
          <section className="marketSuggestions" role="tabpanel">
            <div className="marketSuggestionFormPanel">
              <h2>Suggest a market</h2>
              {isAuthenticated ? (
                <form onSubmit={submitMarketSuggestion}>
                  <label htmlFor="market-suggestion-question">Market question</label>
                  <input
                    id="market-suggestion-question"
                    type="text"
                    minLength={8}
                    maxLength={160}
                    required
                    value={suggestionQuestion}
                    onChange={(event) => {
                      setSuggestionQuestion(event.target.value);
                      setSuggestionSubmitted(false);
                    }}
                    placeholder="Will a player reach the AWC final?"
                  />
                  <fieldset>
                    <legend>Outcomes and proposed odds</legend>
                    <div className="marketSuggestionOutcomeFields">
                      {suggestionOutcomes.map((outcome, index) => (
                        <div className="marketSuggestionOutcomeField" key={index}>
                          <label>
                            <span>Outcome {index + 1}</span>
                            <input
                              type="text"
                              maxLength={60}
                              required
                              value={outcome.label}
                              onChange={(event) =>
                                updateSuggestionOutcome(index, "label", event.target.value)
                              }
                            />
                          </label>
                          <label>
                            <span>Odds</span>
                            <span className="marketSuggestionOddsField">
                              <input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                max="99"
                                step="1"
                                required
                                value={outcome.odds}
                                onChange={(event) =>
                                  updateSuggestionOutcome(index, "odds", event.target.value)
                                }
                              />
                              <b>%</b>
                            </span>
                          </label>
                          {suggestionOutcomes.length > 2 ? (
                            <button
                              type="button"
                              className="marketSuggestionRemoveOutcome"
                              aria-label={`Remove outcome ${index + 1}`}
                              onClick={() =>
                                setSuggestionOutcomes((current) =>
                                  current.filter((_, outcomeIndex) => outcomeIndex !== index),
                                )
                              }
                            >
                              <FontAwesomeIcon icon={faTrash} aria-hidden="true" />
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </fieldset>
                  {suggestionOutcomes.length < 6 ? (
                    <button
                      type="button"
                      className="marketSuggestionAddOutcome"
                      onClick={() =>
                        setSuggestionOutcomes((current) => [...current, { label: "", odds: "50" }])
                      }
                    >
                      <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
                      Add outcome
                    </button>
                  ) : null}
                  {suggestMarketMutation.error ? (
                    <InlineState kind="error">
                      {suggestMarketMutation.error instanceof Error
                        ? suggestMarketMutation.error.message
                        : "Unable to submit this market suggestion."}
                    </InlineState>
                  ) : null}
                  {suggestionSubmitted ? (
                    <InlineState kind="success">Market suggestion published.</InlineState>
                  ) : null}
                  <button
                    type="submit"
                    className="marketSuggestionSubmit"
                    disabled={suggestMarketMutation.isPending}
                  >
                    {suggestMarketMutation.isPending ? "Publishing…" : "Publish suggestion"}
                  </button>
                </form>
              ) : (
                <div className="marketSuggestionLogin">
                  <p>Log in with Lichess to suggest a market or vote.</p>
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={() => void login("/betting")}
                  >
                    Log in with Lichess
                  </button>
                </div>
              )}
            </div>
            <div className="marketSuggestionFeed">
              <h2>Suggested markets</h2>
              {suggestionsQuery.error ? (
                <InlineState kind="error">
                  {suggestionsQuery.error instanceof Error
                    ? suggestionsQuery.error.message
                    : "Unable to load market suggestions."}
                </InlineState>
              ) : suggestionsQuery.isPending ? (
                <RouteLoadingFallback />
              ) : (
                <MarketSuggestionList
                  suggestions={suggestionsQuery.data ?? []}
                  isAuthenticated={isAuthenticated}
                  votingSuggestionId={suggestionVoteMutation.variables?.suggestionId}
                  onLogin={() => void login("/betting")}
                  onVote={voteOnSuggestion}
                />
              )}
              {suggestionVoteMutation.error ? (
                <InlineState kind="error">
                  {suggestionVoteMutation.error instanceof Error
                    ? suggestionVoteMutation.error.message
                    : "Unable to record your vote."}
                </InlineState>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="bettingHistory" role="tabpanel">
            {view === "mine" && !isAuthenticated ? (
              <div className="bettingLoginPrompt">
                <h2>Log in to view your bets</h2>
                <button type="button" disabled={authLoading} onClick={() => void login("/betting")}>
                  Log in with Lichess
                </button>
              </div>
            ) : view === "mine" && betsQuery.error ? (
              <InlineState kind="error">
                {betsQuery.error instanceof Error
                  ? betsQuery.error.message
                  : "Unable to load your bets."}
              </InlineState>
            ) : view === "mine" && betsQuery.isPending ? (
              <RouteLoadingFallback />
            ) : view === "mine" ? (
              <BetHistory
                bets={myBets}
                markets={markets}
                countryByPlayer={countryByPlayer}
                emptyMessage="You have not placed any bets."
              />
            ) : allBetsQuery.error ? (
              <InlineState kind="error">
                {allBetsQuery.error instanceof Error
                  ? allBetsQuery.error.message
                  : "Unable to load all bets."}
              </InlineState>
            ) : allBetsQuery.isPending ? (
              <RouteLoadingFallback />
            ) : (
              <BetHistory
                bets={allHistoryBets}
                markets={markets}
                countryByPlayer={countryByPlayer}
                emptyMessage="No bets have been placed yet."
                showUsername
              />
            )}
          </section>
        )}
      </div>
    </main>
  );
};
