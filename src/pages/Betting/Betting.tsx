import "./Betting.css";

import { faPlus, faThumbsDown, faThumbsUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";

import { InlineState } from "../../components/InlineState/InlineState";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  BET_NET_WORTH_LIMIT_RATE,
  type BettingMarket,
  type MarketSuggestion,
  MAX_BET_STAKE,
  maxTournamentBetStake,
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
type Selection = { marketId: string; player: string };
type SuggestionDraftOutcome = { label: string; odds: string };

const formatBetCoins = (value: number): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

const marketForBet = (markets: BettingMarket[], bet: TournamentBet) =>
  markets.find((market) => market.id === bet.marketId);

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
  emptyMessage,
  showUsername = false,
}: {
  bets: TournamentBet[];
  markets: BettingMarket[];
  emptyMessage: string;
  showUsername?: boolean;
}) => {
  if (!bets.length) return <InlineState kind="empty">{emptyMessage}</InlineState>;
  return (
    <div className="betHistoryList">
      {bets.map((bet) => {
        const market = marketForBet(markets, bet);
        return (
          <article className="betHistoryRow" key={bet.id}>
            <div className="betHistoryMatch">
              <span className="betHistoryMeta">
                {market?.roundName ?? "AWC 2026"}
                {showUsername ? (
                  <>
                    {" · "}
                    <Link to="/@/$username" params={{ username: bet.username }}>
                      {bet.username}
                    </Link>
                  </>
                ) : null}
              </span>
              <strong>{bet.selection}</strong>
              <small>{market?.label || bet.marketId}</small>
            </div>
            <dl>
              <div>
                <dt>Price</dt>
                <dd>{bet.priceCents}%</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>{formatBetCoins(bet.totalCost)}</dd>
              </div>
              <div>
                <dt>{bet.status === "open" ? "Possible payout" : "Payout"}</dt>
                <dd>{formatBetCoins(bet.status === "open" ? bet.potentialPayout : bet.payout)}</dd>
              </div>
            </dl>
            <div className={`betStatus betStatus--${bet.status}`}>
              {bet.status === "open" ? "Open" : bet.status}
            </div>
            <time dateTime={bet.placedAt}>{formatLocalDateTime(bet.placedAt)}</time>
          </article>
        );
      })}
    </div>
  );
};

