import { faBolt, faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
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
  sourceLink?: { href: string; label: string };
  atomicDbHref: string | null;
  atomicDbRequest?: {
    state: "idle" | "requested" | "error";
    message?: string;
    onRequest: () => void;
  };
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
  sourceLink,
  atomicDbHref,
  atomicDbRequest,
  actionClassName,
  secondaryAction,
  document,
}: BoardWorkspaceProps) => {
  const primarySourceLink = sourceLink ?? { href: lichessHref, label: "View on Lichess" };
  const lichessLink = (
    <a
      className="analysisLichessLink"
      href={primarySourceLink.href}
      target="_blank"
      rel="noreferrer"
    >
      <FontAwesomeIcon icon={faExternalLinkAlt} />
      <span>{primarySourceLink.label}</span>
    </a>
  );
  const atomicDbAction = atomicDbHref ? (
    <a
      className="analysisLichessLink analysisAtomicDbLink"
      href={atomicDbHref}
      target="_blank"
      rel="noreferrer"
    >
      <FontAwesomeIcon icon={faExternalLinkAlt} />
      <span>View on AtomicDB</span>
    </a>
  ) : atomicDbRequest ? (
    <button
      type="button"
      className="analysisLichessLink analysisAtomicDbLink"
      aria-live="polite"
      disabled={atomicDbRequest.state === "requested"}
      onClick={atomicDbRequest.onRequest}
    >
      <FontAwesomeIcon icon={faBolt} />
      <span>
        {atomicDbRequest.state === "requested"
          ? "Analysis requested"
          : atomicDbRequest.state === "error"
            ? "Retry analysis request"
            : "Request analysis"}
      </span>
    </button>
  ) : (
    <span
      className="analysisLichessLink analysisAtomicDbLink"
      aria-disabled="true"
      title="AtomicDB position unavailable"
    >
      <FontAwesomeIcon icon={faExternalLinkAlt} />
      <span>View on AtomicDB</span>
    </span>
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
        <div className={actionClassName ?? "analysisBoardActions"}>
          {lichessLink}
          {atomicDbAction}
          {atomicDbRequest?.state === "error" && atomicDbRequest.message ? (
            <span className="analysisAtomicDbRequestMessage" role="alert">
              {atomicDbRequest.message}
            </span>
          ) : null}
          {secondaryAction}
        </div>
        <DocumentField label="FEN" rows={2} field={document.fen} />
        <DocumentField label="PGN" rows={3} field={document.pgn} />
      </div>
    </div>
  );
};
