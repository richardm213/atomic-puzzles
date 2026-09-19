import "./RatingHistoryGraph.css";

import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { isMode, modeLabels } from "../../constants/matches";
import { useAppSettings } from "../../context/AppSettings";
import { usePersistedState } from "../../hooks/usePersistedState";
import {
  type MonthRank,
  useMonthRanksQuery,
  useWeeklyRatingsQuery,
} from "../../hooks/usePlayerProfileData";
import { RatingRangeSlider } from "./RatingRangeSlider";

type GraphRow = Pick<MonthRank, "monthDate" | "monthKey" | "mode" | "rating">;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const SUNDAY = Date.UTC(1970, 0, 4);
export const weekIndex = (date: Date) =>
  Math.ceil(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - SUNDAY) / WEEK,
  );
const weekDate = (index: number) => new Date(SUNDAY + index * WEEK);
const weekValue = (index: number) => weekDate(index).toISOString().slice(0, 10);
const weekLabel = (index: number) =>
  weekDate(index).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export const weeklyPeriodStart = (period: RatingPeriod, first: number, last: number) => {
  if (period === "All") return first;
  const end = weekDate(last);
  const start =
    period === "YTD"
      ? new Date(Date.UTC(end.getUTCFullYear(), 0, 1))
      : new Date(
          Date.UTC(
            end.getUTCFullYear(),
            end.getUTCMonth() - { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "2Y": 24, "5Y": 60 }[period],
            end.getUTCDate(),
          ),
        );
  return Math.max(first, weekIndex(start));
};
const modes = ["blitz", "bullet", "hyperbullet"] as const;
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

// Lines connect recorded observations; missing periods do not get invented ratings.
export const ratingPeriodStart = (period: RatingPeriod, first: number, last: number) =>
  Math.max(
    first,
    period === "All"
      ? first
      : period === "YTD"
        ? Math.floor(last / 12) * 12
        : last - { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "2Y": 24, "5Y": 60 }[period],
  );

export const ratingGraphRows = (rows: GraphRow[]) =>
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
  const { ratingGraphFrequency: frequency } = useAppSettings();
  const monthly = useMonthRanksQuery(username, frequency === "monthly");
  const weekly = useWeeklyRatingsQuery(username, frequency === "weekly");
  const query = frequency === "weekly" ? weekly : monthly;
  const rows: GraphRow[] =
    frequency === "weekly"
      ? (weekly.data ?? []).flatMap((row) =>
          row.games > 0 && isMode(row.tc)
            ? [
                {
                  monthDate: new Date(row.week + "T00:00:00Z"),
                  monthKey: row.week,
                  mode: row.tc,
                  rating: row.rating,
                },
              ]
            : [],
        )
      : (monthly.data ?? []);
  return (
    <section
      id="profile-rating-graph"
      className="ratingHistory"
      aria-label={frequency === "weekly" ? "Weekly rating graph" : "Monthly rating graph"}
    >
      {query.isPending ? (
        <p role="status">Loading {frequency} ratings…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>Could not load rating history.</p>
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <RatingChart key={frequency} rows={rows} frequency={frequency} />
      )}
    </section>
  );
};

