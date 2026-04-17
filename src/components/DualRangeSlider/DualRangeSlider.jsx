import { useEffect, useRef, useState } from "react";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const percentBetween = (value, min, max) => ((value - min) / (max - min)) * 100;

const roundToStep = (value, min, step) => {
  const steppedValue = Math.round((value - min) / step) * step + min;
  return Number(steppedValue.toFixed(6));
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
}) => {
  const sliderRef = useRef(null);
  const [activeThumb, setActiveThumb] = useState(null);

  const lowerPercent = percentBetween(lowerValue, min, max);
  const upperPercent = percentBetween(upperValue, min, max);

  const valueFromClientX = (clientX) => {
    const sliderElement = sliderRef.current;
    if (!sliderElement) {
      return min;
    }

    const rect = sliderElement.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const rawValue = min + ratio * (max - min);
    return clamp(roundToStep(rawValue, min, step), min, max);
  };

  const updateFromPointer = (thumb, clientX) => {
    const nextValue = valueFromClientX(clientX);

    if (thumb === "lower") {
      onLowerChange(Math.min(nextValue, upperValue));
      return;
    }

    onUpperChange(Math.max(nextValue, lowerValue));
  };

  useEffect(() => {
    if (!activeThumb) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      updateFromPointer(activeThumb, event.clientX);
    };

    const handlePointerUp = () => {
      setActiveThumb(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [activeThumb, lowerValue, upperValue]);

  const startDrag = (thumb, event) => {
    event.preventDefault();
    setActiveThumb(thumb);
    updateFromPointer(thumb, event.clientX);
  };

  const handleTrackPointerDown = (event) => {
    const nextValue = valueFromClientX(event.clientX);
    const lowerDistance = Math.abs(nextValue - lowerValue);
    const upperDistance = Math.abs(nextValue - upperValue);
    const thumb = lowerDistance <= upperDistance ? "lower" : "upper";

    startDrag(thumb, event);
  };

  const handleKeyDown = (thumb, event) => {
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
      <div
        ref={sliderRef}
        className="dualRangeSlider"
        onPointerDown={handleTrackPointerDown}
      >
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
