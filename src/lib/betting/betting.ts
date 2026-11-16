import { z } from "zod";

import { type VoteValue, voteValueSchema } from "../../../shared/domain/voting";
import { postApi } from "../api/postApi";
import {
  type PredictionHistoryPosition,
  predictionHistoryPositionSchema,
} from "../predictionMarkets/predictionMarkets";

export {
  awcChampionOutcomeRestrictions,
  findCurrentTournamentOpponent,
  isPredictionOrderAgainstOutcome,
  isRestrictedAwcChampionOrder,
  isRestrictedAwcRoundOf16Order,
  isRestrictedPredictionOrder,
  MIN_BET_AMOUNT,
  type PredictionOrderRestriction,
  predictionOrderRestrictionMessage,
} from "../../../shared/domain/betting";

export const MAX_BET_STAKE = 1000;

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
  userVote: VoteValue;
  createdAt: string;
};

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
  userVote: voteValueSchema,
  createdAt: z.string(),
});
const marketSuggestionsResponseSchema = z.object({ result: z.array(marketSuggestionSchema) });
const marketSuggestionResponseSchema = z.object({ result: marketSuggestionSchema });
const marketSuggestionVoteResponseSchema = z.object({
  result: z.object({
    suggestionId: z.number(),
    userVote: voteValueSchema,
  }),
});

const predictionPositionsResponseSchema = z.object({
  result: z.array(predictionHistoryPositionSchema),
});

export const fetchAllPredictionPositions = async (): Promise<PredictionHistoryPosition[]> => {
  const response = await postApi(
    "/api/betting",
    { action: "predictionPositions" },
    {
      schema: predictionPositionsResponseSchema,
      errorMessage: "Unable to load prediction positions.",
      invalidMessage: "The betting service returned invalid prediction positions.",
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
  vote: VoteValue;
}): Promise<{ suggestionId: number; userVote: VoteValue }> => {
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
