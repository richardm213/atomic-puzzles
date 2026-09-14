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
    showRatingGraphLines,
    setShowRatingGraphLines,
    hiddenRatingGraphModes,
    setHiddenRatingGraphModes,
  } = useAppSettings();
  return (
    <>
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
    fireEvent.click(screen.getByRole("button", { name: "1M" }));
    expect(topTick()).toBe(2250);
    fireEvent.click(screen.getByRole("button", { name: "Bullet" }));
    expect(topTick()).toBe(1800);
  });
  it("refits 5Y, 2Y and 1Y headroom without reducing the graph height", () => {
    const { container } = render(
      <RatingChart
        rows={[
          row("2020-01", "blitz", 2900),
          row("2022-01", "blitz", 2500),
          row("2024-01", "blitz", 2200),
          row("2026-01", "blitz", 2100),
        ]}
      />,
    );
    const svg = screen.getByRole("img");
    const originalViewBox = svg.getAttribute("viewBox");
    for (const [period, ratings] of [
      ["5Y", [2500, 2200, 2100]],
      ["2Y", [2200, 2100]],
      ["1Y", [2100]],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: period }));
      const dots = Array.from(container.querySelectorAll("circle"));
      expect(dots).toHaveLength(ratings.length);
      const scale = ratingGraphScale([...ratings]);
      const expectedPeakY =
        240 - ((Math.max(...ratings) - scale.low) / (scale.high - scale.low)) * 220;
      expect(Math.min(...dots.map((dot) => Number(dot.getAttribute("cy"))))).toBeCloseTo(
        expectedPeakY,
      );
      expect(scale.high - Math.max(...ratings)).toBe(20);
      expect(svg).toHaveAttribute("viewBox", originalViewBox);
    }
  });
  it("preserves the existing saved dots-only preference", () => {
    window.localStorage.setItem("profile.ratingGraph.showLines", "false");
    const { container } = render(<RatingChart rows={[row("2026-01"), row("2026-02")]} />);
    expect(container.querySelector(".ratingLine")).toBeNull();
    expect(container.querySelectorAll("circle")).toHaveLength(2);
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
      ["1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y", "All"].map((period) =>
        ratingPeriodStart(period as Parameters<typeof ratingPeriodStart>[0], first, last),
      ),
    ).toEqual([last - 1, last - 3, last - 6, 2026 * 12, last - 12, last - 24, last - 60, first]);
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
    fireEvent.keyDown(screen.getByRole("img"), { key: "Home" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("1,800");
    fireEvent.click(screen.getByRole("button", { name: "Blitz" }));
    expect(screen.getByRole("button", { name: "Blitz" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.change(screen.getByLabelText("From month"), { target: { value: "2025-01" } });
    expect(screen.getByRole("button", { name: "1M" })).toHaveAttribute("aria-pressed", "false");
  });
  it("uses two range handles to narrow dates, persist Custom and synchronize presets", () => {
    const { unmount } = render(
      <RatingChart rows={[row("2025-01"), row("2025-06"), row("2026-01"), row("2026-06")]} />,
    );
    const start = screen.getByRole("slider", { name: "Range start" });
    const end = screen.getByRole("slider", { name: "Range end" });
    fireEvent.keyDown(start, { key: "PageUp" });
    expect(screen.getByLabelText("From month")).toHaveValue("2026-01");
    fireEvent.keyDown(end, { key: "ArrowLeft" });
    expect(screen.getByLabelText("To month")).toHaveValue("2026-05");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("profile.ratingGraph.period")).toBe('"Custom"');
    fireEvent.keyDown(start, { key: "End" });
    expect(start).toHaveAttribute("aria-valuenow", end.getAttribute("aria-valuenow"));
    fireEvent.keyDown(start, { key: "ArrowRight" });
    expect(start).toHaveAttribute("aria-valuenow", end.getAttribute("aria-valuenow"));
    fireEvent.keyDown(end, { key: "ArrowLeft" });
    expect(end).toHaveAttribute("aria-valuenow", start.getAttribute("aria-valuenow"));
    fireEvent.click(screen.getByRole("button", { name: "1Y" }));
    expect(start).toHaveAttribute("aria-valuetext", "Jun 2025");
    expect(end).toHaveAttribute("aria-valuetext", "Jun 2026");
    fireEvent.change(screen.getByLabelText("From month"), { target: { value: "2026-01" } });
    expect(start).toHaveAttribute("aria-valuetext", "Jan 2026");
    unmount();
    render(<RatingChart rows={[row("2025-01"), row("2026-01"), row("2026-06")]} />);
    expect(screen.getByRole("slider", { name: "Range start" })).toHaveAttribute(
      "aria-valuetext",
      "Jan 2026",
    );
  });
  it("refits the vertical scale as either date handle excludes or restores peaks", () => {
    const { container } = render(
      <RatingChart
        rows={[
          row("2021-01", "blitz", 2800),
          row("2022-01", "blitz", 2200),
          row("2023-01", "blitz", 2220),
          row("2024-01", "blitz", 2700),
        ]}
      />,
    );
    const originalViewBox = screen.getByRole("img").getAttribute("viewBox");
    const expectScale = (ratings: number[]) => {
      const { low, high, ticks } = ratingGraphScale(ratings);
      const labels = Array.from(container.querySelectorAll("svg g > text"), (label) =>
        Number(label.textContent),
      );
      expect(labels).toEqual(ticks);
      const dots = Array.from(container.querySelectorAll("circle"));
      expect(dots).toHaveLength(ratings.length);
      dots.forEach((dot, index) => {
        expect(Number(dot.getAttribute("cy"))).toBeCloseTo(
          240 - ((ratings[index]! - low) / (high - low)) * 220,
        );
      });
      expect(screen.getByRole("img")).toHaveAttribute("viewBox", originalViewBox);
    };
    expectScale([2800, 2200, 2220, 2700]);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Range start" }), { key: "PageUp" });
    expectScale([2200, 2220, 2700]);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Range end" }), { key: "PageDown" });
    expectScale([2200, 2220]);
    expect(ratingGraphScale([2200, 2220]).high).toBe(2240);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Range end" }), { key: "End" });
    expectScale([2200, 2220, 2700]);
    fireEvent.keyDown(screen.getByRole("slider", { name: "Range start" }), { key: "Home" });
    expectScale([2800, 2200, 2220, 2700]);
  });
  it("drags either range handle inward and stops updating after release", () => {
    const { container } = render(<RatingChart rows={[row("2025-01"), row("2026-01")]} />);
    const range = screen.getByRole("group", { name: "Rating history date range" });
    vi.spyOn(
      container.querySelector(".ratingRangeTrack")!,
      "getBoundingClientRect",
    ).mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 120,
      bottom: 4,
      width: 120,
      height: 4,
      toJSON: () => ({}),
    });
    Object.assign(range, { setPointerCapture: vi.fn(), hasPointerCapture: () => false });
    const pointer = (type: string, x: number) =>
      fireEvent(range, new MouseEvent(type, { bubbles: true, clientX: x, button: 0 }));
    pointer("pointerdown", 0);
    pointer("pointermove", 30);
    pointer("pointerup", 30);
    expect(screen.getByLabelText("From month")).toHaveValue("2025-04");
    pointer("pointerdown", 120);
    pointer("pointermove", 90);
    pointer("pointerup", 90);
    expect(screen.getByLabelText("To month")).toHaveValue("2025-10");
    pointer("pointermove", 60);
    expect(screen.getByLabelText("To month")).toHaveValue("2025-10");
  });
  it("only enlarges dots while inspecting inside the plot or with the keyboard", () => {
    const { container } = render(<RatingChart rows={[row("2026-01"), row("2026-02")]} />);
    const svg = screen.getByRole("img");
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 280,
      width: 800,
      height: 280,
      toJSON: () => ({}),
    });
    const move = (x: number, y: number) =>
      fireEvent(
        svg,
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: x,
          clientY: y,
        }),
      );
    const expectNormal = () => {
      expect(container.querySelector(".isSelected")).toBeNull();
      expect(container.querySelector(".ratingCursor")).toBeNull();
      container.querySelectorAll("circle").forEach((dot) => expect(dot).toHaveAttribute("r", "4"));
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    };
    expectNormal();
    for (const [x, y] of [
      [400, 10],
      [400, 260],
      [20, 100],
      [795, 100],
    ] as const) {
      move(400, 100);
      expect(container.querySelector(".isSelected")).toHaveAttribute("r", "6");
      move(x, y);
      expectNormal();
    }
    move(400, 100);
    fireEvent.pointerLeave(container.querySelector(".ratingGraphPlot")!);
    expectNormal();
    fireEvent.focus(screen.getByRole("img"));
    expect(container.querySelector(".isSelected")).toHaveAttribute("r", "6");
    fireEvent.blur(screen.getByRole("img"));
    expectNormal();
  });
  it("orders tooltip ratings as Blitz, Bullet, Hyper", () => {
    render(
      <RatingChart
        rows={[
          row("2026-01"),
          row("2026-02", "hyperbullet", 2100),
          row("2026-02", "blitz", 2300),
          row("2026-02", "bullet", 2200),
        ]}
      />,
    );
    fireEvent.focus(screen.getByRole("img"));
    expect(
      Array.from(
        screen.getByRole("tooltip").querySelectorAll(".ratingTooltipRow > span"),
        (label) => label.textContent,
      ),
    ).toEqual(["Blitz", "Bullet", "Hyper"]);
  });
  it("only shows recorded, enabled ratings for the inspected month without missing-value rows", () => {
    render(
      <RatingChart
        rows={[
          row("2026-01", "blitz", 2376),
          row("2026-01", "bullet", 2240.2),
          row("2026-01", "hyperbullet", null),
          row("2026-03", "hyperbullet", 2100),
        ]}
      />,
    );
    const graph = screen.getByRole("img");
    fireEvent.keyDown(graph, { key: "Home" });
    let tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Blitz");
    expect(tooltip).toHaveTextContent("2,376");
    expect(tooltip).toHaveTextContent("Bullet");
    expect(tooltip).toHaveTextContent("2,240.2");
    expect(tooltip).not.toHaveTextContent("Hyper");
    expect(tooltip).not.toHaveTextContent("—");
    fireEvent.click(screen.getByRole("button", { name: "Bullet" }));
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("Bullet");
    fireEvent.keyDown(graph, { key: "ArrowRight" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.keyDown(graph, { key: "End" });
    tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Hyper");
    expect(tooltip).not.toHaveTextContent("Blitz");
    expect(tooltip).not.toHaveTextContent("Bullet");
    expect(tooltip).not.toHaveTextContent("—");
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
  it("connects recorded months, supports dots only, and handles single-point and empty histories", () => {
    const { container, rerender } = render(<RatingChart rows={[row("2026-01"), row("2026-03")]} />);
    expect(container.querySelector(".ratingLine")?.getAttribute("d")).toContain("L");
    expect(screen.queryByRole("checkbox", { name: "Show lines" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Toggle lines in settings" }));
    expect(container.querySelector(".ratingLine")).toBeNull();
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(window.localStorage.getItem("profile.ratingGraph.showLines")).toBe("false");
    rerender(<RatingChart rows={[row("2026-01")]} />);
    screen.getAllByRole("slider").forEach((handle) => expect(handle).toBeDisabled());
    rerender(<RatingChart rows={[]} />);
    expect(screen.getByText("No monthly leaderboard ratings available.")).toBeInTheDocument();
  });
});

describe("weekly rating graph", () => {
  it("uses Monday–Sunday UTC weeks including the incomplete week", () => {
    const monday = weekIndex(new Date("2026-09-14T00:00:00Z"));
    expect(weekIndex(new Date("2026-09-20T23:59:59Z"))).toBe(monday);
    expect(weekIndex(new Date("2026-09-13T23:59:59Z"))).toBe(monday - 1);
    expect(weekIndex(new Date("2026-09-21T00:00:00Z"))).toBe(monday + 1);
    expect(weeklyPeriodStart("1M", monday - 30, monday)).toBe(
      weekIndex(new Date("2026-08-20T00:00:00Z")),
    );
  });

  const week = (date: string, rating: number | null = 1800): MonthRank => ({
    ...row("2026-09", "blitz", rating),
    monthKey: date,
    monthDate: new Date(date + "T00:00:00Z"),
  });

  it("breaks the line across missing weeks and shows dots only during inspection", () => {
    const { container } = render(
      <RatingChart
        frequency="weekly"
        rows={[week("2026-08-23"), week("2026-08-30", 1850), week("2026-09-13", 1900)]}
      />,
    );
    const path = container.querySelector(".blitz .ratingLine")!.getAttribute("d")!;
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path.match(/L/g)).toHaveLength(1);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    const graph = screen.getByRole("img");
    fireEvent.focus(graph);
    fireEvent.keyDown(graph, { key: "Home" });
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Aug 23, 2026");
    fireEvent.keyDown(graph, { key: "ArrowRight" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("1,850");
    fireEvent.keyDown(graph, { key: "ArrowRight" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    fireEvent.blur(graph);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
  });

  it("retains a single qualifying observation and date-based range inputs", () => {
    const { container } = render(<RatingChart frequency="weekly" rows={[week("2026-09-13")]} />);
    expect(screen.getByLabelText("From week")).toHaveAttribute("type", "date");
    fireEvent.focus(screen.getByRole("img"));
    fireEvent.keyDown(screen.getByRole("img"), { key: "Home" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("1,800");
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("img"), { key: "Escape" });
    expect(container.querySelectorAll("circle")).toHaveLength(0);
  });
});
