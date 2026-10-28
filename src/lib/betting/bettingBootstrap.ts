import { z } from "zod";

import { postApi } from "../api/postApi";
import {
  predictionMarketCatalogRowSchema,
  predictionMarketGroupsFromRows,
  predictionMarketStateResultSchema,
} from "../predictionMarkets/predictionMarkets";
import { bettingMarketSchema, tournamentBetSchema } from "./betting";

const bettingBootstrapSchema = z.object({
  result: z.object({
    markets: z.array(bettingMarketSchema),
    exchangeMarkets: z.array(predictionMarketCatalogRowSchema),
    allBets: z.array(tournamentBetSchema),
    exchangeMarketStates: z.array(predictionMarketStateResultSchema),
  }),
});

export const fetchBettingBootstrap = async () => {
  const response = await postApi(
    "/api/betting",
    { action: "bootstrap" },
    {
      schema: bettingBootstrapSchema,
      errorMessage: "Unable to load betting markets.",
      invalidMessage: "The betting service returned invalid startup data.",
    },
  );
  return {
    markets: response.result.markets,
    predictionMarketGroups: predictionMarketGroupsFromRows(response.result.exchangeMarkets),
    allBets: response.result.allBets,
    predictionMarketStates: response.result.exchangeMarketStates,
  };
};
