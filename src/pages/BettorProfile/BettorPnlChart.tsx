import { useEffect, useMemo, useRef, useState } from "react";

import type { BettorProfile } from "../../../shared/domain/bettorProfile";
import { useAppSettings } from "../../context/AppSettings";
import { formatSignedCoinValue } from "../../lib/coins/coinDisplay";
import { formatCalendarDate } from "../../utils/formatters";

const dayMs = 86_400_000;
const periods = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "All time", days: 0 },
] as const;
const dateKey = (time: number) => new Date(time).toISOString().slice(0, 10);
const axisNumber = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});
const axisWidth = 48;
const padding = 10;

export const BettorPnlChart = ({ history }: { history: BettorProfile["pnlByDay"] }) => {
  const { theme, colorMode } = useAppSettings();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [period, setPeriod] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const points = useMemo(() => {
    if (!history.length) return [];
    const entries = history.map(({ day, pnl }) => ({ day, pnl, time: Date.parse(day) }));
    const first = entries[0]!;
    const last = entries.at(-1)!;
    const end = Math.max(last.time, Date.parse(dateKey(Date.now())));
    const start = period ? end - period * dayMs : first.time - dayMs;
    const firstVisible = entries.findIndex((entry) => entry.time > start);
    const offset = firstVisible < 0 ? entries.length : firstVisible;
    return [
      {
        day: dateKey(start),
        time: start,
        pnl: entries[offset - 1]?.pnl ?? 0,
      },
      ...entries.slice(offset),
      ...(last.time < end ? [{ day: dateKey(end), time: end, pnl: last.pnl }] : []),
    ];
  }, [history, period]);
  const index = Math.min(selected ?? points.length - 1, points.length - 1);
  const current = points[index];

  useEffect(() => {
    const element = canvas.current;
    if (!element || !current) return;
    const draw = () => {
      const context = element.getContext("2d");
      if (!context) return;
      const { width, height } = element.getBoundingClientRect();
      if (width <= axisWidth + 2 * padding || height <= 2 * padding) return;
      const scale = window.devicePixelRatio || 1;
      element.width = Math.round(width * scale);
      element.height = Math.round(height * scale);
      context.scale(scale, scale);
      const style = getComputedStyle(element);
      const color = (name: string) => style.getPropertyValue(name).trim();
      const values = points.map((point) => point.pnl);
      const top = Math.max(0, ...values);
      const bottom = Math.min(0, ...values);
      const targetStep = Math.max((top - bottom) / 4, 0.25);
      const magnitude = 10 ** Math.floor(Math.log10(targetStep));
      const step = ([1, 2, 5, 10].find((size) => size * magnitude >= targetStep) ?? 10) * magnitude;
      const ceiling = Math.max(step, Math.ceil(top / step) * step);
      const floor = Math.min(0, Math.floor(bottom / step) * step);
      const first = points[0]!;
      const last = points.at(-1)!;
      const span = Math.max(dayMs, last.time - first.time);
      const right = width - axisWidth;
      const x = (time: number) => padding + ((time - first.time) / span) * (right - padding);
      const y = (pnl: number) =>
        padding + ((ceiling - pnl) / (ceiling - floor)) * (height - 2 * padding);

      context.font = `11px ${style.fontFamily}`;
      context.textBaseline = "middle";
      context.fillStyle = color("--color-muted");
      context.strokeStyle = color("--color-border");
      for (let value = floor; value <= ceiling + step / 100; value += step) {
        context.beginPath();
        context.moveTo(padding, y(value));
        context.lineTo(right, y(value));
        context.stroke();
        context.fillText(
          axisNumber.format(Math.abs(value) < 1e-6 ? 0 : value),
          right + 8,
          y(value),
        );
      }

      const ink = color(last.pnl < 0 ? "--color-pnl-loss" : "--color-primary");
      context.beginPath();
      context.moveTo(x(first.time), y(first.pnl));
      let previous = first;
      for (const point of points.slice(1)) {
        const pointX = x(point.time);
        const midpointX = (x(previous.time) + pointX) / 2;
        context.bezierCurveTo(
          midpointX,
          y(previous.pnl),
          midpointX,
          y(point.pnl),
          pointX,
          y(point.pnl),
        );
        previous = point;
      }
      context.strokeStyle = ink;
      context.lineWidth = 2;
      context.lineJoin = "round";
      context.stroke();
      context.lineTo(x(last.time), y(0));
      context.lineTo(x(first.time), y(0));
      context.fillStyle = ink;
      context.globalAlpha = 0.12;
      context.fill();
      context.globalAlpha = 1;

      context.beginPath();
      context.arc(x(current.time), y(current.pnl), 4, 0, 2 * Math.PI);
      context.fill();
    };
    draw();
    const resize = new ResizeObserver(draw);
    resize.observe(element);
    return () => resize.disconnect();
  }, [colorMode, current, points, theme]);

  if (!current) return <p className="bettorMuted">No trading history yet.</p>;

  return (
    <figure className="bettorChart">
      <figcaption>
        <div className="bettorChartPoint">
          <time dateTime={current.day}>{formatCalendarDate(current.day)}</time>
          <strong data-pnl={Math.sign(current.pnl)}>{formatSignedCoinValue(current.pnl)}</strong>
        </div>
        <div className="bettorChartPeriods" role="group" aria-label="Chart range">
          {periods.map(({ label, days }) => (
            <button
              key={days}
              type="button"
              aria-pressed={period === days}
              onClick={() => {
                setSelected(null);
                setPeriod(days);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </figcaption>
      <canvas
        ref={canvas}
        aria-hidden="true"
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          const { left, width } = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - left - padding) / (width - axisWidth - padding);
          const start = points[0]!.time;
          const time = start + ratio * (points.at(-1)!.time - start);
          const next = points.findIndex((point) => point.time > time);
          setSelected(next < 0 ? points.length - 1 : Math.max(0, next - 1));
        }}
      />
      <input
        type="range"
        min={0}
        max={points.length - 1}
        value={index}
        onChange={(event) => setSelected(event.currentTarget.valueAsNumber)}
        aria-label="Inspect cumulative P&L by date"
        aria-valuetext={`${formatCalendarDate(current.day)}, ${formatSignedCoinValue(current.pnl)} coins`}
      />
      <div className="bettorChartDates" aria-hidden="true">
        <span>{formatCalendarDate(points[0]?.day)}</span>
        <span>{formatCalendarDate(points.at(-1)?.day)}</span>
      </div>
    </figure>
  );
};
