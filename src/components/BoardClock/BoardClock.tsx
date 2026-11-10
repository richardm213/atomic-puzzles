import "./BoardClock.css";

import type { Ref } from "react";

import type { MaterialPieceRole } from "../../lib/chess/materialCount";
import { MaterialDifferencePieces } from "../MaterialDifferencePieces/MaterialDifferencePieces";

export const BoardClock = ({
  value,
  ariaLabel,
  active = false,
  expired = false,
  rowRef,
  material,
}: {
  value: string;
  ariaLabel: string;
  active?: boolean;
  expired?: boolean;
  rowRef?: Ref<HTMLDivElement> | undefined;
  material?: { side: "white" | "black"; pieces: readonly MaterialPieceRole[] };
}) => (
  <div
    ref={rowRef}
    className={`boardClockRow${active ? " active" : ""}${expired ? " expired" : ""}`}
  >
    {material?.pieces.length ? (
      <span className="boardClockMaterial">
        <MaterialDifferencePieces pieces={material.pieces} side={material.side} compact />
      </span>
    ) : null}
    <time className="boardClock" aria-label={ariaLabel}>
      {value}
    </time>
  </div>
);
