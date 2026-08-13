import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import type { RankingsByMode } from "../lib/rankings/rankingsByMonth";
import { loadRankingsForMonth } from "../lib/rankings/rankingsByMonth";
import { useRankingsByMonth } from "./useRankingsByMonth";

vi.mock("../lib/rankings/rankingsByMonth", () => ({
  loadRankingsForMonth: vi.fn(),
}));

const mockedLoadRankingsForMonth = vi.mocked(loadRankingsForMonth);

const createWrapper = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
};

describe("useRankingsByMonth", () => {
  beforeEach(() => {
    mockedLoadRankingsForMonth.mockReset();
  });

  it("loads and caches rankings by month", async () => {
    const januaryRankings = { bullet: { players: [] } } as unknown as RankingsByMode;
    mockedLoadRankingsForMonth.mockResolvedValue(januaryRankings);

    const { result, rerender } = renderHook(
      ({ month }: { month: string | null }) => useRankingsByMonth(month),
      {
        initialProps: { month: "January 2026" as string | null },
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.rankingsByMonth.get("January 2026")).toBe(januaryRankings);
    });

    rerender({ month: null });
    rerender({ month: "January 2026" });

    await waitFor(() => {
      expect(result.current.rankingsByMonth.get("January 2026")).toBe(januaryRankings);
    });
    expect(mockedLoadRankingsForMonth).toHaveBeenCalledTimes(1);
  });

  it("exposes a failed request as the existing string error API", async () => {
    mockedLoadRankingsForMonth.mockRejectedValue(new Error("Leaderboard unavailable"));

    const { result } = renderHook(() => useRankingsByMonth("January 2026"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBe("Leaderboard unavailable");
    });
    expect(result.current.rankingsByMonth).toEqual(new Map());
  });
});
