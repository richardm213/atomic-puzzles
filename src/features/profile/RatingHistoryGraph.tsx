import "./RatingHistoryGraph.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { modeLabels } from "../../constants/matches";
import { useAppSettings } from "../../context/AppSettings";
import { usePersistedState } from "../../hooks/usePersistedState";
import { type MonthRank, useMonthRanksQuery } from "../../hooks/usePlayerProfileData";

const modes = ["blitz", "hyperbullet", "bullet"] as const;
const periods = ["1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y", "All"] as const;
export type RatingPeriod = (typeof periods)[number];
const monthIndex = (date: Date) => date.getUTCFullYear() * 12 + date.getUTCMonth();
const monthDate = (index: number) => new Date(Date.UTC(Math.floor(index / 12), index % 12, 1));
const monthValue = (index: number) => monthDate(index).toISOString().slice(0, 7);
const monthLabel = (index: number) =>
  monthDate(index).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

// Only recorded monthly snapshots are plotted; lines connect observations, not invented ratings.
export const ratingPeriodStart = (period: RatingPeriod, first: number, last: number) =>
  Math.max(
    first,
    period === "All"
      ? first
      : period === "YTD"
        ? Math.floor(last / 12) * 12
        : last - { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "2Y": 24, "5Y": 60 }[period],
  );

export const ratingGraphRows = (rows: MonthRank[]) =>
  rows
    .filter(
      (row) =>
        modes.some((mode) => mode === row.mode) &&
        row.rating !== null &&
        Number.isFinite(row.rating) &&
        Number.isFinite(row.monthDate.getTime()),
    )
    .sort((a, b) => a.monthDate.getTime() - b.monthDate.getTime());

// Fit the visible observations, rather than padding out a fixed number of intervals.
export const ratingGraphScale = (ratings: number[]) => {
  if (!ratings.length) return { low: 0, high: 100, ticks: [0, 20, 40, 60, 80, 100] };
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const padding = Math.max(20, (max - min) * 0.05);
  const step = Math.max(50, Math.ceil((max - min + padding * 2) / 5 / 50) * 50);
  const low = Math.floor((min - padding) / step) * step;
  // Grid intervals must not inflate the ceiling; each selected range gets only
  // its own small margin above the highest visible observation.
  const high = max + padding;
  const ticks = Array.from(
    { length: Math.floor((high - low) / step) + 1 },
    (_, i) => low + i * step,
  );
  return { low, high, ticks };
};

export const RatingHistoryGraph = ({ username }: { username: string }) => {
  const query = useMonthRanksQuery(username);
  return (
    <section id="profile-rating-graph" className="ratingHistory" aria-label="Monthly rating graph">
      {query.isPending ? (
        <p role="status">Loading monthly ratings…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>Could not load rating history.</p>
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <RatingChart rows={query.data ?? []} />
      )}
    </section>
  );
};

