import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { allPredictionPositionsQueryOptions } from "../../lib/betting/bettingQueries";
import {
  predictionMarketBatchQueryOptions,
  predictionMarketCatalogQueryOptions,
  predictionPriceHistoryQueryOptions,
} from "../../lib/predictionMarkets/predictionMarketQueries";
import { PredictionStrikeBets } from "./PredictionStrikeBets";

vi.mock("../PlayerLink/PlayerLink", () => ({
  PlayerLink: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
});

it.each(["resolved", "closed", "open"] as const)(
  "shows complete bettor P&L only after a strike closes (status: %s)",
  async (status) => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnMount: false } },
    });
    const definition = { id: "strike", username: "rabbier", countryCode: "US" };
    const end = Date.parse("2026-11-08T12:00:00Z");
    for (const period of ["all", "1h"] as const) {
      client.setQueryData(predictionPriceHistoryQueryOptions("strike", period).queryKey, {
        start: end - 3_600_000,
        end,
        points: [
          { time: end - 1000, open: 40, high: 60, low: 40, close: 60, price: 55, quantity: 12 },
        ],
        settlement: { time: end, price: 100 },
      });
    }
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
        closedCost: 20,
        closedProceeds: 25,
        fees: 0.5,
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
    expect(within(dialog).getByRole("tab", { name: "P&L" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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
      expect(within(dialog).getByText("35.25")).toBeInTheDocument();
      expect(within(dialog).getByText(status === "resolved" ? "+0.65" : "0")).toBeInTheDocument();
      const buyerRows = within(dialog)
        .getAllByRole("row")
        .filter((row) => row.textContent?.includes("big_buyer"));
      expect(buyerRows).toHaveLength(1);
      expect(buyerRows[0]).toHaveTextContent(status === "resolved" ? "+64.5" : "+4.5");
      expect(buyerRows[0]).not.toHaveTextContent("Both sides");
      expect(within(dialog).queryByText("unrelated")).not.toBeInTheDocument();
      expect(within(dialog).queryByText("Champion")).not.toBeInTheDocument();
      expect(within(dialog).queryByText("coins")).not.toBeInTheDocument();
      const costHeader = within(dialog).getByRole("columnheader", { name: "Cost" });
      expect(costHeader).toHaveAttribute("aria-sort", "descending");
      await user.click(within(costHeader).getByRole("button"));
      expect(costHeader).toHaveAttribute("aria-sort", "ascending");
      expect(within(dialog).getAllByRole("row")[1]).not.toHaveTextContent("big_buyer");
      const pnlTab = within(dialog).getByRole("tab", { name: "P&L" });
      pnlTab.focus();
      await user.keyboard("{ArrowRight}");
      expect(within(dialog).getByRole("tab", { name: "Price chart" })).toHaveFocus();
      const chart = within(dialog).getByRole("slider", { name: "Inspect price history" });
      expect(chart).toHaveAttribute("aria-valuetext", expect.stringContaining("100 cents"));
      chart.focus();
      await user.keyboard("{Home}");
      expect(chart).toHaveAttribute(
        "aria-valuetext",
        expect.stringContaining("55 cents, 12 contracts"),
      );
      await user.click(within(dialog).getByRole("button", { name: "No" }));
      const noChart = within(dialog).getByRole("slider");
      noChart.focus();
      await user.keyboard("{Home}");
      expect(noChart).toHaveAttribute(
        "aria-valuetext",
        expect.stringContaining("45 cents, 12 contracts"),
      );
      await user.click(within(dialog).getByRole("button", { name: "1 hr" }));
      expect(within(dialog).getByRole("button", { name: "1 hr" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await user.click(within(dialog).getByRole("tab", { name: "P&L" }));
      await user.click(within(dialog).getByRole("button", { name: "P&L" }));
      expect(within(dialog).getAllByRole("row")[1]).toHaveTextContent("big_buyer");
      await user.click(within(dialog).getByRole("button", { name: "Bettor" }));
      await user.click(within(dialog).getByRole("button", { name: "Bettor" }));
      expect(within(dialog).getAllByRole("row")[1]).not.toHaveTextContent("big_buyer");
    }
    fireEvent(dialog, new Event("close"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View bets on rabbier" }));
    expect(screen.getByRole("tab", { name: "P&L" })).toHaveAttribute("aria-selected", "true");
    client.clear();
  },
);
