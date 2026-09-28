import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { FormEvent, Ref } from "react";

import type { PuzzleIssueCategory } from "../../lib/puzzles/puzzleIssues";

export type PuzzleIssueStatus =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "success" }
  | { state: "error"; message: string };

type PuzzleIssueDialogProps = {
  dialogRef: Ref<HTMLDialogElement>;
  signedIn: boolean;
  category: PuzzleIssueCategory;
  details: string;
  status: PuzzleIssueStatus;
  onCategoryChange: (category: PuzzleIssueCategory) => void;
  onDetailsChange: (details: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onLogin: () => void;
};

export const PuzzleIssueDialog = ({
  dialogRef,
  signedIn,
  category,
  details,
  status,
  onCategoryChange,
  onDetailsChange,
  onClose,
  onSubmit,
  onLogin,
}: PuzzleIssueDialogProps) => (
  <dialog
    ref={dialogRef}
    className="puzzleIssueDialog"
    aria-labelledby="puzzle-issue-dialog-title"
    onCancel={(event) => {
      event.preventDefault();
      onClose();
    }}
  >
    <div className="puzzleIssueDialogCard">
      <header className="puzzleIssueDialogHeading">
        <h2 id="puzzle-issue-dialog-title">Report puzzle issue</h2>
        <button type="button" onClick={onClose} aria-label="Close issue report">
          <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
        </button>
      </header>
      {status.state === "success" ? (
        <div className="puzzleIssueSuccess" role="status">
          <strong>Report sent</strong>
          <p>Thanks. The puzzle will be reviewed.</p>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      ) : signedIn ? (
        <form className="puzzleIssueForm" onSubmit={onSubmit}>
          <fieldset disabled={status.state === "submitting"}>
            <legend>What’s wrong?</legend>
            {(
              [
                ["missing_alternate_solution", "Missing alternate solution"],
                ["incorrect_solution", "Incorrect solution"],
                ["other", "Other"],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="puzzle-issue-category"
                  value={value}
                  checked={category === value}
                  onChange={() => onCategoryChange(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <label className="puzzleIssueDetailsField">
            <span>Details {category === "other" ? "(required)" : "(optional)"}</span>
            <textarea
              rows={4}
              maxLength={2000}
              required={category === "other"}
              value={details}
              disabled={status.state === "submitting"}
              onChange={(event) => onDetailsChange(event.target.value)}
              placeholder="Include the move or line that needs review."
            />
          </label>
          {status.state === "error" ? (
            <p className="puzzleIssueFormError" role="alert">
              {status.message}
            </p>
          ) : null}
          <div className="puzzleIssueFormActions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={status.state === "submitting"}>
              {status.state === "submitting" ? "Sending…" : "Send report"}
            </button>
          </div>
        </form>
      ) : (
        <div className="puzzleIssueLogin">
          <p>Log in with Lichess to send this report.</p>
          <button type="button" onClick={onLogin}>
            Log in with Lichess
          </button>
        </div>
      )}
    </div>
  </dialog>
);