export const RatingChart = ({ rows }: { rows: MonthRank[] }) => {
  const data = useMemo(() => ratingGraphRows(rows), [rows]);
  const first = data.length ? monthIndex(data[0]!.monthDate) : 0;
  const last = data.length ? monthIndex(data[data.length - 1]!.monthDate) : 0;
  const [period, setPeriod] = usePersistedState<RatingPeriod | "Custom">(
    "profile.ratingGraph.period",
    z.enum([...periods, "Custom"]),
    "All",
  );
  const [custom, setCustom] = usePersistedState<[number, number]>(
    "profile.ratingGraph.range",
    z.tuple([z.number().int(), z.number().int()]),
    [first, last],
  );
  const {
    showRatingGraphLines: showLines,
    hiddenRatingGraphModes: hidden,
    setHiddenRatingGraphModes: setHidden,
  } = useAppSettings();
  const [inspected, setInspected] = useState<number | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  useEffect(() => {
    if (!tooltipVisible) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTooltipVisible(false);
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [tooltipVisible]);
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry?.contentRect.width ?? 800)),
    );
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [data.length]);
  if (!data.length) return <p>No monthly leaderboard ratings available.</p>;
  const from =
    period === "Custom"
      ? Math.max(first, Math.min(custom[0], last))
      : ratingPeriodStart(period, first, last);
  const to = period === "Custom" ? Math.max(from, Math.min(custom[1], last)) : last;
  const selected = Math.max(from, Math.min(inspected ?? to, to));
  const visible = data.filter(
    (row) =>
      monthIndex(row.monthDate) >= from &&
      monthIndex(row.monthDate) <= to &&
      !hidden.includes(row.mode),
  );
  const ratings = visible.map((row) => row.rating as number);
  const { low, high, ticks: ratingTicks } = ratingGraphScale(ratings);
  const left = 48,
    right = width - 16,
    top = 20,
    bottom = width < 500 ? 220 : 240;
  const x = (month: number) =>
    from === to ? (left + right) / 2 : left + ((month - from) / (to - from)) * (right - left);
  const y = (rating: number) => bottom - ((rating - low) / (high - low)) * (bottom - top);
  const ticks = [
    ...new Set(
      Array.from({ length: width < 500 ? 3 : 6 }, (_, i) =>
        Math.round(from + ((to - from) * i) / (width < 500 ? 2 : 5)),
      ),
    ),
  ];
  const changeRange = (value: string, edge: 0 | 1) => {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    const month = monthIndex(new Date(`${value}-01T00:00:00Z`));
    const bounded = Math.max(first, Math.min(last, month));
    setCustom(edge === 0 ? [Math.min(bounded, to), to] : [from, Math.max(bounded, from)]);
    setPeriod("Custom");
  };
  return (
    <>
      <div className="ratingGraphToolbar">
        <div className="ratingGraphPeriods" aria-label="Rating history time frame">
          {periods.map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="ratingGraphDates">
          <label>
            From
            <input
              type="month"
              aria-label="From month"
              min={monthValue(first)}
              max={monthValue(to)}
              value={monthValue(from)}
              onChange={(event) => changeRange(event.target.value, 0)}
            />
          </label>
          <label>
            To
            <input
              type="month"
              aria-label="To month"
              min={monthValue(from)}
              max={monthValue(last)}
              value={monthValue(to)}
              onChange={(event) => changeRange(event.target.value, 1)}
            />
          </label>
        </div>
      </div>
      <div className="ratingGraphOptions">
        <div className="ratingGraphLegend" aria-label="Rating series">
          {modes.map((mode) => (
            <button
              type="button"
              key={mode}
              className={`ratingSeries ${mode}`}
              aria-pressed={!hidden.includes(mode)}
              onClick={() =>
                setHidden((current) =>
                  current.includes(mode)
                    ? current.filter((value) => value !== mode)
                    : [...current, mode],
                )
              }
            >
              <span aria-hidden="true" />
              {modeLabels[mode]}
            </button>
          ))}
        </div>
      </div>
      <div ref={frame} className="ratingGraphPlot" onPointerLeave={() => setTooltipVisible(false)}>
        <svg
          viewBox={`0 0 ${width} ${bottom + 40}`}
          role="img"
          aria-label={`Monthly leaderboard ratings, ${monthLabel(from)} to ${monthLabel(to)}. Use the month slider below to read exact values.`}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const pointerX = ((event.clientX - bounds.left) * width) / bounds.width;
            const pointerY = ((event.clientY - bounds.top) * (bottom + 40)) / bounds.height;
            if (pointerX < left || pointerX > right || pointerY < top || pointerY > bottom) {
              setTooltipVisible(false);
              return;
            }
            setTooltipVisible(true);
            setInspected(Math.round(from + ((pointerX - left) / (right - left)) * (to - from)));
          }}
        >
          <rect
            className="ratingPlotSurface"
            x={left}
            y={top}
            width={right - left}
            height={bottom - top}
            rx={8}
          />
          {ratingTicks.map((rating) => (
            <g key={rating}>
              <line className="ratingGrid" x1={left} x2={right} y1={y(rating)} y2={y(rating)} />
              <text x={left - 8} y={y(rating) + 4} textAnchor="end">
                {Math.round(rating)}
              </text>
            </g>
          ))}
          {ticks.map((month) => (
            <text
              key={month}
              x={x(month)}
              y={bottom + 28}
              textAnchor={month === from ? "start" : month === to ? "end" : "middle"}
            >
              {monthLabel(month)}
            </text>
          ))}
          {tooltipVisible ? (
            <line className="ratingCursor" x1={x(selected)} x2={x(selected)} y1={top} y2={bottom} />
          ) : null}
          {modes
            .filter((mode) => !hidden.includes(mode))
            .map((mode) => {
              const points = visible.filter((row) => row.mode === mode);
              return (
                <g key={mode} className={`ratingSeries ${mode}`}>
                  {showLines ? (
                    <path
                      className="ratingLine"
                      d={points
                        .map(
                          (row, i) =>
                            `${i ? "L" : "M"}${x(monthIndex(row.monthDate))},${y(row.rating as number)}`,
                        )
                        .join(" ")}
                    />
                  ) : null}
                  {points.map((row) => (
                    <circle
                      key={row.monthKey}
                      className={
                        tooltipVisible && monthIndex(row.monthDate) === selected
                          ? "isSelected"
                          : undefined
                      }
                      cx={x(monthIndex(row.monthDate))}
                      cy={y(row.rating as number)}
                      r={tooltipVisible && monthIndex(row.monthDate) === selected ? 6 : 4}
                    >
                      <title>
                        {monthLabel(monthIndex(row.monthDate))}: {modeLabels[mode]} {row.rating}
                      </title>
                    </circle>
                  ))}
                </g>
              );
            })}
        </svg>
        {tooltipVisible && visible.length > 0 ? (
          <div
            className="ratingGraphTooltip"
            role="tooltip"
            aria-live="polite"
            style={{
              left: Math.max(
                8,
                Math.min(width - 184, x(selected) + (x(selected) > width / 2 ? -184 : 16)),
              ),
            }}
          >
            <strong>{monthLabel(selected)}</strong>
            {modes
              .filter((mode) => !hidden.includes(mode))
              .map((mode) => (
                <div key={mode} className={`ratingTooltipRow ratingSeries ${mode}`}>
                  <span>
                    <i aria-hidden="true" />
                    {modeLabels[mode]}
                  </span>
                  <b>
                    {data
                      .find((row) => row.mode === mode && monthIndex(row.monthDate) === selected)
                      ?.rating?.toLocaleString("en-US", { maximumFractionDigits: 1 }) ?? "—"}
                  </b>
                </div>
              ))}
          </div>
        ) : null}
        {!visible.length ? (
          <p className="ratingGraphEmpty">
            {hidden.length === modes.length
              ? "Select a time control to show its ratings."
              : "No monthly ratings in this range."}
          </p>
        ) : null}
      </div>
      <label className="ratingMonthScrubber">
        <input
          aria-label="Inspect month"
          type="range"
          min={from}
          max={to}
          value={selected}
          disabled={from === to}
          aria-valuetext={monthLabel(selected)}
          onFocus={() => setTooltipVisible(true)}
          onBlur={() => setTooltipVisible(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setTooltipVisible(false);
          }}
          onChange={(event) => {
            setInspected(Number(event.target.value));
            setTooltipVisible(true);
          }}
        />
      </label>
    </>
  );
};
