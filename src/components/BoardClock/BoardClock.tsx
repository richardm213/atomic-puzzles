import "./BoardClock.css";

export const BoardClock = ({
  value,
  ariaLabel,
  active = false,
  expired = false,
}: {
  value: string;
  ariaLabel: string;
  active?: boolean;
  expired?: boolean;
}) => (
  <div className={`boardClockRow${active ? " active" : ""}${expired ? " expired" : ""}`}>
    <time className="boardClock" aria-label={ariaLabel}>
      {value}
    </time>
  </div>
);
