import "./Betting.css";

import { faPlus, faThumbsDown, faThumbsUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { InlineState } from "../../components/InlineState/InlineState";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { useUnderscoreUsernameCutoff } from "../../hooks/useUnderscoreUsernameCutoff";
import {
  AWC_NOT_TO_WIN_MARKET_ID,
  BET_NET_WORTH_LIMIT_RATE,
  type BettingMarket,
  isAwcNotToWinSelfBet,
  isTournamentBetOnOpponent,
  type MarketSuggestion,
  MAX_BET_STAKE,
  maxTournamentBetStake,
  MIN_BET_AMOUNT,
  placeTournamentBet,
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
import { tournamentPlayerCountriesQueryOptions } from "../../lib/matches/tournamentQueries";
import { appAssetPath } from "../../utils/appAssetPath";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { formatLocalDateTime } from "../../utils/formatters";

type BettingView = "markets" | "mine" | "all" | "suggestions";
type WinnerPosition = "yes" | "no";
type Selection = { marketId: string; player: string };
type SuggestionDraftOutcome = { label: string; odds: string };

const bettingViews: readonly BettingView[] = ["markets", "mine", "all", "suggestions"];
const defaultMarketCategory = "AWC Round of 16";
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
  categories: readonly string[] = [defaultMarketCategory, "AWC Champion", "Banned"],
): string => {
  const requestedMarket = new URLSearchParams(search).get("market") ?? "";
  return (
    categories.find((category) => marketCategorySlug(category) === requestedMarket) ??
    defaultMarketCategory
  );
};

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

const marketAcceptsBets = (market: BettingMarket, now: number): boolean => {
  const isStagedWinnerNoMarket =
    import.meta.env.DEV && market.id === winnerNoMarketId && market.status === "suspended";
  return (
    (market.status === "open" || isStagedWinnerNoMarket) &&
    (!market.closesAt || Date.parse(market.closesAt) > now)
  );
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

const previewSettledBetStatuses = (bets: TournamentBet[], enabled: boolean): TournamentBet[] => {
  if (!enabled) return bets;
  return bets.map((bet, index) => {
    if (index === 0) {
      return {
        ...bet,
        status: "won",
        payout: bet.potentialPayout,
        settledAt: bet.placedAt,
      };
    }
    if (index === 1) {
      return { ...bet, status: "lost", payout: 0, settledAt: bet.placedAt };
    }
    return bet;
  });
};

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
  bets: TournamentBet[];
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
            const market = marketForBet(markets, bet);
            const historyContext =
              market?.marketKind === "outright" ? "" : (market?.roundName ?? "AWC 2026");
            const countryCode = countryByPlayer[bet.selection.toLowerCase()] ?? "";
            const payout = bet.status === "open" ? bet.potentialPayout : bet.payout;
            return (
              <tr key={bet.id}>
                <th className="betHistorySelection" scope="row">
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
                  <span className="betHistoryMarket">
                    {market?.label || bet.marketId}
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
                  <strong>{bet.priceCents}%</strong>
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
                  <span className={`betStatus betStatus--${bet.status}`}>
                    {bet.status === "open" ? "Open" : bet.status}
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
  const demoState = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get("demo")
    : null;
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

  const marketsQuery = useQuery(bettingMarketsQueryOptions());
  const betsQuery = useQuery({
    ...tournamentBetsQueryOptions(username),
    enabled: isAuthenticated,
  });
  const allBetsQuery = useQuery({
    ...allTournamentBetsQueryOptions(),
    enabled: view === "all",
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
  const countryByPlayer = countriesQuery.data ?? {};
  const markets = useMemo(() => marketsQuery.data ?? [], [marketsQuery.data]);
  const openMarkets = useMemo(
    () => markets.filter((market) => marketAcceptsBets(market, currentTime)),
    [currentTime, markets],
  );
  const marketCategories = useMemo(
    () =>
      Array.from(
        new Map(
          [...openMarkets]
            .sort((a, b) => a.categoryOrder - b.categoryOrder)
            .map((market) => [market.category, market.categoryOrder]),
        ).keys(),
      ),
    [openMarkets],
  );
  const visibleMarkets = useMemo(
    () =>
      openMarkets.filter(
        (market) =>
          market.category === marketCategory &&
          (marketCategory !== "AWC Champion" || winnerPositionForMarket(market) === winnerPosition),
      ),
    [marketCategory, openMarkets, winnerPosition],
  );
  const showWinnerPositionToggle =
    marketCategory === "AWC Champion" &&
    openMarkets.some((market) => market.id === winnerNoMarketId);
  const demoSelfPlayer =
    demoState === "self" ? visibleMarkets[0]?.outcomes[0]?.player.toLowerCase() : undefined;
  const demoLimitPlayer =
    demoState === "limit" ? visibleMarkets[0]?.outcomes[0]?.player.toLowerCase() : undefined;
  const marketGroups = useMemo(() => {
    const groups = new Map<string, BettingMarket[]>();
    visibleMarkets.forEach((market) => {
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
  const marketStakeLimit = selectedMarket?.category === "Banned" ? 200 : MAX_BET_STAKE;
  const stake = Number(stakeInput);
  const validStake =
    Number.isInteger(stake) && stake >= MIN_BET_AMOUNT && stake <= marketStakeLimit;
  const quote = quoteTournamentBet(validStake ? stake : 0, selectedPrice);
  const balance = coinSummaryQuery.data?.balance ?? 0;
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
    selection && selectedMarket && (isAuthenticated || demoState === "self")
      ? isTournamentBetOnOpponent(selectedMarket, demoSelfPlayer ?? username, selection.player)
      : false;
  const selectionIsSelfNotToWin =
    selection && (isAuthenticated || demoState === "self")
      ? isAwcNotToWinSelfBet(selection.marketId, demoSelfPlayer ?? username, selection.player)
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
  };

  const selectWinnerPosition = (nextPosition: WinnerPosition) => {
    if (nextPosition === winnerPosition) return;
    setWinnerPosition(nextPosition);
    setSelection(null);
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
            All bets
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
          <section className="bettingMarketView" role="tabpanel">
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
                {demoSelfPlayer ? (
                  <InlineState kind="info">
                    Example: signed in as {visibleMarkets[0]?.outcomes[0]?.player}. Their opponent’s
                    outcome is unavailable.
                  </InlineState>
                ) : null}
                {demoLimitPlayer ? (
                  <InlineState kind="info">
                    Example: the {visibleMarkets[0]?.outcomes[0]?.player} position already uses 50%
                    of this user’s net worth. Other outcomes remain available.
                  </InlineState>
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
                                (isAuthenticated || demoState === "self") &&
                                outcome.player.toLowerCase() ===
                                  (demoSelfPlayer ?? username.toLowerCase());
                              const isOpponentOutcome =
                                (isAuthenticated || demoState === "self") &&
                                isTournamentBetOnOpponent(
                                  market,
                                  demoSelfPlayer ?? username,
                                  outcome.player,
                                );
                              const isSelfNotToWinOutcome =
                                (isAuthenticated || demoState === "self") &&
                                isAwcNotToWinSelfBet(
                                  market.id,
                                  demoSelfPlayer ?? username,
                                  outcome.player,
                                );
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
                                outcome.player.toLowerCase() === demoLimitPlayer ||
                                (isAuthenticated &&
                                  maxTournamentBetStake(balance, openBetCost, positionCost) <
                                    MIN_BET_AMOUNT);
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
                                      {market.category === "Banned" ? "Yes · " : ""}
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
                ) : (
                  <InlineState kind="empty">No AWC 2026 markets are open.</InlineState>
                )}
              </div>
            </div>

            <aside className="betSlip" aria-labelledby="bet-slip-title" ref={betSlipRef}>
              <h2 id="bet-slip-title">Bet slip</h2>
              {selectedMarket && selection ? (
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
                          {selectedMarket.category === "Banned"
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
                      : selectedMarket.category === "Banned"
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
                bets={previewSettledBetStatuses(
                  allBetsQuery.data ?? [],
                  import.meta.env.DEV && demoState === "statuses",
                )}
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
