import { faBolt, faExternalLinkAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  type ComponentProps,
  type MutableRefObject,
  type ReactNode,
  type Ref,
  useMemo,
} from "react";

import type { BoardDocument } from "../../hooks/useBoardDocument";
import { materialCountFromFen } from "../../lib/chess/materialCount";
import { BoardClock } from "../BoardClock/BoardClock";
import { Chessboard } from "../Chessboard/Chessboard";

type BoardClockProps = ComponentProps<typeof BoardClock>;
type BoardColor = BoardClockProps["color"];

type BoardWorkspaceProps = {
  className?: string;
  boardPanelRef: MutableRefObject<HTMLDivElement | null>;
  boardAriaLabel: string;
  boardTabIndex?: number;
  chessboardProps: ComponentProps<typeof Chessboard>;
  draftChessboardProps?: ComponentProps<typeof Chessboard> | undefined;
  positionStatus: {
    fen: string;
    lowerRowRef?: Ref<HTMLDivElement>;
    clockFor?: (color: BoardColor) => Omit<BoardClockProps, "color" | "material" | "rowRef">;
  };
  boardAfter?: ReactNode;
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
  document: Pick<BoardDocument, "fen" | "pgn">;
  showDocument?: boolean;
  showActions?: boolean;
};

export const DocumentField = ({
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
  draftChessboardProps,
  positionStatus: { fen: statusFen, lowerRowRef, clockFor },
  boardAfter,
  boardOverlay,
  lichessHref,
  sourceLink,
  atomicDbHref,
  atomicDbRequest,
  actionClassName,
  secondaryAction,
  document,
  showDocument = true,
  showActions = true,
}: BoardWorkspaceProps) => {
  const material = useMemo(() => materialCountFromFen(statusFen), [statusFen]);
  const lowerColor = draftChessboardProps?.orientation ?? chessboardProps.orientation ?? "white";
  const upperColor = lowerColor === "white" ? "black" : "white";
  const statusRow = (color: BoardColor) => (
    <BoardClock
      color={color}
      material={material}
      rowRef={color === lowerColor ? lowerRowRef : undefined}
      {...clockFor?.(color)}
    />
  );

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
      {statusRow(upperColor)}
      <div
        ref={boardPanelRef}
        className="analysisBoardPanel"
        aria-label={boardAriaLabel}
        tabIndex={boardTabIndex}
      >
        {/* Keep the original move tree mounted while the draft uses its own board. */}
        <Chessboard
          {...chessboardProps}
          dimensionsRef={boardPanelRef}
          {...(draftChessboardProps
            ? { hidden: true, disabled: true, enableNavigationShortcuts: false }
            : {})}
        />
        {draftChessboardProps ? (
          <Chessboard {...draftChessboardProps} dimensionsRef={boardPanelRef} />
        ) : null}
        {boardOverlay}
      </div>
      {statusRow(lowerColor)}
      {boardAfter}
      {showActions || showDocument ? (
        <div className="analysisBoardTextPanel">
          {showActions ? (
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
          ) : null}
          {showDocument ? (
            <>
              <DocumentField label="FEN" rows={2} field={document.fen} />
              <DocumentField label="PGN" rows={3} field={document.pgn} />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
