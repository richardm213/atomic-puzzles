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

export const calculatePredictionPositionHistory = (
  fills: PredictionPositionFill[],
  username: string,
  initialPositions?: Partial<Record<"yes" | "no", { quantity: number; costCents: number }>>,
) => {
  const normalizedUsername = username.toLowerCase();
  const positions = {
    yes: { quantity: 0, costCents: 0, ...initialPositions?.yes },
    no: { quantity: 0, costCents: 0, ...initialPositions?.no },
  };

  const closed = {
    yes: { costCents: 0, proceedsCents: 0, quantity: 0 },
    no: { costCents: 0, proceedsCents: 0, quantity: 0 },
  };
  const addPosition = (outcome: "yes" | "no", quantity: number, priceCents: number) => {
    const position = positions[outcome];
    const oppositePosition = positions[oppositeOutcome(outcome)];
    const offsetQuantity = Math.min(quantity, oppositePosition.quantity);

    if (offsetQuantity > 0) {
      const cost = (oppositePosition.costCents / oppositePosition.quantity) * offsetQuantity;
      const realized = closed[oppositeOutcome(outcome)];
      realized.costCents += cost + priceCents * offsetQuantity;
      realized.proceedsCents += 100 * offsetQuantity;
      realized.quantity += 2 * offsetQuantity;
      oppositePosition.costCents -= cost;
      oppositePosition.quantity -= offsetQuantity;
      if (oppositePosition.quantity === 0) oppositePosition.costCents = 0;
    }

    const remainingQuantity = quantity - offsetQuantity;
    position.quantity += remainingQuantity;
    position.costCents += priceCents * remainingQuantity;
  };

  const initialOffsetQuantity = Math.min(positions.yes.quantity, positions.no.quantity);
  if (initialOffsetQuantity > 0) {
    for (const outcome of ["yes", "no"] as const) {
      const position = positions[outcome];
      const cost = (position.costCents / position.quantity) * initialOffsetQuantity;
      closed.yes.costCents += cost;
      closed.yes.quantity += initialOffsetQuantity;
      position.costCents -= cost;
      position.quantity -= initialOffsetQuantity;
      if (position.quantity === 0) position.costCents = 0;
    }
  }

  closed.yes.proceedsCents += initialOffsetQuantity * 100;
  for (const fill of [...fills].sort(
    (left, right) => left.created_at.localeCompare(right.created_at) || left.id - right.id,
  )) {
    const position = positions[fill.outcome];
    const pairedSell = fill.pair_key !== null && fill.seller_username !== null;

    if (fill.buyer_username === normalizedUsername && !pairedSell) {
      addPosition(fill.outcome, fill.quantity, fill.price_cents);
    }

    if (fill.seller_username === normalizedUsername && position.quantity > 0) {
      const soldQuantity = Math.min(fill.quantity, position.quantity);
      const cost = (position.costCents / position.quantity) * soldQuantity;
      closed[fill.outcome].costCents += cost;
      closed[fill.outcome].proceedsCents += fill.price_cents * soldQuantity;
      closed[fill.outcome].quantity += soldQuantity;
      position.costCents -= cost;
      position.quantity -= soldQuantity;
      if (position.quantity === 0) position.costCents = 0;
    }
  }

  return {
    yes: {
      closed: closed.yes,
      quantity: positions.yes.quantity,
      averagePriceCents:
        positions.yes.quantity > 0 ? positions.yes.costCents / positions.yes.quantity : null,
    },
    no: {
      closed: closed.no,
      quantity: positions.no.quantity,
      averagePriceCents:
        positions.no.quantity > 0 ? positions.no.costCents / positions.no.quantity : null,
    },
  };
};

export const calculatePredictionPositionCost = (
  ...args: Parameters<typeof calculatePredictionPositionHistory>
) => {
  const history = calculatePredictionPositionHistory(...args);
  const cost = ({ quantity, averagePriceCents }: typeof history.yes) => ({
    quantity,
    averagePriceCents,
  });
  return { yes: cost(history.yes), no: cost(history.no) };
};
