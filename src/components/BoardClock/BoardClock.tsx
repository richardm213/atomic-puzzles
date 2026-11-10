import "./BoardClock.css";

import type { Ref } from "react";

export const BoardClock = ({
  value,
  ariaLabel,
  active = false,
  expired = false,
  rowRef,
}: {
  value: string;
  ariaLabel: string;
  active?: boolean;
  expired?: boolean;
  rowRef?: Ref<HTMLDivElement> | undefined;
}) => (
  <div
    ref={rowRef}
    className={`boardClockRow${active ? " active" : ""}${expired ? " expired" : ""}`}
  >
    <time className="boardClock" aria-label={ariaLabel}>
      {value}
    </time>
  </div>
);
