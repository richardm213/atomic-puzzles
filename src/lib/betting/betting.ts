import { z } from "zod";

import { postApi } from "../api/postApi";

export { MIN_BET_AMOUNT } from "../../../shared/domain/betting";

export const BET_FEE_RATE = 0.02;
export const BET_NET_WORTH_LIMIT_RATE = 0.5;
export const MAX_BET_STAKE = 1000;

export type BettingMarketStatus = "open" | "suspended" | "settled" | "refunded";
export type TournamentBetStatus = "open" | "won" | "lost" | "refunded";

export type BettingOutcome = {
  player: string;
  pricePercent: number;
  displayOrder: number;
};

export type BettingMarket = {
  id: string;
  tournamentId: string;
  bracketMatchId: string;
  roundName: string;
  roundOrder: number;
  playerOne: string;
  playerTwo: string;
  playerOnePrice: number;
  playerTwoPrice: number;
  marketKind: "match" | "outright";
  category: string;
  categoryOrder: number;
  label: string;
  outcomes: BettingOutcome[];
  status: BettingMarketStatus;
  winner: string | null;
  closesAt: string | null;
  updatedAt: string;
  settledAt: string | null;
};

export type TournamentBet = {
  id: number;
  marketId: string;
  username: string;
  selection: string;
  priceCents: number;
  stake: number;
  fee: number;
  totalCost: number;
  potentialPayout: number;
  status: TournamentBetStatus;
  payout: number;
  placedAt: string;
  settledAt: string | null;
};

export type BetQuote = {
  stake: number;
  fee: number;
  totalCost: number;
  potentialPayout: number;
  potentialProfit: number;
};

export type MarketSuggestionOutcome = {
  label: string;
  odds: number;
};

export type MarketSuggestion = {
  id: number;
  username: string;
  question: string;
  outcomes: MarketSuggestionOutcome[];
  score: number;
  upvotes: number;
  downvotes: number;
  userVote: -1 | 0 | 1;
  createdAt: string;
};

const championWithMatchingCase = (winner: string): string =>
  winner === winner.toUpperCase()
    ? "CHAMPION"
    : winner[0] === winner[0]?.toUpperCase()
      ? "Champion"
      : "champion";

const formatAwcChampionTerminology = (value: string): string =>
  value
    .replace(
      /\b(AWC(?:\s+\d{4})?)\s+(winner)\b/gi,
      (_match, eventName: string, winner: string) =>
        `${eventName} ${championWithMatchingCase(winner)}`,
    )
    .replace(
      /\b(Tournament)\s+(winner)\b/gi,
      (_match, tournament: string, winner: string) =>
        `${tournament} ${championWithMatchingCase(winner)}`,
    );

const formatBettingMarketLabel = (value: string): string => {
  const championLabel = formatAwcChampionTerminology(value);
  return /^new_life14 banned on Lichess by Dec 31, 2026$/i.test(championLabel)
    ? "Banned by Dec 31"
    : championLabel;
};

const roundCoins = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

export const maxTournamentBetStake = (
  balance: number,
  openBetCost = 0,
  positionBetCost = 0,
): number => {
  const normalizedBalance = Number.isFinite(balance) ? Math.max(0, balance) : 0;
  const normalizedOpenBetCost = Number.isFinite(openBetCost) ? Math.max(0, openBetCost) : 0;
  const normalizedPositionBetCost = Number.isFinite(positionBetCost)
    ? Math.max(0, positionBetCost)
    : 0;
  const netWorth = normalizedBalance + normalizedOpenBetCost;
  const remainingBetBudget = Math.max(
    0,
    netWorth * BET_NET_WORTH_LIMIT_RATE - normalizedPositionBetCost,
  );
  const availableCost = Math.min(normalizedBalance, remainingBetBudget);
  return Math.min(MAX_BET_STAKE, Math.floor(availableCost / (1 + BET_FEE_RATE)));
};

export const quoteTournamentBet = (stake: number, priceCents: number): BetQuote => {
  const normalizedStake = Number.isFinite(stake) ? Math.max(0, stake) : 0;
  const normalizedPrice = Number.isFinite(priceCents) ? Math.min(99, Math.max(1, priceCents)) : 50;
  const fee = roundCoins(normalizedStake * BET_FEE_RATE);
  const totalCost = roundCoins(normalizedStake + fee);
  const potentialPayout = roundCoins((normalizedStake * 100) / normalizedPrice);
  return {
    stake: normalizedStake,
    fee,
    totalCost,
    potentialPayout,
    potentialProfit: roundCoins(potentialPayout - totalCost),
  };
};

const marketSchema = z
  .object({
    id: z.string(),
    tournament_id: z.string(),
    bracket_match_id: z.string(),
    round_name: z.string(),
    round_order: z.number(),
    player_one: z.string(),
    player_two: z.string(),
    player_one_price: z.number(),
    player_two_price: z.number(),
    market_kind: z.enum(["match", "outright"]),
    category: z.string(),
    category_order: z.number(),
    label: z.string(),
    tournament_betting_outcomes: z.array(
      z.object({
        player: z.string(),
        price_percent: z.number(),
        display_order: z.number(),
      }),
    ),
    status: z.enum(["open", "suspended", "settled", "refunded"]),
    winner: z.string().nullable(),
    closes_at: z.string().nullable(),
    updated_at: z.string(),
    settled_at: z.string().nullable(),
  })
  .transform((market): BettingMarket => ({
    id: market.id,
    tournamentId: market.tournament_id,
    bracketMatchId: market.bracket_match_id,
    roundName: formatAwcChampionTerminology(market.round_name),
    roundOrder: market.round_order,
    playerOne: market.player_one,
    playerTwo: market.player_two,
    playerOnePrice: market.player_one_price,
    playerTwoPrice: market.player_two_price,
    marketKind: market.market_kind,
    category: formatAwcChampionTerminology(market.category),
    categoryOrder: market.category_order,
    label: formatBettingMarketLabel(market.label),
    outcomes: market.tournament_betting_outcomes
      .map((outcome) => ({
        player: outcome.player,
        pricePercent: outcome.price_percent,
        displayOrder: outcome.display_order,
      }))
      .sort((a, b) => a.displayOrder - b.displayOrder),
    status: market.status,
    winner: market.winner,
    closesAt: market.closes_at,
    updatedAt: market.updated_at,
    settledAt: market.settled_at,
  }));