export const RatingChart = ({
  rows,
  frequency = "monthly",
}: {
  rows: GraphRow[];
  frequency?: "weekly" | "monthly";
}) => {
  const weekly = frequency === "weekly";
  const dateIndex = weekly ? weekIndex : monthIndex;
  const dateLabel = weekly ? weekLabel : monthLabel;
  const dateValue = weekly ? weekValue : monthValue;
  const data = useMemo(() => ratingGraphRows(rows), [rows]);
  const first = data.length ? dateIndex(data[0]!.monthDate) : 0;
  const last = data.length
    ? Math.max(dateIndex(data[data.length - 1]!.monthDate), weekly ? weekIndex(new Date()) : 0)
    : 0;
  const [period, setPeriod] = usePersistedState<RatingPeriod | "Custom">(
    "profile.ratingGraph.period",
    z.enum([...periods, "Custom"]),
    "All",
  );
  const [custom, setCustom] = usePersistedState<[number, number]>(
    weekly ? "profile.ratingGraph.weeklyRange" : "profile.ratingGraph.range",
    z.tuple([z.number().int(), z.number().int()]),
    [first, last],
  );
  const {
    ratingGraphDots,
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
  if (!data.length)
    return (
      <p>{weekly ? "No weekly ratings available." : "No monthly leaderboard ratings available."}</p>
    );
  const from =
    period === "Custom"
      ? Math.max(first, Math.min(custom[0], last))
      : (weekly ? weeklyPeriodStart : ratingPeriodStart)(period, first, last);
  const to = period === "Custom" ? Math.max(from, Math.min(custom[1], last)) : last;
  const selected = Math.max(from, Math.min(inspected ?? to, to));
  const visible = data.filter(
    (row) =>
      dateIndex(row.monthDate) >= from &&
      dateIndex(row.monthDate) <= to &&
      !hidden.includes(row.mode),
  );
  const inspectedRatings = modes.flatMap((mode) => {
    const row = visible.find(
      (entry) => entry.mode === mode && dateIndex(entry.monthDate) === selected,
    );
    return row ? [row] : [];
  });
  const ratings = visible.map((row) => row.rating as number);
  const { low, high, ticks: ratingTicks } = ratingGraphScale(ratings);
  const left = 48,
    right = width - 16,
    top = 20,
    bottom = width < 500 ? 220 : 240;
  // Keep 8px markers separated by at least 16px; zoom and viewport width
  // both affect density, so a short mobile range can differ from desktop.
  const showDots =
    ratingGraphDots === "show" ||
    (ratingGraphDots === "auto" && (!weekly || (right - left) / Math.max(1, to - from) >= 24));
  const x = (month: number) =>
    from === to ? (left + right) / 2 : left + ((month - from) / (to - from)) * (right - left);
  const y = (rating: number) => bottom - ((rating - low) / (high - low)) * (bottom - top);
  const tickCount = width < 500 ? 3 : width < 760 ? 4 : 6;
  const ticks = [
    ...new Set(
      Array.from({ length: tickCount }, (_, i) =>
        Math.round(from + ((to - from) * i) / Math.max(1, tickCount - 1)),
      ),
    ),
  ];
  const changeRangeMonth = (month: number, edge: 0 | 1) => {
    const bounded = Math.max(first, Math.min(last, month));
    setCustom(edge === 0 ? [Math.min(bounded, to), to] : [from, Math.max(bounded, from)]);
    setPeriod("Custom");
    setTooltipVisible(false);
  };
  const changeRange = (value: string, edge: 0 | 1) => {
    if (!(weekly ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/).test(value)) return;
    const date = new Date(`${value}${weekly ? "" : "-01"}T00:00:00Z`);
    if (Number.isFinite(date.getTime())) changeRangeMonth(dateIndex(date), edge);
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
              type={weekly ? "date" : "month"}
              aria-label={weekly ? "From week" : "From month"}
              min={dateValue(first)}
              max={dateValue(to)}
              value={dateValue(from)}
              onChange={(event) => changeRange(event.target.value, 0)}
            />
          </label>
          <label>
            To
            <input
              type={weekly ? "date" : "month"}
              aria-label={weekly ? "To week" : "To month"}
              min={dateValue(from)}
              max={dateValue(last)}
              value={dateValue(to)}
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
          tabIndex={0}
          onFocus={() => setTooltipVisible(true)}
          onBlur={() => setTooltipVisible(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setTooltipVisible(false);
              return;
            }
            const next = { ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: from, End: to }[
              event.key
            ];
            if (next !== undefined) {
              event.preventDefault();
              setInspected(Math.max(from, Math.min(to, next)));
              setTooltipVisible(true);
            }
          }}
          aria-label={`${weekly ? "Weekly ratings" : "Monthly leaderboard ratings"}, ${dateLabel(from)} to ${dateLabel(to)}. Focus the graph and use Left and Right arrow keys to read exact values.`}
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
              {dateLabel(month)}
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
                            `${i ? "L" : "M"}${x(dateIndex(row.monthDate))},${y(row.rating as number)}`,
                        )
                        .join(" ")}
                    />
                  ) : null}
                  {points
                    .filter(
                      (row) =>
                        ratingGraphDots !== "hide" &&
                        (showDots || (tooltipVisible && dateIndex(row.monthDate) === selected)),
                    )
                    .map((row) => (
                      <circle
                        key={row.monthKey}
                        className={
                          tooltipVisible && dateIndex(row.monthDate) === selected
                            ? "isSelected"
                            : undefined
                        }
                        cx={x(dateIndex(row.monthDate))}
                        cy={y(row.rating as number)}
                        r={tooltipVisible && dateIndex(row.monthDate) === selected ? 6 : 4}
                      >
                        <title>
                          {dateLabel(dateIndex(row.monthDate))}: {modeLabels[mode]} {row.rating}
                        </title>
                      </circle>
                    ))}
                </g>
              );
            })}
        </svg>
        {tooltipVisible && inspectedRatings.length > 0 ? (
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
            <strong>{dateLabel(selected)}</strong>
            {inspectedRatings.map((row) => (
              <div key={row.mode} className={`ratingTooltipRow ratingSeries ${row.mode}`}>
                <span>
                  <i aria-hidden="true" />
                  {modeLabels[row.mode]}
                </span>
                <b>{row.rating?.toLocaleString("en-US", { maximumFractionDigits: 1 })}</b>
              </div>
            ))}
          </div>
        ) : null}
        {!visible.length ? (
          <p className="ratingGraphEmpty">
            {hidden.length === modes.length
              ? "Select a time control to show its ratings."
              : `No ${frequency} ratings in this range.`}
          </p>
        ) : null}
      </div>
      <RatingRangeSlider
        min={first}
        max={last}
        from={from}
        to={to}
        formatMonth={dateLabel}
        onChange={changeRangeMonth}
      />
    </>
  );
};
