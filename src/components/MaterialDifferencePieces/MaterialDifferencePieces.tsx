import "./MaterialDifferencePieces.css";

import { useMemo } from "react";

import { useAppSettings } from "../../context/AppSettings";
import type { MaterialPieceRole } from "../../lib/chess/materialCount";
import { buildPieceStyle } from "../Chessboard/boardStyle";

export const MaterialDifferencePieces = ({
  pieces,
  side,
  compact = false,
  showEmpty = false,
}: {
  pieces: readonly MaterialPieceRole[];
  side?: "white" | "black";
  compact?: boolean;
  showEmpty?: boolean;
}) => {
  const { pieceSet } = useAppSettings();
  const pieceStyle = useMemo(() => buildPieceStyle(pieceSet || "cburnett"), [pieceSet]);
  const subject =
    side === "white" ? "White material" : side === "black" ? "Black material" : "Material";
  const materialStatus = pieces.length ? pieces.join(", ") : "no extra material";
  const label = `${subject} difference: ${materialStatus}`;
  const visible = pieces.length > 0 || showEmpty;

  return (
    <span
      className={`materialDifferencePieces${pieces.length ? "" : " isEmpty"}${compact ? " compact" : ""}`}
      style={pieceStyle}
      role={visible ? "img" : undefined}
      aria-label={visible ? label : undefined}
      aria-hidden={visible ? undefined : true}
      title={compact || showEmpty ? label : undefined}
    >
      {pieces.map((role, index) => (
        <span
          className={`materialDifferencePiece ${role}`}
          style={{
            maskImage: `var(--cg-piece-white-${role})`,
            WebkitMaskImage: `var(--cg-piece-white-${role})`,
          }}
          aria-hidden="true"
          key={`${role}-${index}`}
        />
      ))}
      {showEmpty && !pieces.length ? <span aria-hidden="true">—</span> : null}
    </span>
  );
};
