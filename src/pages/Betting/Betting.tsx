import "./Betting.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";

import { InlineState } from "../../components/InlineState/InlineState";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  type BettingMarket,
  MAX_BET_STAKE,
  maxTournamentBetStake,
  placeTournamentBet,
  quoteTournamentBet,
  type TournamentBet,
} from "../../lib/betting/betting";
import {
  allTournamentBetsQueryOptions,
  bettingMarketsQueryOptions,
  bettingQueryKeys,
  tournamentBetsQueryOptions,
} from "../../lib/betting/bettingQueries";
import { formatCoinBalance } from "../../lib/coins/coinDisplay";
import { coinQueryKeys, coinSummaryQueryOptions } from "../../lib/coins/coinQueries";
import { tournamentPlayerCountriesQueryOptions } from "../../lib/matches/tournamentQueries";
import { appAssetPath } from "../../utils/appAssetPath";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { formatLocalDateTime } from "../../utils/formatters";

type BettingView = "markets" | "mine" | "all";
type Selection = { marketId: string; player: string };

const formatBetCoins = (value: number): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

const marketForBet = (markets: BettingMarket[], bet: TournamentBet) =>
  markets.find((market) => market.id === bet.marketId);

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
  const balanceLimitedStake = isAuthenticated ? maxTournamentBetStake(balance) : MAX_BET_STAKE;
  const effectiveStakeLimit = Math.min(balanceLimitedStake, marketStakeLimit);
  const exceedsBalanceLimit = isAuthenticated && validStake && quote.totalCost > balance * 0.25;
  const insufficientBalance = isAuthenticated && validStake && quote.totalCost > balance;
  const myBets = betsQuery.data ?? [];

  const placeBetMutation = useMutation({
    mutationFn: placeTournamentBet,
    onSuccess: async (result) => {
      setSuccessMessage(
        `Bet placed on ${result.bet.selection} for ${formatBetCoins(result.bet.totalCost)} coins.`,
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
    if (!selectedMarket || !selection || !validStake || exceedsBalanceLimit || insufficientBalance)
      return;
    setSuccessMessage("");
    placeBetMutation.mutate({
      marketId: selectedMarket.id,
      selection: selection.player,
      stake,
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
                      ? `Up to ${formatBetCoins(effectiveStakeLimit)} coins before the fee.`
                      : selectedMarket.category === "Banned"
                        ? "200 coin maximum · 2% fee · 25% balance limit"
                        : "2% fee · 25% balance limit"}
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
                  {insufficientBalance && !exceedsBalanceLimit ? (
                    <InlineState kind="error">
                      You need {formatBetCoins(quote.totalCost)} coins including the fee.
                    </InlineState>
                  ) : null}
                  {exceedsBalanceLimit ? (
                    <InlineState kind="error">
                      Total cost cannot exceed 25% of your balance. Your current limit is
                      {` ${formatBetCoins(balance * 0.25)} coins`} including the fee.
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
                        exceedsBalanceLimit ||
                        insufficientBalance ||
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
