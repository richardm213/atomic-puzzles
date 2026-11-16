import { z } from "zod";

import { postApi } from "../api/postApi";
import {
  predictionHistoryPositionSchema,
  predictionMarketCatalogRowSchema,
  predictionMarketGroupsFromRows,
  predictionMarketStateResultSchema,
} from "../predictionMarkets/predictionMarkets";

const bettingBootstrapSchema = z.object({
  result: z.object({
    exchangeMarkets: z.array(predictionMarketCatalogRowSchema),
    allPredictionPositions: z.array(predictionHistoryPositionSchema),
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
    predictionMarketGroups: predictionMarketGroupsFromRows(response.result.exchangeMarkets),
    predictionPositions: response.result.allPredictionPositions,
    predictionMarketStates: response.result.exchangeMarketStates,
  };
};
