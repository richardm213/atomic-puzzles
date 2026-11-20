import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const PuzzleResignConfirmation = ({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) => (
  <div className="puzzleResignConfirm" role="group" aria-label="Resignation confirmation">
    <strong>Resign?</strong>
    <button type="button" onClick={onConfirm} aria-label="Confirm resignation">
      <FontAwesomeIcon icon={faCheck} aria-hidden="true" /> Confirm
    </button>
    <button type="button" onClick={onCancel} aria-label="Cancel resignation">
      <FontAwesomeIcon icon={faXmark} aria-hidden="true" /> Cancel
    </button>
  </div>
);
