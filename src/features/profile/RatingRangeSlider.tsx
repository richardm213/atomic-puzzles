import { useRef } from "react";

type Props = {
  min: number;
  max: number;
  from: number;
  to: number;
  formatMonth: (month: number) => string;
  onChange: (month: number, edge: 0 | 1) => void;
};

// Keep the track anchored to the full history while the chart zooms into the selection.
export const RatingRangeSlider = ({ min, max, from, to, formatMonth, onChange }: Props) => {
  const track = useRef<HTMLDivElement>(null);
  const handles = useRef<(HTMLButtonElement | null)[]>([]);
  const dragging = useRef<0 | 1 | null>(null);
  const position = (month: number) => (max === min ? 50 : ((month - min) / (max - min)) * 100);
  const pointerMonth = (clientX: number) => {
    const bounds = track.current!.getBoundingClientRect();
    return min + Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)) * (max - min);
  };
  const update = (month: number, edge: 0 | 1) =>
    onChange(
      Math.max(edge === 0 ? min : from, Math.min(edge === 0 ? to : max, Math.round(month))),
      edge,
    );
  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  return (
    <div
      className="ratingRange"
      role="group"
      aria-label="Rating history date range"
      onPointerDown={(event) => {
        if (min === max || event.button !== 0) return;
        event.preventDefault();
        const month = pointerMonth(event.clientX);
        // Pick by proximity, not stacking order, so nearby and overlapping handles remain usable.
        const edge =
          Math.abs(month - from) < Math.abs(month - to)
            ? 0
            : Math.abs(month - from) > Math.abs(month - to)
              ? 1
              : month <= from
                ? 0
                : 1;
        dragging.current = edge;
        handles.current[edge]?.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        update(month, edge);
      }}
      onPointerMove={(event) => {
        if (dragging.current !== null) update(pointerMonth(event.clientX), dragging.current);
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onLostPointerCapture={() => {
        dragging.current = null;
      }}
    >
      <div ref={track} className="ratingRangeTrack">
        <div
          className="ratingRangeSelection"
          aria-hidden="true"
          style={{ left: `${position(from)}%`, width: `${position(to) - position(from)}%` }}
        />
        {([0, 1] as const).map((edge) => (
          <button
            key={edge}
            ref={(element) => {
              handles.current[edge] = element;
            }}
            className="ratingRangeHandle"
            type="button"
            role="slider"
            aria-label={edge === 0 ? "Range start" : "Range end"}
            aria-valuemin={edge === 0 ? min : from}
            aria-valuemax={edge === 0 ? to : max}
            aria-valuenow={edge === 0 ? from : to}
            aria-valuetext={formatMonth(edge === 0 ? from : to)}
            aria-orientation="horizontal"
            disabled={min === max}
            style={{ left: `${position(edge === 0 ? from : to)}%` }}
            onKeyDown={(event) => {
              const value = edge === 0 ? from : to;
              const next = {
                ArrowLeft: value - 1,
                ArrowDown: value - 1,
                ArrowRight: value + 1,
                ArrowUp: value + 1,
                PageDown: value - 12,
                PageUp: value + 12,
                Home: edge === 0 ? min : from,
                End: edge === 0 ? to : max,
              }[event.key];
              if (next !== undefined) {
                event.preventDefault();
                update(next, edge);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
};