const betSchema = z
  .object({
    id: z.number(),
    market_id: z.string(),
    username: z.string(),
    selection: z.string(),
    price_cents: z.number(),
    stake: z.number(),
    fee: z.number(),
    total_cost: z.number(),
    potential_payout: z.number(),
    status: z.enum(["open", "won", "lost", "refunded"]),
    payout: z.number(),
    placed_at: z.string(),
    settled_at: z.string().nullable(),
  })
  .transform((bet): TournamentBet => ({
    id: bet.id,
    marketId: bet.market_id,
    username: bet.username,
    selection: bet.selection,
    priceCents: bet.price_cents,
    stake: bet.stake,
    fee: bet.fee,
    totalCost: bet.total_cost,
    potentialPayout: bet.potential_payout,
    status: bet.status,
    payout: bet.payout,
    placedAt: bet.placed_at,
    settledAt: bet.settled_at,
  }));

const marketsResponseSchema = z.object({ result: z.array(marketSchema) });
const betsResponseSchema = z.object({ result: z.array(betSchema) });
const placeBetResponseSchema = z.object({
  result: z.object({
    balance: z.number(),
    bet: betSchema,
  }),
});

const marketSuggestionSchema = z.object({
  id: z.number(),
  username: z.string(),
  question: z.string(),
  outcomes: z.array(
    z.object({
      label: z.string(),
      odds: z.number(),
    }),
  ),
  score: z.number(),
  upvotes: z.number(),
  downvotes: z.number(),
  userVote: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  createdAt: z.string(),
});
const marketSuggestionsResponseSchema = z.object({ result: z.array(marketSuggestionSchema) });
const marketSuggestionResponseSchema = z.object({ result: marketSuggestionSchema });
const marketSuggestionVoteResponseSchema = z.object({
  result: z.object({
    suggestionId: z.number(),
    userVote: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  }),
});

export const fetchBettingMarkets = async (): Promise<BettingMarket[]> => {
  const response = await postApi(
    "/api/betting",
    { action: "markets" },
    {
      schema: marketsResponseSchema,
      errorMessage: "Unable to load betting markets.",
      invalidMessage: "The betting service returned invalid markets.",
    },
  );
  return response.result;
};

export const fetchMyTournamentBets = async (): Promise<TournamentBet[]> => {
  const response = await postApi(
    "/api/betting",
    { action: "bets" },
    {
      schema: betsResponseSchema,
      errorMessage: "Unable to load your bets.",
      invalidMessage: "The betting service returned invalid bets.",
    },
  );
  return response.result;
};

export const fetchAllTournamentBets = async (): Promise<TournamentBet[]> => {
  const response = await postApi(
    "/api/betting",
    { action: "allBets" },
    {
      schema: betsResponseSchema,
      errorMessage: "Unable to load all bets.",
      invalidMessage: "The betting service returned invalid bets.",
    },
  );
  return response.result;
};

export const placeTournamentBet = async ({
  marketId,
  selection,
  stake,
}: {
  marketId: string;
  selection: string;
  stake: number;
}): Promise<{ balance: number; bet: TournamentBet }> => {
  const response = await postApi(
    "/api/betting",
    { action: "place", marketId, selection, stake },
    {
      schema: placeBetResponseSchema,
      errorMessage: "Unable to place your bet.",
      invalidMessage: "The betting service returned invalid bet details.",
    },
  );
  return response.result;
};

export const fetchMarketSuggestions = async (): Promise<MarketSuggestion[]> => {
  const response = await postApi(
    "/api/betting",
    { action: "suggestions" },
    {
      schema: marketSuggestionsResponseSchema,
      errorMessage: "Unable to load market suggestions.",
      invalidMessage: "The betting service returned invalid suggestions.",
    },
  );
  return response.result;
};

export const suggestMarket = async ({
  question,
  outcomes,
}: {
  question: string;
  outcomes: MarketSuggestionOutcome[];
}): Promise<MarketSuggestion> => {
  const response = await postApi(
    "/api/betting",
    { action: "suggest", question, outcomes },
    {
      schema: marketSuggestionResponseSchema,
      errorMessage: "Unable to submit this market suggestion.",
      invalidMessage: "The betting service returned an invalid suggestion.",
    },
  );
  return response.result;
};

export const voteOnMarketSuggestion = async ({
  suggestionId,
  vote,
}: {
  suggestionId: number;
  vote: -1 | 0 | 1;
}): Promise<{ suggestionId: number; userVote: -1 | 0 | 1 }> => {
  const response = await postApi(
    "/api/betting",
    { action: "voteSuggestion", suggestionId, vote },
    {
      schema: marketSuggestionVoteResponseSchema,
      errorMessage: "Unable to record your vote.",
      invalidMessage: "The betting service returned an invalid vote.",
    },
  );
  return response.result;
};
