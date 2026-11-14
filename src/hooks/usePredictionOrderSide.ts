import { useEffect } from "react";

import {
  availablePredictionContracts,
  MAX_PREDICTION_ORDER_QUANTITY,
  type PredictionOrderSide,
  type PredictionOutcome,
  type PredictionPosition,
} from "../lib/predictionMarkets/predictionMarkets";

export const usePredictionOrderSide = ({
  positions,
  isAuthenticated,
  side,
  outcome,
  quantityInput,
  onSideChange,
  onOutcomeChange,
  onQuantityChange,
  onSelectionChange,
}: {
  positions: readonly PredictionPosition[] | undefined;
  isAuthenticated: boolean;
  side: PredictionOrderSide;
  outcome: PredictionOutcome;
  quantityInput: string;
  onSideChange: (side: PredictionOrderSide) => void;
  onOutcomeChange: (outcome: PredictionOutcome) => void;
  onQuantityChange: (quantity: string) => void;
  onSelectionChange: () => void;
}) => {
  const availableByOutcome = availablePredictionContracts(positions);
  const availableContracts = availableByOutcome[outcome];
  const quantity = Number(quantityInput);
  const validQuantity =
    Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_PREDICTION_ORDER_QUANTITY;
  const canSell = isAuthenticated && (availableByOutcome.yes >= 1 || availableByOutcome.no >= 1);

  useEffect(() => {
    if (side === "sell" && !canSell) onSideChange("buy");
  }, [canSell, side, onSideChange]);

  const clampSellQuantity = (nextOutcome: PredictionOutcome) => {
    const available = Math.floor(availableByOutcome[nextOutcome]);
    if (!validQuantity || quantity > available) onQuantityChange(String(available));
  };
  return {
    availableByOutcome,
    availableContracts,
    canSell,
    hasSellInventory:
      side === "buy" || (isAuthenticated && validQuantity && quantity <= availableContracts),
    selectSide: (nextSide: PredictionOrderSide) => {
      onSelectionChange();
      onSideChange(nextSide);
      if (nextSide !== "sell") return;
      const nextOutcome =
        availableContracts >= 1 ? outcome : availableByOutcome.yes >= 1 ? "yes" : "no";
      onOutcomeChange(nextOutcome);
      clampSellQuantity(nextOutcome);
    },
    selectOutcome: (nextOutcome: PredictionOutcome) => {
      onSelectionChange();
      onOutcomeChange(nextOutcome);
      if (side === "sell") clampSellQuantity(nextOutcome);
    },
  };
};
