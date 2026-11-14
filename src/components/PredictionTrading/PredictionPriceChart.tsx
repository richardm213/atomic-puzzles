import "./PredictionPriceChart.css";

import { useQuery } from "@tanstack/react-query";
import { type PointerEvent, useState } from "react";

import {
  type PredictionHistoryPeriod,
  predictionHistoryPeriodSchema,
  type PredictionPriceHistory,
} from "../../../shared/domain/predictionHistory";
import { predictionPriceHistoryQueryOptions } from "../../lib/predictionMarkets/predictionMarketQueries";
import {
  type PredictionMarketDefinition,
  type PredictionOutcome,
  predictionOutcomeLabel,
} from "../../lib/predictionMarkets/predictionMarkets";
import { getErrorMessage } from "../../utils/errors";
import { InlineState } from "../InlineState/InlineState";

const periodLabels: Record<PredictionHistoryPeriod, string> = {
  "1h": "1 hr",
  "3h": "3 hr",
  "12h": "12 hr",
  "1d": "1 day",
  all: "All",
};

export const PredictionPriceChart = ({
  definition,
}: {
  definition: PredictionMarketDefinition;
}) => {
  const [period, setPeriod] = useState<PredictionHistoryPeriod>("all");
  const [outcome, setOutcome] = useState<PredictionOutcome>("yes");
  const history = useQuery(predictionPriceHistoryQueryOptions(definition.id, period));
  return (
    <section className="predictionPriceChart" aria-label="Market price history">
      <div className="predictionChartControls">
        <div className="predictionChartChoices" role="group" aria-label="Chart outcome">
          {(["yes", "no"] as const).map((entry) => (
            <button
              type="button"
              key={entry}
              aria-pressed={entry === outcome}
              onClick={() => setOutcome(entry)}
            >
              {predictionOutcomeLabel(definition, entry)}
            </button>
          ))}
        </div>
        <div className="predictionChartChoices" role="group" aria-label="Time range">
          {predictionHistoryPeriodSchema.options.map((entry) => (
            <button
              type="button"
              key={entry}
              aria-pressed={entry === period}
              onClick={() => setPeriod(entry)}
            >
              {periodLabels[entry]}
            </button>
          ))}
        </div>
      </div>
      {history.isPending ? (
        <p role="status">Loading price history…</p>
      ) : history.error ? (
        <InlineState kind="error">
          {getErrorMessage(history.error, "Unable to load price history.")}
          <button type="button" onClick={() => void history.refetch()}>
            Retry
          </button>
        </InlineState>
      ) : history.data.points.length ? (
        <PricePlot key={`${period}:${outcome}`} history={history.data} outcome={outcome} />
      ) : (
        <InlineState kind="empty">No trades in this period.</InlineState>
      )}
    </section>
  );
};

