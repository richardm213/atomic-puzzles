import "./PuzzleMotifRename.css";

import { faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { PuzzleMotif } from "../../lib/puzzles/puzzleMotifs";
import {
  PUZZLE_MOTIF_NAME_MAX_LENGTH,
  usePuzzleMotifNames,
} from "../../lib/puzzles/usePuzzleMotifNames";

type RenameProps = {
  motif: PuzzleMotif;
  name: string;
};

const RenameDialog = ({ motif, name, onClose }: RenameProps & { onClose: () => void }) => {
  const { saveName } = usePuzzleMotifNames();
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => dialog?.close();
  }, []);

  const close = () => {
    dialogRef.current?.close();
    onClose();
  };

  const save = (value: string | null) => {
    if (saveName(motif.tag, value)) close();
    else setError("Couldn’t save your name. Check that browser storage is enabled and try again.");
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="motifRenameDialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-scope`}
      onCancel={(event) => {
        event.stopPropagation();
        event.preventDefault();
        close();
      }}
    >
      <form
        className="motifRenameForm"
        onSubmit={(event) => {
          event.stopPropagation();
          event.preventDefault();
          if (draft.trim() && draft.trim() !== name) save(draft);
        }}
      >
        <div>
          <h2 id={`${id}-title`}>Rename tag</h2>
          <p id={`${id}-scope`}>Only you see this name, and only in this browser.</p>
        </div>

        <div className="motifRenameField">
          <label htmlFor={`${id}-name`}>Your name for {motif.name}</label>
          <input
            ref={inputRef}
            id={`${id}-name`}
            type="text"
            required
            maxLength={PUZZLE_MOTIF_NAME_MAX_LENGTH}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
          />
          {error ? <p role="alert">{error}</p> : null}
        </div>

        <div className="motifRenameActions">
          {name !== motif.name ? (
            <button type="button" className="motifRenameReset" onClick={() => save(null)}>
              Use default
            </button>
          ) : null}
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            className="motifRenameSave"
            disabled={!draft.trim() || draft.trim() === name}
          >
            Save name
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
};

export const PuzzleMotifRename = ({
  motif,
  name,
  showLabel = false,
  onFocusFallback,
}: RenameProps & { showLabel?: boolean; onFocusFallback?: () => void }) => {
  const [editing, setEditing] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={triggerRef}
        className="motifRenameTrigger"
        type="button"
        aria-label={`Rename ${name}`}
        aria-haspopup="dialog"
        title={showLabel ? undefined : "Rename tag"}
        onClick={() => setEditing(true)}
      >
        <FontAwesomeIcon icon={faPencil} aria-hidden="true" />
        {showLabel ? "Rename" : null}
      </button>
      {editing ? (
        <RenameDialog
          motif={motif}
          name={name}
          onClose={() => {
            setEditing(false);
            requestAnimationFrame(() => {
              if (triggerRef.current?.isConnected) triggerRef.current.focus();
              else onFocusFallback?.();
            });
          }}
        />
      ) : null}
    </>
  );
};
