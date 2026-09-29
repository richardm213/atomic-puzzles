import { cleanup, fireEvent, render as testingRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppSettingsProvider, useAppSettings } from "../../context/AppSettings";
import type { MonthRank } from "../../hooks/usePlayerProfileData";
import {
  RatingChart,
  ratingGraphRows,
  ratingGraphScale,
  ratingPeriodStart,
  weekIndex,
  weeklyPeriodStart,
} from "./RatingHistoryGraph";

const SettingsControl = () => {
  const {
    ratingGraphDots,
    setRatingGraphDots,
    showRatingGraphLines,
    setShowRatingGraphLines,
    hiddenRatingGraphModes,
    setHiddenRatingGraphModes,
  } = useAppSettings();
  return (
    <>
      <label>
        Dots
        <select
          value={ratingGraphDots}
          onChange={(event) => setRatingGraphDots(event.target.value as "auto" | "show" | "hide")}
        >
          <option value="auto">Auto</option>
          <option value="show">Show</option>
          <option value="hide">Hide</option>
        </select>
      </label>
      <button onClick={() => setShowRatingGraphLines(!showRatingGraphLines)}>
        Toggle lines in settings
      </button>
      {["blitz", "hyperbullet", "bullet"].map((mode) => (
        <label key={mode}>
          Settings {mode}
          <input
            type="checkbox"
            checked={!hiddenRatingGraphModes.includes(mode)}
            onChange={(event) =>
              setHiddenRatingGraphModes(
                event.target.checked
                  ? hiddenRatingGraphModes.filter((value) => value !== mode)
                  : [...hiddenRatingGraphModes, mode],
              )
            }
          />
        </label>
      ))}
    </>
  );
};
const render = (ui: ReactElement) =>
  testingRender(ui, {
    wrapper: ({ children }) => (
      <AppSettingsProvider>
        <SettingsControl />
        {children}
      </AppSettingsProvider>
    ),
  });

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
  it("keeps the ceiling close to the peak, including flat and single-point histories", () => {
    expect(ratingGraphScale([1800, 1810])).toEqual({
      low: 1750,
      high: 1830,
      ticks: [1750, 1800],
    });
    expect(ratingGraphScale([1800]).high).toBe(1820);
    expect(ratingGraphScale([1800, 1800]).high).toBe(1820);
    const scale = ratingGraphScale([1200, 2800]);
    expect(scale.low).toBeLessThan(1200);
    expect(scale.high).toBeGreaterThan(2800);
    expect(scale.high).toBe(2880);
    expect(scale.ticks.every((tick) => tick <= scale.high)).toBe(true);
    expect(ratingGraphScale([]).high).toBe(100);
  });
  it("rescales to the visible dates and time controls", () => {
    const { container } = render(
      <RatingChart
        rows={[
          row("2025-01", "blitz", 2500),
          row("2026-01", "blitz", 1800),
          row("2026-02", "blitz", 1810),
          row("2026-02", "bullet", 2300),
        ]}
      />,
    );
    const topTick = () =>
      Math.max(
        ...Array.from(container.querySelectorAll("svg g > text"), (text) =>
          Number(text.textContent),
        ),
      );
    expect(topTick()).toBe(2400);
    fireEvent.click(screen.getByRole("button", { name: "1Y" }));
    expect(topTick()).toBe(2250);
    fireEvent.click(screen.getByRole("button", { name: "Bullet" }));
    expect(topTick()).toBe(1800);
  });
  it("syncs all three settings toggles with the legend, plotted series and saved preference", () => {
    const { container, unmount } = render(
      <RatingChart
        rows={[row("2026-01", "blitz"), row("2026-01", "hyperbullet"), row("2026-01", "bullet")]}
      />,
    );
    for (const [mode, label] of [
      ["blitz", "Blitz"],
      ["hyperbullet", "Hyper"],
      ["bullet", "Bullet"],
    ] as const) {
      fireEvent.click(screen.getByRole("checkbox", { name: `Settings ${mode}` }));
      expect(container.querySelector(`svg .ratingSeries.${mode}`)).toBeNull();
      expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.getByText("Select a time control to show its ratings.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Blitz" }));
    expect(screen.getByRole("checkbox", { name: "Settings blitz" })).toBeChecked();
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem("profile.ratingGraph.hiddenModes")!)).toEqual([
      "hyperbullet",
      "bullet",
    ]);
    unmount();
    render(<RatingChart rows={[row("2026-01")]} />);
    expect(screen.getByRole("checkbox", { name: "Settings hyperbullet" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Settings bullet" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Settings blitz" })).toBeChecked();
  });
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
      first = 2020 * 12;
    expect(
      ["1Y", "2Y", "5Y", "All"].map((period) =>
        ratingPeriodStart(period as Parameters<typeof ratingPeriodStart>[0], first, last),
      ),
    ).toEqual([last - 12, last - 24, last - 60, first]);
    expect(ratingPeriodStart("1Y", last - 2, last)).toBe(last - 2);
  });
  it("filters dates, toggles lines and exposes keyboard-readable monthly values", () => {
    render(
      <RatingChart
        rows={[
          row("2025-02"),
          row("2026-01"),
          row("2026-02", "bullet", 1900),
          row("2026-02", "hyperbullet", 2000),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "1Y" }));
    expect(screen.queryByLabelText("From month")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("img"), { key: "Home" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("1,800");
    fireEvent.click(screen.getByRole("button", { name: "Blitz" }));
    expect(screen.getByRole("button", { name: "Blitz" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From month"), { target: { value: "2026-01" } });
    expect(screen.getByRole("button", { name: "1Y" })).toHaveAttribute("aria-pressed", "false");
  });
  it("shows in-chart values for keyboard inspection and dismisses with Escape", () => {
    render(<RatingChart rows={[row("2026-01"), row("2026-02", "blitz", 1900)]} />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(document.querySelector(".ratingGraphReadout")).toBeNull();
    expect(screen.queryByText("1,900")).not.toBeInTheDocument();
    fireEvent.focus(screen.getByRole("img"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Feb 2026");
    expect(screen.getByRole("tooltip")).toHaveTextContent("1,900");
    fireEvent.keyDown(screen.getByRole("img"), { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});

describe("weekly rating graph", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("uses Monday–Sunday UTC weeks including the incomplete week", () => {
    const monday = weekIndex(new Date("2026-09-14T00:00:00Z"));
    expect(weekIndex(new Date("2026-09-20T23:59:59Z"))).toBe(monday);
    expect(weekIndex(new Date("2026-09-13T23:59:59Z"))).toBe(monday - 1);
    expect(weekIndex(new Date("2026-09-21T00:00:00Z"))).toBe(monday + 1);
    expect(weeklyPeriodStart("1Y", monday - 60, monday)).toBe(
      weekIndex(new Date("2025-09-15T00:00:00Z")),
    );
  });

  const week = (date: string, rating: number | null = 1800): MonthRank => ({
    ...row("2026-09", "blitz", rating),
    monthKey: date,
    monthDate: new Date(date + "T00:00:00Z"),
  });

  it("connects recorded weeks across missing weeks without inventing values", () => {
    const { container } = render(
      <RatingChart
        frequency="weekly"
        rows={[week("2026-08-23"), week("2026-08-30", 1850), week("2026-09-13", 1900)]}
      />,
    );
    const path = container.querySelector(".blitz .ratingLine")!.getAttribute("d")!;
    expect(path.match(/M/g)).toHaveLength(1);
    expect(path.match(/L/g)).toHaveLength(2);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    const graph = screen.getByRole("img");
    fireEvent.focus(graph);
    fireEvent.keyDown(graph, { key: "Home" });
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Aug 23, 2026");
    fireEvent.keyDown(graph, { key: "ArrowRight" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("1,850");
    fireEvent.keyDown(graph, { key: "ArrowRight" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    fireEvent.blur(graph);
    expect(container.querySelectorAll("circle")).toHaveLength(3);
  });

  it("persists Show and Hide overrides while keeping tooltip values accessible", () => {
    const rows = [week("2024-09-22"), week("2026-09-20", 1900)];
    const { container, unmount } = render(<RatingChart frequency="weekly" rows={rows} />);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Dots"), { target: { value: "show" } });
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Dots"), { target: { value: "hide" } });
    fireEvent.focus(screen.getByRole("img"));
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    expect(screen.getByRole("tooltip")).toHaveTextContent("1,900");
    unmount();
    const next = render(<RatingChart frequency="monthly" rows={[row("2026-09")]} />);
    expect(screen.getByLabelText("Dots")).toHaveValue("hide");
    expect(next.container.querySelectorAll("circle")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Dots"), { target: { value: "auto" } });
    expect(next.container.querySelectorAll("circle")).toHaveLength(1);
  });
});