const dateTime = (time: number) =>
  new Date(time).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const PricePlot = ({
  history,
  outcome,
}: {
  history: PredictionPriceHistory;
  outcome: PredictionOutcome;
}) => {
  const points = history.points.map((point) => ({ ...point, settlement: false }));
  if (history.settlement)
    points.push({
      time: history.settlement.time,
      open: history.settlement.price,
      high: history.settlement.price,
      low: history.settlement.price,
      close: history.settlement.price,
      quantity: 0,
      settlement: true,
    });
  const [inspected, setInspected] = useState(points.length - 1);
  const selected = points[inspected] ?? points.at(-1)!;
  const price = (value: number) => (outcome === "yes" ? value : 100 - value);
  const span = Math.max(1, history.end - history.start);
  const x = (time: number) => ((time - history.start) / span) * 1000;
  const y = (value: number) => (100 - price(value)) * 2;
  const volume = Math.max(1, ...history.points.map((point) => point.quantity));
  const totalVolume = history.points.reduce((sum, point) => sum + point.quantity, 0);
  const firstTrade = history.points[0]!;
  const lastTrade = history.points.at(-1)!;
  const tradeLine = history.points.map((point) => `${x(point.time)},${y(point.close)}`).join(" ");
  const inspectPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const time =
      history.start + Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)) * span;
    let nearest = 0;
    points.forEach((point, index) => {
      if (Math.abs(point.time - time) < Math.abs(points[nearest]!.time - time)) nearest = index;
    });
    setInspected(nearest);
  };
  return (
    <>
      <div className="predictionChartReadout" aria-live="polite">
        <div className="predictionChartQuote">
          <strong>
            {price(selected.close)}
            <span>¢</span>
          </strong>
          <time dateTime={new Date(selected.time).toISOString()}>{dateTime(selected.time)}</time>
        </div>
        {!selected.settlement ? (
          <div className="predictionChartTrade">
            <strong>
              {selected.quantity.toLocaleString()} <span>contracts traded</span>
            </strong>
            <span>
              High {outcome === "yes" ? selected.high : 100 - selected.low}¢ · Low{" "}
              {outcome === "yes" ? selected.low : 100 - selected.high}¢
            </span>
          </div>
        ) : null}
      </div>
      <div
        className="predictionChartPlot"
        role="slider"
        tabIndex={0}
        aria-label="Inspect price history"
        aria-valuemin={0}
        aria-valuemax={points.length - 1}
        aria-valuenow={inspected}
        aria-valuetext={`${dateTime(selected.time)}, ${price(selected.close)} cents, ${selected.settlement ? "settlement" : `${selected.quantity} contracts traded`}`}
        onPointerMove={inspectPointer}
        onPointerDown={inspectPointer}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          setInspected((index) =>
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? points.length - 1
                : Math.max(
                    0,
                    Math.min(points.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)),
                  ),
          );
        }}
      >
        <div className="predictionChartScale" aria-hidden="true">
          {[100, 75, 50, 25, 0].map((value) => (
            <span key={value} style={{ top: `${100 - value}%` }}>
              {value}¢
            </span>
          ))}
        </div>
        <svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">
          <polygon
            className="predictionChartArea"
            points={`${x(firstTrade.time)},200 ${tradeLine} ${x(lastTrade.time)},200`}
          />
          {[0, 50, 100, 150, 200].map((value) => (
            <line
              className="predictionChartGrid"
              key={value}
              x1="0"
              x2="1000"
              y1={value}
              y2={value}
            />
          ))}
          <polyline className="predictionChartLine" points={tradeLine} />
          {history.settlement ? (
            <line
              className="predictionChartSettlement"
              x1={x(lastTrade.time)}
              y1={y(lastTrade.close)}
              x2="1000"
              y2={y(history.settlement.price)}
            />
          ) : null}
          <line
            className="predictionChartCursor"
            x1={x(selected.time)}
            x2={x(selected.time)}
            y1="0"
            y2="200"
          />
          <line
            className="predictionChartCursor"
            x1="0"
            x2="1000"
            y1={y(selected.close)}
            y2={y(selected.close)}
          />
        </svg>
        <span
          className="predictionChartDot"
          style={{ left: `${x(selected.time) / 10}%`, top: `${y(selected.close) / 2}%` }}
        />
        <span
          className="predictionChartPriceTag"
          style={{ top: `${y(selected.close) / 2}%` }}
          aria-hidden="true"
        >
          {price(selected.close)}¢
        </span>
      </div>
      <div className="predictionChartVolumeLabel">
        <span>Volume</span>
        <span>{totalVolume.toLocaleString()} contracts</span>
      </div>
      <div className="predictionChartVolume" aria-label="Traded quantity">
        <svg viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true">
          {history.points.map((point) => (
            <rect
              key={point.time}
              x={Math.max(0, x(point.time) - 3)}
              y={60 - (point.quantity / volume) * 56}
              width="6"
              height={(point.quantity / volume) * 56}
              data-selected={!selected.settlement && point.time === selected.time}
            />
          ))}
        </svg>
      </div>
      <div className="predictionChartDates">
        <time>{dateTime(history.start)}</time>
        <time>{dateTime(history.start + span / 2)}</time>
        <time>{dateTime(history.end)}</time>
      </div>
    </>
  );
};
