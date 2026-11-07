import "./ShareExportPanel.css";

import { faCheck, faClipboard } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ReactNode } from "react";
import { useState } from "react";

import type { BoardDocument } from "../../hooks/useBoardDocument";
import { copyTextToClipboard } from "../../utils/clipboard";

const CopyButton = ({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) => {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const statusLabel = status === "copied" ? "Copied" : status === "error" ? "Copy failed" : label;
  return (
    <button
      type="button"
      className={compact ? "shareExportCopyButton" : undefined}
      aria-label={statusLabel}
      title={statusLabel}
      onClick={() =>
        void copyTextToClipboard(value).then((copied) => setStatus(copied ? "copied" : "error"))
      }
    >
      {compact ? (
        <FontAwesomeIcon icon={status === "copied" ? faCheck : faClipboard} />
      ) : (
        statusLabel
      )}
    </button>
  );
};

const ShareDocumentField = ({
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
    <div className={`shareExportDocumentRow ${label === "PGN" ? "shareExportPgnRow" : ""}`}>
      <div className="shareExportDocumentHeader">
        <span>{label}</span>
        <CopyButton label={`Copy ${label}`} value={String(field.value ?? "")} compact />
      </div>
      <textarea
        {...textareaProps}
        rows={rows}
        spellCheck={false}
        aria-label={label}
        aria-invalid={Boolean(error)}
      />
      {error ? (
        <small className="shareExportDocumentError" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
};

export const ShareExportPanel = ({
  actions,
  className = "",
  document,
  error,
  fileName,
  title,
}: {
  actions?: ReactNode;
  className?: string;
  document: BoardDocument;
  error?: string;
  fileName: string;
  title?: string;
}) => {
  const pgn = String(document.pgn.value ?? "");
  const downloadPgn = (): void => {
    const url = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
    const link = window.document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      className={`shareExportPanel ${className}`.trim()}
      aria-label={title ?? "Share and export"}
    >
      {title ? <h2>{title}</h2> : null}
      <div className="shareExportActions">
        {actions}
        <CopyButton label="Copy PGN" value={pgn} />
        <button type="button" onClick={downloadPgn} disabled={!pgn}>
          Download PGN
        </button>
      </div>
      {error ? (
        <p className="shareExportError" role="alert">
          {error}
        </p>
      ) : null}
      <ShareDocumentField label="FEN" rows={1} field={document.fen} />
      <ShareDocumentField label="PGN" rows={4} field={document.pgn} />
    </section>
  );
};
