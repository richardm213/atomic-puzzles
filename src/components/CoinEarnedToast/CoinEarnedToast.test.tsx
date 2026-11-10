import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { coinQueryKeys } from "../../lib/coins/coinQueries";
import { CoinEarnedToast } from "./CoinEarnedToast";

vi.mock("../../context/AppSettings", () => ({
  useAppSettings: () => ({ showCoinChangePopups: false }),
}));

afterEach(cleanup);

describe("CoinEarnedToast", () => {
  it("updates the cached balance immediately when a puzzle reward arrives", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(coinQueryKeys.summary("Solver"), {
      balance: 100.25,
      dailyClaimAvailable: false,
      awarded: 0,
    });
    render(
      <QueryClientProvider client={queryClient}>
        <CoinEarnedToast />
      </QueryClientProvider>,
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("atomic-puzzles:coins-earned", {
          detail: { amount: 2.5, label: "Puzzle solved", username: "Solver" },
        }),
      );
    });

    expect(queryClient.getQueryData(coinQueryKeys.summary("Solver"))).toMatchObject({
      balance: 102.75,
    });
  });
});
