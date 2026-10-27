export type PredictionBookOrder = {
  outcome: "yes" | "no";
  side: "buy" | "sell";
  price_cents: number;
  remaining_quantity: number;
  status: string;
};

type PredictionBookLevel = { priceCents: number; quantity: number };

const oppositeOutcome = (outcome: "yes" | "no") => (outcome === "yes" ? "no" : "yes");
const oppositeSide = (side: "buy" | "sell") => (side === "buy" ? "sell" : "buy");

export const buildPredictionBook = (orders: PredictionBookOrder[]) => {
  const levels = {
    yes: { buy: new Map<number, number>(), sell: new Map<number, number>() },
    no: { buy: new Map<number, number>(), sell: new Map<number, number>() },
  };

  const addLevel = (
    outcome: "yes" | "no",
    side: "buy" | "sell",
    priceCents: number,
    quantity: number,
  ) => {
    const sideLevels = levels[outcome][side];
    sideLevels.set(priceCents, (sideLevels.get(priceCents) ?? 0) + quantity);
  };

  for (const order of orders) {
    if (!["open", "partial"].includes(order.status) || order.remaining_quantity <= 0) continue;
    addLevel(order.outcome, order.side, order.price_cents, order.remaining_quantity);
    addLevel(
      oppositeOutcome(order.outcome),
      oppositeSide(order.side),
      100 - order.price_cents,
      order.remaining_quantity,
    );
  }

  const present = (sideLevels: Map<number, number>, side: "buy" | "sell") =>
    Array.from(sideLevels, ([priceCents, quantity]): PredictionBookLevel => ({
      priceCents,
      quantity,
    })).sort((left, right) =>
      side === "buy" ? right.priceCents - left.priceCents : left.priceCents - right.priceCents,
    );

  return {
    yes: { bids: present(levels.yes.buy, "buy"), asks: present(levels.yes.sell, "sell") },
    no: { bids: present(levels.no.buy, "buy"), asks: present(levels.no.sell, "sell") },
  };
};
