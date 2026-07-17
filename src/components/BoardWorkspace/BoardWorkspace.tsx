import { faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ComponentProps, MutableRefObject, ReactNode } from "react";

import type { BoardDocument } from "../../hooks/useBoardDocument";
import { Chessboard } from "../Chessboard/Chessboard";

type BoardWorkspaceProps = {
  className?: string;
  boardPanelRef: MutableRefObject<HTMLDivElement | null>;
  boardAriaLabel: string;
  boardTabIndex?: number;
  chessboardProps: ComponentProps<typeof Chessboard>;
  boardOverlay?: ReactNode;
  lichessHref: string;
  actionClassName?: string;
  secondaryAction?: ReactNode;
  document: BoardDocument;
};

const DocumentField = ({
  label,
  rows,
  field,
}: {
  label: "FEN" | "PGN";
  rows: number;
  field: BoardDocument["fen"];
}) => {
  const { error, ...textareaProps } = field;
  return (
    <div
      className={`${label === "FEN" ? "analysisFenBox" : "analysisPgnBox"} analysisTextBox`}
      aria-label={label === "PGN" ? label : undefined}
    >
      <span>{label}</span>
      <textarea
        {...textareaProps}
        rows={rows}
        spellCheck={false}
        aria-label={label}
        aria-invalid={Boolean(error)}
      />
      {error ? <small className="analysisTextBoxError">{error}</small> : null}
    </div>
  );
};

export const BoardWorkspace = ({
  className = "",
  boardPanelRef,
  boardAriaLabel,
  boardTabIndex,
  chessboardProps,
  boardOverlay,
  lichessHref,
  actionClassName,
  secondaryAction,
  document,
}: BoardWorkspaceProps) => {
  const lichessLink = (
    <a className="analysisLichessLink" href={lichessHref} target="_blank" rel="noreferrer">
      <FontAwesomeIcon icon={faExternalLinkAlt} />
      <span>View on Lichess</span>
    </a>
  );

  return (
    <div className={`analysisBoardColumn ${className}`.trim()}>
      <div
        ref={boardPanelRef}
        className="analysisBoardPanel"
        aria-label={boardAriaLabel}
        tabIndex={boardTabIndex}
      >
        <Chessboard {...chessboardProps} />
        {boardOverlay}
      </div>
      <div className="analysisBoardTextPanel">
        {actionClassName ? (
          <div className={actionClassName}>
            {lichessLink}
            {secondaryAction}
          </div>
        ) : (
          <>
            {lichessLink}
            {secondaryAction}
          </>
        )}
        <DocumentField label="FEN" rows={2} field={document.fen} />
        <DocumentField label="PGN" rows={3} field={document.pgn} />
      </div>
    </div>
  );
};
