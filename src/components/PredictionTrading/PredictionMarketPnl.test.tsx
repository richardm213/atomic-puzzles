import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { PredictionMarketPnl } from "./PredictionMarketPnl";

it("shows realized P&L after exiting, hides it while holding shares, and distinguishes no trades from break-even", () => {
  const position = {
    outcome: "yes" as const,
    quantity: 5,
    reservedQuantity: 0,
    averagePriceCents: 20,
    updatedAt: "2026-11-14T00:00:00Z",
  };
  const view = render(<PredictionMarketPnl value={2.5} positions={[]} />);
  expect(screen.getByLabelText("Your profit: +2.5 coins")).toHaveTextContent("+2.5 coins");
  view.rerender(<PredictionMarketPnl value={2.5} positions={[position]} />);
  expect(screen.queryByLabelText(/^Your profit:/)).not.toBeInTheDocument();
  view.rerender(<PredictionMarketPnl value={-2.5} positions={[{ ...position, quantity: 0 }]} />);
  expect(screen.getByLabelText("Your profit: -2.5 coins")).toHaveTextContent("-2.5 coins");
  view.rerender(<PredictionMarketPnl value={undefined} positions={[]} />);
  expect(screen.queryByLabelText(/^Your profit:/)).not.toBeInTheDocument();
  view.rerender(<PredictionMarketPnl value={0} positions={[]} />);
  expect(screen.getByLabelText("Your profit: 0 coins")).toHaveTextContent("0 coins");
});
