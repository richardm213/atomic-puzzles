import "./BoardClock.css";

import type { Ref } from "react";

import type { MaterialCount } from "../../lib/chess/materialCount";
import { MaterialDifferencePieces } from "../MaterialDifferencePieces/MaterialDifferencePieces";

export const BoardClock = ({
  value,
  ariaLabel,
  active = false,
  expired = false,
  rowRef,
  material,
  color,
}: {
  value?: string | undefined;
  ariaLabel?: string | undefined;
  color: "white" | "black";
  active?: boolean;
  expired?: boolean;
  rowRef?: Ref<HTMLDivElement> | undefined;
  material?: MaterialCount;
}) => {
  const pieces = color === "white" ? material?.whitePieces : material?.blackPieces;
  return (
    <div
      ref={rowRef}
      className={`boardClockRow${active ? " active" : ""}${expired ? " expired" : ""}`}
    >
      {pieces?.length ? (
        <span className="boardClockMaterial">
          <MaterialDifferencePieces pieces={pieces} side={color} compact />
        </span>
      ) : null}
      {value !== undefined ? (
        <time className="boardClock" aria-label={ariaLabel}>
          {value}
        </time>
      ) : null}
    </div>
  );
};
