import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import {
  allPredictionPositionsQueryOptions,
  allTournamentBetsQueryOptions,
} from "../../lib/betting/bettingQueries";
import {
  predictionMarketBatchQueryOptions,
  predictionMarketCatalogQueryOptions,
} from "../../lib/predictionMarkets/predictionMarketQueries";
import { PredictionStrikeBets } from "./PredictionStrikeBets";

vi.mock("../PlayerLink/PlayerLink", () => ({
  PlayerLink: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
});

it.each(["resolved", "open"] as const)(
  "shows bet details only for resolved strikes (status: %s)",
  async (status) => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const definition = { id: "strike", username: "rabbier", countryCode: "US" };
    client.setQueryData(allTournamentBetsQueryOptions().queryKey, []);
    client.setQueryData(allPredictionPositionsQueryOptions().queryKey, [
      {
        marketId: "strike",
        username: "buyer",
        outcome: "yes",
        quantity: 1,
        reservedQuantity: 0,
        averagePriceCents: 35.25,
        updatedAt: "2026-11-08T00:00:00Z",
      },
      {
        marketId: "strike",
        username: "big_buyer",
        outcome: "yes",
        quantity: 100,
        reservedQuantity: 0,
        averagePriceCents: 40,
        updatedAt: "2026-11-07T00:00:00Z",
      },
      {
        marketId: "other",
        username: "unrelated",
        outcome: "yes",
        quantity: 100,
        reservedQuantity: 0,
        averagePriceCents: 50,
        updatedAt: "2026-11-08T00:00:00Z",
      },
    ]);
    client.setQueryData(predictionMarketCatalogQueryOptions().queryKey, [
      {
        id: "group",
        path: "/betting/group",
        title: "Champion",
        description: "",
        displayOrder: 0,
        markets: [definition],
      },
    ]);
    client.setQueryData(predictionMarketBatchQueryOptions(["strike"]).queryKey, [
      {
        market: {
          id: "strike",
          question: "Champion?",
          resolutionRules: "",
          resolutionSourceUrl: "https://example.com",
          closesAt: "2026-12-01T00:00:00Z",
          settlementReferenceFillId: null,
          sportsbookVolumeCoins: 0,
          exchangeVolumeCoins: 0,
          status,
          outcome: "yes",
          resolvedAt: null,
          settlementPriceCents: null,
        },
        book: { yes: { bids: [], asks: [] }, no: { bids: [], asks: [] } },
        fills: [],
        positions: [],
        orders: [],
      },
    ]);
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <PredictionStrikeBets definition={definition}>rabbier</PredictionStrikeBets>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View bets on rabbier" }));
    const dialog = screen.getByRole("dialog");
    if (status === "open") {
      expect(within(dialog).queryByRole("table")).not.toBeInTheDocument();
      expect(within(dialog).getByText("This strike is still pending.")).toBeInTheDocument();
    } else {
      expect(within(dialog).getByRole("columnheader", { name: "Avg. price" })).toBeInTheDocument();
      expect(
        within(dialog).queryByRole("columnheader", { name: "Status" }),
      ).not.toBeInTheDocument();
      expect(within(dialog).getByText("buyer")).toBeInTheDocument();
      expect(within(dialog).getAllByRole("row")[1]).toHaveTextContent("big_buyer");
      expect(within(dialog).getByText("35.3")).toBeInTheDocument();
      expect(within(dialog).getByText("+0.65")).toBeInTheDocument();
      expect(within(dialog).queryByText("unrelated")).not.toBeInTheDocument();
      expect(within(dialog).queryByText("Champion")).not.toBeInTheDocument();
      expect(within(dialog).queryByText("coins")).not.toBeInTheDocument();
      const costHeader = within(dialog).getByRole("columnheader", { name: "Cost" });
      expect(costHeader).toHaveAttribute("aria-sort", "descending");
      await user.click(within(costHeader).getByRole("button"));
      expect(costHeader).toHaveAttribute("aria-sort", "ascending");
      expect(within(dialog).getAllByRole("row")[1]).not.toHaveTextContent("big_buyer");
      await user.click(within(dialog).getByRole("button", { name: "P&L" }));
      expect(within(dialog).getAllByRole("row")[1]).toHaveTextContent("big_buyer");
      await user.click(within(dialog).getByRole("button", { name: "Bettor" }));
      await user.click(within(dialog).getByRole("button", { name: "Bettor" }));
      expect(within(dialog).getAllByRole("row")[1]).not.toHaveTextContent("big_buyer");
    }
    fireEvent(dialog, new Event("close"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    client.clear();
  },
);
