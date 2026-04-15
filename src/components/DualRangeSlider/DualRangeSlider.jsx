const percentBetween = (value, min, max) => ((value - min) / (max - min)) * 100;

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
}) => (
  <div className="opponentRatingFilter">
    <label htmlFor={id}>{label}</label>
    <div className="dualRangeSlider">
      <div className="dualRangeTrack" />
      <div
        className="dualRangeSelected"
        style={{
          left: `${percentBetween(lowerValue, min, max)}%`,
          right: `${100 - percentBetween(upperValue, min, max)}%`,
        }}
      />
      <input
        id={id}
        className="dualRangeInput"
        type="range"
        min={min}
        max={max}
        step={step}
        value={lowerValue}
        onChange={(event) => onLowerChange(Math.min(Number(event.target.value), upperValue))}
      />
      <input
        className="dualRangeInput"
        type="range"
        min={min}
        max={max}
        step={step}
        value={upperValue}
        onChange={(event) => onUpperChange(Math.max(Number(event.target.value), lowerValue))}
      />
    </div>
  </div>
);
