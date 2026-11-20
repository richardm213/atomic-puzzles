import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { announceCoinChange, previewCoinChange } from "../../lib/coins/coinEvents";
import { coinQueryKeys } from "../../lib/coins/coinQueries";
import { CoinEarnedToast } from "./CoinEarnedToast";

vi.mock("../../context/AppSettings", () => ({
  useAppSettings: () => ({ showCoinChangePopups: false }),
}));

afterEach(cleanup);

describe("CoinEarnedToast", () => {
  it("refreshes the wallet without adding a reward the balance already includes", () => {
    const queryClient = new QueryClient();
    const summaryKey = coinQueryKeys.summary("Solver");
    queryClient.setQueryData(summaryKey, {
      balance: 100.25,
      dailyClaimAvailable: false,
      awarded: 0,
    });
    render(
      <QueryClientProvider client={queryClient}>
        <CoinEarnedToast />
      </QueryClientProvider>,
    );

    act(() => previewCoinChange(2.5, "Puzzle test"));
    expect(queryClient.getQueryState(summaryKey)?.isInvalidated).toBe(false);

    act(() => announceCoinChange(2.5, "Puzzle solved"));

    expect(queryClient.getQueryState(summaryKey)).toMatchObject({
      data: { balance: 100.25 },
      isInvalidated: true,
    });
  });
});
