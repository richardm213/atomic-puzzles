import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const percentBetween = (value: number, min: number, max: number): number =>
  ((value - min) / (max - min)) * 100;

const roundToStep = (value: number, min: number, step: number): number => {
  const steppedValue = Math.round((value - min) / step) * step + min;
  return Number(steppedValue.toFixed(6));
};

type Thumb = "lower" | "upper";

export type DualRangeSliderProps = {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  lowerValue: number;
  upperValue: number;
  onLowerChange: (value: number) => void;
  onUpperChange: (value: number) => void;
};

export const DualRangeSlider = ({
  id,
  label,
  min,
  max,
  step = 1,
  lowerValue,
  upperValue,
  onLowerChange,
  onUpperChange,
}: DualRangeSliderProps) => {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [activeThumb, setActiveThumb] = useState<Thumb | null>(null);

  const lowerPercent = percentBetween(lowerValue, min, max);
  const upperPercent = percentBetween(upperValue, min, max);

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const sliderElement = sliderRef.current;
      if (!sliderElement) {
        return min;
      }

      const rect = sliderElement.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const rawValue = min + ratio * (max - min);
      return clamp(roundToStep(rawValue, min, step), min, max);
    },
    [max, min, step],
  );

  const updateFromPointer = useCallback(
    (thumb: Thumb, clientX: number): void => {
      const nextValue = valueFromClientX(clientX);

      if (thumb === "lower") {
        onLowerChange(Math.min(nextValue, upperValue));
        return;
      }

      onUpperChange(Math.max(nextValue, lowerValue));
    },
    [lowerValue, onLowerChange, onUpperChange, upperValue, valueFromClientX],
  );

  useEffect(() => {
    if (!activeThumb) {
      return undefined;
    }

    const handlePointerMove = (event: globalThis.PointerEvent): void => {
      updateFromPointer(activeThumb, event.clientX);
    };

    const handlePointerUp = (): void => {
      setActiveThumb(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeThumb, updateFromPointer]);

  const startDrag = (thumb: Thumb, event: PointerEvent<HTMLElement>): void => {
    event.preventDefault();
    setActiveThumb(thumb);
    updateFromPointer(thumb, event.clientX);
  };

  const handleTrackPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    const nextValue = valueFromClientX(event.clientX);
    const lowerDistance = Math.abs(nextValue - lowerValue);
    const upperDistance = Math.abs(nextValue - upperValue);
    const thumb: Thumb = lowerDistance <= upperDistance ? "lower" : "upper";

    startDrag(thumb, event);
  };

  const handleKeyDown = (thumb: Thumb, event: KeyboardEvent<HTMLButtonElement>): void => {
    const direction = ["ArrowRight", "ArrowUp"].includes(event.key)
      ? 1
      : ["ArrowLeft", "ArrowDown"].includes(event.key)
        ? -1
        : 0;

    if (direction === 0) {
      return;
    }

    event.preventDefault();

    if (thumb === "lower") {
      onLowerChange(clamp(lowerValue + direction * step, min, upperValue));
      return;
    }

    onUpperChange(clamp(upperValue + direction * step, lowerValue, max));
  };

  return (
    <div className="opponentRatingFilter rangeFilter">
      <label htmlFor={id}>{label}</label>
      <div ref={sliderRef} className="dualRangeSlider" onPointerDown={handleTrackPointerDown}>
        <div className="dualRangeTrack" />
        <div
          className="dualRangeSelected"
          style={{
            left: `${lowerPercent}%`,
            right: `${100 - upperPercent}%`,
          }}
        />
        <button
          id={id}
          type="button"
          role="slider"
          className={`dualRangeHandle${activeThumb === "lower" ? " dualRangeHandleActive" : ""}`}
          style={{ left: `${lowerPercent}%` }}
          aria-label={`${label} minimum`}
          aria-valuemin={min}
          aria-valuemax={upperValue}
          aria-valuenow={lowerValue}
          onKeyDown={(event) => handleKeyDown("lower", event)}
          onPointerDown={(event) => {
            event.stopPropagation();
            startDrag("lower", event);
          }}
        />
        <button
          type="button"
          role="slider"
          className={`dualRangeHandle${activeThumb === "upper" ? " dualRangeHandleActive" : ""}`}
          style={{ left: `${upperPercent}%` }}
          aria-label={`${label} maximum`}
          aria-valuemin={lowerValue}
          aria-valuemax={max}
          aria-valuenow={upperValue}
          onKeyDown={(event) => handleKeyDown("upper", event)}
          onPointerDown={(event) => {
            event.stopPropagation();
            startDrag("upper", event);
          }}
        />
      </div>
    </div>
  );
};
