import { parseFen } from "chessops/fen";
import type { Role, SquareName } from "chessops/types";
import { parseSquare, squareFile, squareRank } from "chessops/util";
import { useId } from "react";

import { getBoardThemeColors, getDefaultBoardTheme } from "../../context/AppSettings";

const pieceCodes: Record<Role, string> = {
  pawn: "P",
  knight: "N",
  bishop: "B",
  rook: "R",
  queen: "Q",
  king: "K",
};
const sprite = "/images/home-puzzles/cburnett.svg";
const cell = 45;
const size = 8 * cell;
const { light, dark } = getBoardThemeColors(getDefaultBoardTheme("default"));
const files = "abcdefgh";

type DiagramPanel = {
  title: string;
  fen: string;
  description: string;
  blast?: SquareName;
  marked?: SquareName;
};

const boardPoint = (square: number) => ({
  x: squareFile(square) * cell,
  y: (7 - squareRank(square)) * cell,
});

const GuideBoardDiagram = ({ fen, description, blast, marked }: DiagramPanel) => {
  const patternId = useId();
  const { board } = parseFen(fen).unwrap();
  const blastSquare = blast && boardPoint(parseSquare(blast));
  const markedSquare = marked && boardPoint(parseSquare(marked));
  const blastX = blastSquare ? Math.max(0, blastSquare.x - cell) : 0;
  const blastY = blastSquare ? Math.max(0, blastSquare.y - cell) : 0;

  return (
    <svg
      className="atomicChessDiagram"
      viewBox="-22 0 382 382"
      role="img"
      aria-label={description}
      focusable="false"
    >
      <defs>
        <pattern id={patternId} width="90" height="90" patternUnits="userSpaceOnUse">
          <rect width="90" height="90" fill={light} />
          <path d="M45 0h45v45H45zM0 45h45v45H0z" fill={dark} />
        </pattern>
      </defs>
      <rect width={size} height={size} fill={`url(#${patternId})`} />
      <foreignObject width={size} height={size} aria-hidden="true">
        <div className="atomicChessDiagramBoard" />
      </foreignObject>
      {blastSquare && (
        <g stroke="#7d241a" strokeWidth="3">
          <rect
            x={blastX + 1.5}
            y={blastY + 1.5}
            width={Math.min(size, blastSquare.x + 2 * cell) - blastX - 3}
            height={Math.min(size, blastSquare.y + 2 * cell) - blastY - 3}
            fill="#a33a2e"
            fillOpacity="0.16"
            strokeDasharray="8 5"
          />
          <rect
            x={blastSquare.x + 2}
            y={blastSquare.y + 2}
            width={cell - 4}
            height={cell - 4}
            fill="none"
          />
        </g>
      )}
      {Array.from(board, ([square, piece]) => (
        <use
          key={square}
          href={`${sprite}#${piece.color === "white" ? "w" : "b"}${pieceCodes[piece.role]}`}
          {...boardPoint(square)}
          width={cell}
          height={cell}
        />
      ))}
      {markedSquare && (
        <rect
          x={markedSquare.x + 4}
          y={markedSquare.y + 4}
          width={cell - 8}
          height={cell - 8}
          rx="4"
          stroke="#164669"
          strokeWidth="3"
          fill="none"
        />
      )}
      <g fill="currentColor" fontSize="15" textAnchor="middle" aria-hidden="true">
        {Array.from(files, (file, index) => (
          <g key={file}>
            <text x={index * cell + cell / 2} y={size + 16}>
              {file}
            </text>
            <text x="-12" y={index * cell + cell / 2 + 5}>
              {8 - index}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
};

export const GuideBoardFigure = ({
  panels,
  caption,
}: {
  panels: readonly DiagramPanel[];
  caption: string;
}) => (
  <figure className="atomicChessBoardFigure">
    <div className="atomicChessBoardPanels">
      {panels.map((panel) => (
        <div key={panel.title}>
          <p className="atomicChessBoardLabel">{panel.title}</p>
          <GuideBoardDiagram {...panel} />
        </div>
      ))}
    </div>
    <figcaption>{caption}</figcaption>
  </figure>
);
