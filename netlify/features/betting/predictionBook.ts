import type { PredictionBookLevel } from "../../../shared/domain/betting";

export type PredictionBookOrder = {
  outcome: "yes" | "no";
  side: "buy" | "sell";
  price_cents: number;
  remaining_quantity: number;
  status: string;
  expires_at?: string | null;
};

export type PredictionPositionFill = {
  id: number;
  outcome: "yes" | "no";
  price_cents: number;
  quantity: number;
  buyer_username: string;
  seller_username: string | null;
  pair_key: string | null;
  created_at: string;
};

const oppositeOutcome = (outcome: "yes" | "no") => (outcome === "yes" ? "no" : "yes");
const oppositeSide = (side: "buy" | "sell") => (side === "buy" ? "sell" : "buy");

export const buildPredictionBook = (orders: PredictionBookOrder[], now = new Date()) => {
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
    if (order.expires_at && Date.parse(order.expires_at) <= now.getTime()) continue;
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

export const calculatePredictionPositionCost = (
  fills: PredictionPositionFill[],
  username: string,
  initialPositions?: Partial<Record<"yes" | "no", { quantity: number; costCents: number }>>,
) => {
  const normalizedUsername = username.toLowerCase();
  const positions = {
    yes: { quantity: 0, costCents: 0, ...initialPositions?.yes },
    no: { quantity: 0, costCents: 0, ...initialPositions?.no },
  };

  for (const fill of [...fills].sort(
    (left, right) => left.created_at.localeCompare(right.created_at) || left.id - right.id,
  )) {
    const position = positions[fill.outcome];
    const pairedSell = fill.pair_key !== null && fill.seller_username !== null;

    if (fill.buyer_username === normalizedUsername && !pairedSell) {
      position.quantity += fill.quantity;
      position.costCents += fill.price_cents * fill.quantity;
    }

    if (fill.seller_username === normalizedUsername && position.quantity > 0) {
      const soldQuantity = Math.min(fill.quantity, position.quantity);
      position.costCents -= (position.costCents / position.quantity) * soldQuantity;
      position.quantity -= soldQuantity;
      if (position.quantity === 0) position.costCents = 0;
    }
  }

  return {
    yes: {
      quantity: positions.yes.quantity,
      averagePriceCents:
        positions.yes.quantity > 0 ? positions.yes.costCents / positions.yes.quantity : null,
    },
    no: {
      quantity: positions.no.quantity,
      averagePriceCents:
        positions.no.quantity > 0 ? positions.no.costCents / positions.no.quantity : null,
    },
  };
};
