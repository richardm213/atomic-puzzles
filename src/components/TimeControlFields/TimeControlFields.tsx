import "./TimeControlFields.css";

export type TimeControlFieldsProps = {
  initialId: string;
  incrementId: string;
  initialValue: string;
  incrementValue: string;
  initialOptions?: readonly (string | number)[];
  incrementOptions?: readonly (string | number)[];
  onInitialChange: (value: string) => void;
  onIncrementChange: (value: string) => void;
  startDateId: string;
  endDateId: string;
  startDateValue: string;
  endDateValue: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  controlStyle?: "select" | "compact-input";
};

export const TimeControlFields = ({
  initialId,
  incrementId,
  initialValue,
  incrementValue,
  initialOptions = [],
  incrementOptions = [],
  onInitialChange,
  onIncrementChange,
  startDateId,
  endDateId,
  startDateValue,
  endDateValue,
  onStartDateChange,
  onEndDateChange,
  controlStyle = "select",
}: TimeControlFieldsProps) => {
  const handleNumericInput = (value: string, onChange: (next: string) => void): void => {
    if (value !== "." && /^\d*(?:\.\d*)?$/.test(value)) onChange(value || "all");
  };

  return (
    <>
      {controlStyle === "compact-input" ? (
        <div className="timeControlCompactField">
          <span className="timeControlCompactLabel">Time control (sec)</span>
          <div
            className="timeControlCompactInputs"
            role="group"
            aria-label="Time control in seconds"
          >
            <input
              id={initialId}
              type="text"
              inputMode="decimal"
              value={initialValue === "all" ? "" : initialValue}
              onChange={(event) => handleNumericInput(event.target.value, onInitialChange)}
              placeholder="Any"
              aria-label="Initial seconds"
            />
            <span aria-hidden="true">+</span>
            <input
              id={incrementId}
              type="text"
              inputMode="decimal"
              value={incrementValue === "all" ? "" : incrementValue}
              onChange={(event) => handleNumericInput(event.target.value, onIncrementChange)}
              placeholder="Any"
              aria-label="Increment seconds"
            />
          </div>
        </div>
      ) : (
        <>
          <label htmlFor={initialId}>
            Initial (sec)
            <select
              id={initialId}
              value={initialValue}
              onChange={(event) => onInitialChange(event.target.value)}
            >
              <option value="all">All</option>
              {initialOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={incrementId}>
            Increment (sec)
            <select
              id={incrementId}
              value={incrementValue}
              onChange={(event) => onIncrementChange(event.target.value)}
            >
              <option value="all">All</option>
              {incrementOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label htmlFor={startDateId}>
        From
        <input
          id={startDateId}
          type="date"
          value={startDateValue}
          onChange={(event) => onStartDateChange(event.target.value)}
        />
      </label>
      <label htmlFor={endDateId}>
        To
        <input
          id={endDateId}
          type="date"
          value={endDateValue}
          min={startDateValue || undefined}
          onChange={(event) => onEndDateChange(event.target.value)}
        />
      </label>
    </>
  );
};