export const BettingPage = () => {
  const { isAuthenticated, isLoading: authLoading, login, user } = useAuth();
  const queryClient = useQueryClient();
  const username = user?.username ?? "anonymous";
  const [view, setView] = useState<BettingView>("markets");
  const [marketCategory, setMarketCategory] = useState("AWC Round of 16");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [stakeInput, setStakeInput] = useState("");
  const [stakeTouched, setStakeTouched] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [suggestionQuestion, setSuggestionQuestion] = useState("");
  const [suggestionOutcomes, setSuggestionOutcomes] = useState<SuggestionDraftOutcome[]>([
    { label: "", odds: "" },
    { label: "", odds: "" },
  ]);
  const [suggestionSubmitted, setSuggestionSubmitted] = useState(false);
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
    () => markets.filter((market) => market.status === "open"),
    [markets],
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
    () => openMarkets.filter((market) => market.category === marketCategory),
    [marketCategory, openMarkets],
  );
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
  const validStake = Number.isInteger(stake) && stake >= 1 && stake <= marketStakeLimit;
  const quote = quoteTournamentBet(validStake ? stake : 0, selectedPrice);
  const balance = coinSummaryQuery.data?.balance ?? 0;
  const myBets = betsQuery.data ?? [];
  const openBetCost = myBets.reduce(
    (total, bet) => total + (bet.status === "open" ? bet.totalCost : 0),
    0,
  );
  const netWorth = balance + openBetCost;
  const betCostLimit = netWorth * BET_NET_WORTH_LIMIT_RATE;
  const remainingBetBudget = Math.max(0, betCostLimit - openBetCost);
  const balanceLimitedStake = isAuthenticated
    ? maxTournamentBetStake(balance, openBetCost)
    : MAX_BET_STAKE;
  const effectiveStakeLimit = Math.min(balanceLimitedStake, marketStakeLimit);
  const bettingUnavailable = isAuthenticated && effectiveStakeLimit < 1;
  const exceedsNetWorthLimit =
    isAuthenticated && validStake && quote.totalCost > remainingBetBudget;
  const insufficientBalance = isAuthenticated && validStake && quote.totalCost > balance;

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
      setSuggestionOutcomes([
        { label: "", odds: "" },
        { label: "", odds: "" },
      ]);
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
    if (!selectedMarket || !selection || !validStake || exceedsNetWorthLimit || insufficientBalance)
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
            <Link
              to="/tournaments/$tournamentId/$tournamentTab"
              params={{ tournamentId: "awc2026", tournamentTab: "main" }}
            >
              View bracket
            </Link>
          </div>
          {isAuthenticated ? (
            <div className="bettingBalance" aria-live="polite">
              <img src={appAssetPath("/images/coins/gold-coin-stack-v2.png")} alt="" />
              <span>
                <strong>{formatCoinBalance(balance)}</strong>
                coins available
                <small>
                  {formatBetCoins(remainingBetBudget)} available to bet · {formatBetCoins(netWorth)}
                  net worth
                </small>
              </span>
            </div>
          ) : null}
        </header>

        <div className="bettingTabs" role="tablist" aria-label="Betting views">
          <button
            type="button"
            role="tab"
            aria-selected={view === "markets"}
            onClick={() => setView("markets")}
          >
            Markets
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "mine"}
            onClick={() => setView("mine")}
          >
            My bets{myBets.length ? ` (${myBets.length})` : ""}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "all"}
            onClick={() => setView("all")}
          >
            All bets
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "suggestions"}
            onClick={() => setView("suggestions")}
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
                    onClick={() => {
                      setMarketCategory(category);
                      setSelection(null);
                    }}
                    key={category}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <div className="bettingMarketList">
                {bettingUnavailable ? (
                  <InlineState kind="info">
                    Betting limit reached. Your open bets already use 50% of your net worth. Earn
                    more coins or wait for a bet to settle to bet again.
                  </InlineState>
                ) : null}
                {marketGroups.length ? (
                  marketGroups.map(([roundName, roundMarkets]) => (
                    <section className="bettingMarketGroup" key={roundName}>
                      <h2>{roundName}</h2>
                      {roundMarkets.map((market) => (
                        <article className="bettingMarketCard" key={market.id}>
                          <div className="bettingOutcomes">
                            {market.outcomes.map((outcome) => {
                              const isSelected =
                                selection?.marketId === market.id &&
                                selection.player === outcome.player;
                              const countryCode =
                                countryByPlayer[outcome.player.toLowerCase()] ?? "";
                              return (
                                <button
                                  type="button"
                                  className={isSelected ? "isSelected" : ""}
                                  aria-pressed={isSelected}
                                  disabled={bettingUnavailable}
                                  title={
                                    bettingUnavailable
                                      ? "Your open bets have reached 50% of your net worth."
                                      : undefined
                                  }
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
                                  <strong>
                                    {market.category === "Banned" ? "Yes · " : ""}
                                    {outcome.pricePercent}%
                                  </strong>
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
                        <em>{selectedMarket.category === "Banned" ? "Yes" : "to win"}</em>
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
                      min="1"
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
                        ? "No more bets are available at your current net worth."
                        : `Up to ${formatBetCoins(effectiveStakeLimit)} coins before the fee. Open bets are limited to 50% of net worth.`
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
                      Enter a whole number from 1 to {formatBetCoins(marketStakeLimit)}.
                    </InlineState>
                  ) : null}
                  {insufficientBalance && !exceedsNetWorthLimit ? (
                    <InlineState kind="error">
                      You need {formatBetCoins(quote.totalCost)} coins including the fee.
                    </InlineState>
                  ) : null}
                  {exceedsNetWorthLimit ? (
                    <InlineState kind="error">
                      Your open bets can use up to 50% of your net worth. You have
                      {` ${formatBetCoins(remainingBetBudget)} coins`} left to bet, including the
                      fee.
                    </InlineState>
                  ) : null}
                  {bettingUnavailable ? (
                    <InlineState kind="info">
                      Betting limit reached. Earn more coins or wait for an open bet to settle.
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
                        exceedsNetWorthLimit ||
                        insufficientBalance ||
                        bettingUnavailable ||
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
                        setSuggestionOutcomes((current) => [...current, { label: "", odds: "" }])
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
                bets={allBetsQuery.data ?? []}
                markets={markets}
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
