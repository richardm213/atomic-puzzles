import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MonthRank } from "../../hooks/usePlayerProfileData";
import { RatingChart, ratingGraphRows, ratingPeriodStart } from "./RatingHistoryGraph";

const row = (
  month: string,
  mode: MonthRank["mode"] = "blitz",
  rating: number | null = 1800,
): MonthRank => ({
  monthKey: month,
  monthValue: `${month}-01`,
  monthDate: new Date(`${month}-01T00:00:00Z`),
  monthLabel: month,
  mode,
  rating,
  rank: 1,
  rd: 30,
  games: 20,
});
beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("monthly rating graph", () => {
  it("uses chronological, valid monthly snapshots for only the three requested modes", () => {
    expect(
      ratingGraphRows([
        row("2026-03"),
        row("2026-01"),
        row("2026-02", "bullet", null),
        row("2026-02", "wolfrandom"),
        row("2026-02", "hyperbullet", NaN),
      ]).map((entry) => entry.monthKey),
    ).toEqual(["2026-01", "2026-03"]);
  });
  it("supports every time frame, clipping to available history", () => {
    const last = 2026 * 12 + 8,
      first = 2024 * 12;
    expect(
      ["1M", "3M", "6M", "YTD", "1Y", "All"].map((period) =>
        ratingPeriodStart(period as Parameters<typeof ratingPeriodStart>[0], first, last),
      ),
    ).toEqual([last - 1, last - 3, last - 6, 2026 * 12, last - 12, first]);
    expect(ratingPeriodStart("1Y", last - 2, last)).toBe(last - 2);
  });
  it("filters dates, toggles lines and exposes keyboard-readable monthly values", () => {
    render(
      <RatingChart
        rows={[
          row("2025-01"),
          row("2026-01"),
          row("2026-02", "bullet", 1900),
          row("2026-02", "hyperbullet", 2000),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "1M" }));
    expect(screen.getByLabelText("From month")).toHaveValue("2026-01");
    fireEvent.change(screen.getByRole("slider"), { target: { value: 2026 * 12 } });
    expect(screen.getByText("1,800")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Blitz" }));
    expect(screen.getByRole("button", { name: "Blitz" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.change(screen.getByLabelText("From month"), { target: { value: "2025-01" } });
    expect(screen.getByRole("button", { name: "1M" })).toHaveAttribute("aria-pressed", "false");
  });
  it("keeps missing months as gaps and handles single-point and empty histories", () => {
    const { container, rerender } = render(<RatingChart rows={[row("2026-01"), row("2026-03")]} />);
    expect(container.querySelector(".ratingLine")?.getAttribute("d")).not.toContain("L");
    rerender(<RatingChart rows={[row("2026-01")]} />);
    expect(screen.getByRole("slider")).toBeDisabled();
    rerender(<RatingChart rows={[]} />);
    expect(screen.getByText("No monthly leaderboard ratings available.")).toBeInTheDocument();
  });
});
